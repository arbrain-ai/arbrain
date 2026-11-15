import { trMarca } from '@/shared/i18n'

export const AREA_SHORTCUTS = [
  // Hoy = el Calendario en su Día (5 oct 2026): objetivo, agenda, tareas y hábitos en un solo lugar.
  { key:'1', label:trMarca('Hoy'), href:'/calendar?mode=day' },
  { key:'2', label:trMarca('Calendario'), href:'/calendar' },
  { key:'3', label:trMarca('Command Center'), href:'/ml-dashboard' },
  { key:'4', label:trMarca('Contenido'), href:'/youtube' },
  { key:'5', label:trMarca('Chat'), href:'/chat' },
  { key:'6', label:trMarca('Artificial Brain'), href:'/segundo-cerebro' },
  { key:'7', label:trMarca('Finanzas'), href:'/finanzas' },
] as const
