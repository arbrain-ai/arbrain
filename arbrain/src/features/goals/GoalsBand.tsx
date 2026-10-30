'use client'
import Link from 'next/link'
import {useGoals} from './useGoals'
import styles from './goals.module.css'
export function GoalsBand({date}:{date:string}){
 const goals=useGoals(),active=goals.data?.goals.filter(g=>g.start<=date&&g.end>date&&g.status!=='draft').sort((a,b)=>['month','week','day'].indexOf(a.scope)-['month','week','day'].indexOf(b.scope))??[]
 return <div className={styles.band}>{goals.error?<span>No se pudo actualizar la dirección.</span>:active.length?active.map(g=><Link key={g.id} href={`/todotask/hoy?horizon=${g.scope}&date=${date}`}><small>{g.scope==='month'?'MES':g.scope==='week'?'SEMANA':'DÍA'}</small>{g.title}</Link>):<Link href={`/todotask/hoy?horizon=week&date=${date}`}>{goals.loading?'Leyendo objetivos…':'Objetivos del período · por planificar'} →</Link>}</div>
}
