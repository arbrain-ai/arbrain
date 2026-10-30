export const funnelStages=['about_page_view','about_cta_click','checkout_page_view'] as const
export function createFunnelSessions(){return {stages:Object.fromEntries(funnelStages.map(key=>[key,new Set<string>()])) as Record<string,Set<string>>,withoutSession:0}}
export function addFunnelEvents(state:ReturnType<typeof createFunnelSessions>,rows:{event_name:string;session_id:string|null}[]){
 for(const row of rows){if(!state.stages[row.event_name])continue;if(row.session_id)state.stages[row.event_name].add(row.session_id);else state.withoutSession++}
 return state
}
