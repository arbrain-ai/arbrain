'use client'
import { useRouter } from 'next/navigation'
import { Target, List, LayoutGrid, Rows3 } from 'lucide-react'
import styles from './todotask.module.css'
export type TodotaskView = 'hoy' | 'list' | 'flow' | 'habits'
export function TodotaskTabs({ view, onChange }: { view:TodotaskView; onChange?:(view:'list'|'flow'|'habits')=>void }) {
  const router=useRouter()
  return <nav className={styles.tabs} aria-label="Vistas de Objetivos">
    {([{id:'hoy',label:'Objetivos',icon:Target},{id:'list',label:'Lista',icon:List},{id:'flow',label:'Flujo',icon:LayoutGrid},{id:'habits',label:'Hábitos',icon:Rows3}] as const).map(tab=><button key={tab.id} aria-pressed={view===tab.id} onClick={()=>{
      if(tab.id==='hoy')router.push('/todotask/hoy')
      else if(onChange)onChange(tab.id)
      else router.push(`/todotask?view=${tab.id}`)
    }}><tab.icon size={15}/>{tab.label}</button>)}
  </nav>
}
