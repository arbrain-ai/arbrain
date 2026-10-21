-- One record per owner/day/habit. NULL means explicitly cleared, retaining a
-- revision so delayed retries/diary evidence cannot resurrect a removed check.
-- Existing true/false values and created_at remain unchanged.
begin;
alter table public.sistema_checks alter column hecho drop not null;
alter table public.sistema_checks
  add column revision bigint not null default 0,
  add column updated_at timestamptz,
  add column source text not null default 'legacy',
  add column evidence text,
  add column request_id uuid;

-- Also version older REST writers. Unknown provenance stays unknown; historical
-- created_at is not presented as the timestamp of the last correction.
create function public.sistema_check_stamp_v1() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if TG_OP = 'UPDATE' then
    new.revision := old.revision + 1;
    if new.request_id is not distinct from old.request_id then
      new.request_id := null;
      new.source := 'legacy';
      new.evidence := null;
    end if;
  else
    new.revision := 1;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger sistema_check_stamp_v1 before insert or update on public.sistema_checks
for each row execute function public.sistema_check_stamp_v1();

create function public.sistema_write_check_v1(
  p_owner uuid, p_date date, p_key text, p_state boolean,
  p_request uuid, p_expected bigint, p_source text default 'manual', p_evidence text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  current_row public.sistema_checks%rowtype;
  result_row public.sistema_checks%rowtype;
begin
  if p_owner is null or p_date is null or p_key is null or p_request is null or p_expected is null or p_expected < 0
    or p_source is null or p_source not in ('manual','keyboard','conversation','diary','sfcal-import') then
    raise exception 'Invalid habit command';
  end if;
  if p_source in ('diary','sfcal-import') and (p_evidence is null or length(trim(p_evidence)) = 0) then
    raise exception 'Evidence required';
  end if;
  if not exists (select 1 from public.sistema_habitos where user_id = p_owner and clave = p_key) then
    return jsonb_build_object('error','unknown_habit','status',404);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || '/' || p_date::text || '/' || p_key, 0));
  select * into current_row from public.sistema_checks
    where user_id = p_owner and fecha = p_date and habito_clave = p_key for update;
  if current_row.request_id = p_request then
    if current_row.hecho is distinct from p_state or current_row.source <> p_source
      or current_row.evidence is distinct from p_evidence then
      return jsonb_build_object('error','request_reused','status',409);
    end if;
    return jsonb_build_object('ok',true,'replayed',true,'record',to_jsonb(current_row));
  end if;
  if coalesce(current_row.revision,0) <> p_expected then
    return jsonb_build_object('error','conflict','status',409,'record',to_jsonb(current_row));
  end if;
  -- Imported/evidenced observations never overrule a user's explicit mark or
  -- clearing. The conflict is surfaced for review instead of silently winning.
  if p_source in ('diary','sfcal-import') and current_row.source in ('manual','keyboard','conversation') then
    return jsonb_build_object('error','explicit_correction','status',409,'record',to_jsonb(current_row));
  end if;
  insert into public.sistema_checks(user_id,fecha,habito_clave,hecho,request_id,source,evidence)
    values(p_owner,p_date,p_key,p_state,p_request,p_source,p_evidence)
    on conflict (user_id,fecha,habito_clave) do update set
      hecho=excluded.hecho,request_id=excluded.request_id,source=excluded.source,evidence=excluded.evidence
    where sistema_checks.revision = p_expected
    returning * into result_row;
  if result_row.id is null then
    return jsonb_build_object('error','conflict','status',409);
  end if;
  return jsonb_build_object('ok',true,'record',to_jsonb(result_row));
end;
$$;
revoke all on function public.sistema_write_check_v1(uuid,date,text,boolean,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.sistema_write_check_v1(uuid,date,text,boolean,uuid,bigint,text,text) to service_role;
commit;
