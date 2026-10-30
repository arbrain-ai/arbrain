import { modelDisplayName } from '../stores/model-store'

export type ConsejoModels = Record<'claude'|'openai',{model:string;effort?:string}> & {synthesis?:{provider:'claude'|'openai';model:string;effort?:string}}
export const DEFAULT_CONSEJO_MODELS:ConsejoModels={claude:{model:'claude-fable-5-1'},openai:{model:'gpt-6-astra'},synthesis:{provider:'claude',model:'claude-fable-5-1'}}

export function exactModelLabel(id:string, fallback?:string):string {
  return modelDisplayName(id) || fallback || id
}

/** Legacy turns used Claude/Fable. Never import QA/another conversation's model into them. */
export function restoreConsejoModels(last:{settings?:ConsejoModels}|undefined, saved?:ConsejoModels, global?:ConsejoModels):ConsejoModels {
  return saved ?? (last ? last.settings ?? DEFAULT_CONSEJO_MODELS : global ?? DEFAULT_CONSEJO_MODELS)
}
