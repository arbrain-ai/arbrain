import { describe, expect, it } from 'vitest'
const imageSource='../../../src/features/chat/lib/image-paste.ts'
const modelSource='../../../src/features/chat/lib/consejo-models.ts'
const {localImagePath,clipboardImages}=await import(imageSource)
const {exactModelLabel,restoreConsejoModels,DEFAULT_CONSEJO_MODELS}=await import(modelSource)

describe('Image clipboard and explicit model identity',()=>{
  it('recognizes CleanShot paths with spaces, quoting and file URLs',()=>{
    const path='/Users/alumno/Library/Application Support/CleanShot/media/a/CleanShot 2026.png'
    for(const pasted of [path,`"${path}"`,`'${path}'`,path.replaceAll(' ','\\ '),`file://${path.replaceAll(' ','%20')}`]) expect(localImagePath(pasted)).toBe(path)
  })
  it('never interprets prose, remote hosts or unsafe text as a local image path',()=>{
    for(const bad of ['https://example.com/a.png','file://other-host/a.png','/Users/x/a.png\n/Users/x/b.png','mira /Users/x/a.png','/Users/me/secret.txt','a.png','/Users/x/a\0.png']) expect(localImagePath(bad)).toBeNull()
  })
  it('keeps all clipboard images and prefers actual bytes over a text representation',()=>{
    const a={name:'a.png'},b={name:'b.png'}
    const items=[{kind:'string',type:'text/plain',getAsFile:()=>null},{kind:'file',type:'image/png',getAsFile:()=>a},{kind:'file',type:'image/jpeg',getAsFile:()=>b},{kind:'file',type:'image/png',getAsFile:()=>null}]
    expect(clipboardImages({items})).toEqual([a,b])
  })
  it('shows exact Claude versions, including date-suffixed model identifiers',()=>{
    expect(exactModelLabel('claude-fable-5-1','Fable')).toBe('Fable 5.1')
    expect(exactModelLabel('claude-sonnet-5','Sonnet')).toBe('Sonnet 5')
    expect(exactModelLabel('claude-opus-5','Opus')).toBe('Opus 5')
    expect(exactModelLabel('claude-haiku-4-5-20251001','Haiku')).toBe('Haiku 4.5')
  })
  it('does not import another conversation model into a legacy Fable conversation',()=>{
    const other={...DEFAULT_CONSEJO_MODELS,synthesis:{provider:'claude',model:'claude-sonnet-5'}}
    expect(restoreConsejoModels({},undefined,other)).toEqual(DEFAULT_CONSEJO_MODELS)
    expect(restoreConsejoModels(undefined,undefined,other)).toEqual(other)
  })
  it('restores a saved next-turn choice ahead of the previous turn and global settings',()=>{
    const saved={...DEFAULT_CONSEJO_MODELS,synthesis:{provider:'openai',model:'gpt-6-astra',effort:'high'}}
    expect(restoreConsejoModels({settings:DEFAULT_CONSEJO_MODELS},saved)).toEqual(saved)
    expect(restoreConsejoModels({settings:saved},undefined,DEFAULT_CONSEJO_MODELS)).toEqual(saved)
  })
})
