-- Semáforo de conversaciones en el sidebar del chat (20 jul 2026)
-- Estado por sesión mantenido por TRIGGER: cualquier escritor de chat_messages
-- (eager save, guardado rico del cliente, webhook /complete del daemon, crons)
-- actualiza la sesión sin tocar código de app.

alter table public.chat_sessions
  add column if not exists last_role text,
  add column if not exists last_message_at timestamptz,
  add column if not exists last_read_at timestamptz,
  add column if not exists ends_question boolean not null default false;

create or replace function public.chat_session_bookkeeping() returns trigger
language plpgsql as $$
declare
  tail text;
  q boolean := false;
begin
  if new.role = 'assistant' then
    -- ¿El mensaje termina en pregunta? Se pela la cola de espacios/cierres
    -- markdown y se mira el último caracter real.
    tail := right(regexp_replace(coalesce(new.content, ''), '[\s*_"''`)\]]+$', ''), 1);
    q := tail in ('?', '？');
    -- Widget AskUserQuestion pendiente = necesita respuesta, aunque el texto
    -- no termine en '?'.
    if not q and new.metadata is not null then
      begin
        q := jsonb_path_exists(new.metadata, '$.questionPrompts[*] ? (@.status == "pending")');
      exception when others then
        q := false;
      end;
    end if;
  end if;

  update public.chat_sessions s
     set last_role       = new.role,
         last_message_at = coalesce(new.created_at, now()),
         ends_question   = case when new.role = 'assistant' then q else false end,
         updated_at      = greatest(coalesce(s.updated_at, 'epoch'::timestamptz), coalesce(new.created_at, now()))
   where s.id = new.session_id
     -- Guardia de orden: una fila tardía (eager user en carrera) no pisa
     -- bookkeeping de un mensaje más nuevo.
     and (s.last_message_at is null or coalesce(new.created_at, now()) >= s.last_message_at);

  return new;
end $$;

drop trigger if exists trg_chat_session_bookkeeping on public.chat_messages;
create trigger trg_chat_session_bookkeeping
  after insert on public.chat_messages
  for each row execute function public.chat_session_bookkeeping();

-- Backfill: último mensaje real por sesión. A igual created_at (par user+assistant
-- en batch) gana el assistant (role asc: 'assistant' < 'user').
update public.chat_sessions s
   set last_role       = m.role,
       last_message_at = m.created_at
  from (
    select distinct on (session_id) session_id, role, created_at
      from public.chat_messages
     order by session_id, created_at desc, role asc
  ) m
 where m.session_id = s.id;

-- Todo lo histórico arranca LEÍDO (gris): los puntos solo iluminan actividad nueva.
update public.chat_sessions set last_read_at = now();
