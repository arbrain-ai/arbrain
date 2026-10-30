'use client'
import {useEffect,useMemo,useRef,useSyncExternalStore,type Dispatch,type SetStateAction} from 'react'
import {composerDrafts} from '../lib/composer-drafts'

export function useComposerDraft<T extends object>(key:string,empty:T) {
  const current=useRef({key,empty}); current.current={key,empty}
  const entry=useSyncExternalStore(composerDrafts.subscribe,()=>composerDrafts.entry(key,empty),()=>composerDrafts.entry(key,empty))
  useEffect(()=>{void composerDrafts.load(key,empty)},[key,empty])
  // Like React state setters: stable callbacks always address the current composer.
  const setters=useMemo(()=>Object.fromEntries(Object.keys(empty).map(field=>[field,(update:unknown)=>{
    const {key,empty}=current.current
    composerDrafts.update(key,empty,value=>({...value,[field]:typeof update==='function'?update(value[field as keyof T]):update}))
  }])) as {[K in keyof T]:Dispatch<SetStateAction<T[K]>>},[])
  return {value:entry.value,setters,ready:entry.ready,error:entry.error}
}
