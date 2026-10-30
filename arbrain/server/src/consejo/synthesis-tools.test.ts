import { describe, expect, it, vi } from 'vitest'
import { dispatchConsejoTool, openaiConsejoTools } from './runtime.js'
describe('OpenAI synthesis has the same bounded read and consultation tools',()=>{
  it('only exposes consultation when the synthesis stage supplies its handler',async()=>{
    const read=vi.fn(async()=>({text:'fuente',error:false})),consult=vi.fn(async()=>({text:'aclaración',error:false}))
    expect(openaiConsejoTools(read).map(t=>t.name)).toEqual(['consejo_read'])
    expect(openaiConsejoTools(read,consult).map(t=>t.name)).toEqual(['consejo_read','consult_provider'])
    const input={provider:'claude',question:'¿Qué fuente verificaste?'}
    await expect(dispatchConsejoTool('consult_provider',input,read,consult)).resolves.toEqual({text:'aclaración',error:false})
    expect(consult).toHaveBeenCalledWith(input);expect(read).not.toHaveBeenCalled()
    expect(()=>dispatchConsejoTool('consult_provider',input,read)).toThrow('sin permisos')
  })
  it('rejects native action tools even when both read handlers exist',()=>{
    const handler=vi.fn(async()=>({text:'read',error:false}))
    for (const name of ['shell','apply_patch','exec','send_message','unknown']) expect(()=>dispatchConsejoTool(name,{},handler,handler)).toThrow('sin permisos')
    expect(handler).not.toHaveBeenCalled()
  })
})
