import { instalacion, SEGUNDA } from '@/config'
// Colores estables para cuentas y categorías de finanzas (dark theme).
// Portado del dashboard viejo (cuentas con color), adaptado a la paleta de Mission Control.

// Color deliberado por cuenta conocida; el resto cae al hash de la paleta.
// Las cuentas propias y su color viven en config/instalacion.ts › finanzas.
const ACCOUNT_COLORS: Record<string, string> = instalacion().finanzas.coloresCuentas

const PALETTE = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EC4899',
  '#06B6D4', '#14B8A6', '#F97316', '#A78BFA', '#84CC16',
]

function hashColor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function accountColor(name: string): string {
  return ACCOUNT_COLORS[name] ?? hashColor(name)
}

// Categorías de gasto → color (para barras por categoría).
const CATEGORY_COLORS: Record<string, string> = {
  'viaje-hospedaje': '#8B5CF6',
  'viaje-transporte': '#A78BFA',
  comida: '#F59E0B',
  despensa: '#FBBF24',
  'health-gym': '#10B981',
  suscripciones: '#3B82F6',
  'equipo-tech': '#06B6D4',
  vivienda: '#EC4899',
  [SEGUNDA()]: '#F472B6',
  familia: '#FB923C',
  'inversion-conocimiento': '#14B8A6',
  'negocio-ops': '#6366F1',
  personal: '#0EA5E9',
  otros: '#64748B',
}

export function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? hashColor(cat)
}

// Fuentes de ingreso → color.
const INCOME_COLORS: Record<string, string> = {
  Polar: '#10B981',
  USDT: '#F59E0B',
  'HT-cierre': '#8B5CF6',
  otros: '#64748B',
}

export function incomeColor(source: string): string {
  return INCOME_COLORS[source] ?? hashColor(source)
}
