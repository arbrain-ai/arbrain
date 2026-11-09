#!/usr/bin/env node
/**
 * Datos de ejemplo del kit de Business Intelligence (8 nov 2026): un café ficticio, «Café Brújula», con ventas en mostrador
 * y a domicilio, interesados en pedidos para eventos y gastos. Deterministas (semilla fija, sin Math.random ni reloj): correr
 * esto otra vez da los mismos archivos. Sirven para practicar antes de conectar al primer cliente, para las pruebas y para
 * las capturas. Ningún nombre ni cifra es de un negocio real.
 *
 *   node arbrain/docs/bi/ejemplo/generar.mjs            # reescribe datos/*.csv
 *
 * El último día (sáb 7 nov 2026) la terminal de pago se cayó al mediodía: las ventas se desploman y el panel enciende la
 * señal de dolor. Así se ve la alarma de Beer con datos que cualquiera puede abrir.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const DESDE = '2026-07-01', HASTA = '2026-11-07'

let semilla = 20261108
const azar = () => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla / 4294967296 }
const elegir = pesos => { let r = azar() * pesos.reduce((s, [, p]) => s + p, 0); for (const [v, p] of pesos) { if ((r -= p) <= 0) return v } return pesos[0][0] }
const dias = []
for (let d = new Date(`${DESDE}T12:00:00Z`); d <= new Date(`${HASTA}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) dias.push(new Date(d))
const iso = d => d.toISOString().slice(0, 10)
const dmy = d => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
const hora = (h0, h1) => { const m = Math.floor(h0 * 60 + azar() * (h1 - h0) * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
const csv = v => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))

const PRODUCTOS = [['Café americano', 45, 26], ['Capuchino', 58, 20], ['Latte', 62, 16], ['Pan dulce', 28, 18], ['Sándwich', 89, 9], ['Frappé', 75, 7], ['Té chai', 55, 4]]
const EFECTO_DIA = [1.25, 0.82, 0.92, 0.95, 1.0, 1.12, 1.4] // dom..sáb

// Ventas: una fila por producto vendido en un ticket (así «lo más vendido» sale del mismo archivo).
const ventas = [['Fecha', 'Ticket', 'Producto', 'Total', 'Canal']]
let ticket = 1000
dias.forEach((d, i) => {
  let n = Math.round(30 * EFECTO_DIA[d.getUTCDay()] * (1 + i * 0.0018) * (0.86 + azar() * 0.28))
  if (iso(d) === HASTA) n = 9 // la terminal se cayó al mediodía
  for (let k = 0; k < n; k++) {
    ticket++
    const canal = azar() < 0.17 ? 'Domicilio' : 'Mostrador'
    const h = hora(7.5, iso(d) === HASTA ? 12 : 20.5)
    const lineas = 1 + (azar() < 0.35 ? 1 : 0) + (azar() < 0.1 ? 1 : 0)
    for (let l = 0; l < lineas; l++) {
      const elegido = elegir(PRODUCTOS.map(x => [x[0], x[2]]))
      const [nombre, precio] = PRODUCTOS.find(p => p[0] === elegido)
      ventas.push([`${dmy(d)} ${h}`, `T-${ticket}`, nombre, (precio * (canal === 'Domicilio' ? 1.1 : 1)).toFixed(2), canal])
    }
  }
})

// Interesados: quien escribió por un pedido para evento; su canal y hasta dónde llegó.
const interesados = [['fecha', 'canal', 'estado']]
dias.forEach((d, i) => {
  const n = Math.round((4 + i * 0.012) * (d.getUTCDay() === 1 ? 1.3 : 1) * (0.7 + azar() * 0.6))
  for (let k = 0; k < n; k++) {
    const canal = azar() < 0.05 ? '' : elegir([['Instagram', 40], ['Google Maps', 25], ['Recomendación', 20], ['WhatsApp', 15]])
    const estado = elegir([['preguntó', 58], ['cotizado', 27], ['compró', 15]])
    interesados.push([iso(d), canal, estado])
  }
})

// Gastos: en el formato del Excel en español (punto y coma, coma decimal).
const gastos = [['fecha', 'concepto', 'monto']]
const pesos = n => n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
dias.forEach(d => {
  if (d.getUTCDay() !== 0) gastos.push([dmy(d), 'Insumos', pesos(900 + azar() * 700)])
  if (d.getUTCDate() === 1) gastos.push([dmy(d), 'Renta', pesos(18500)])
  if (d.getUTCDate() === 15 || new Date(d.getTime() + 86400000).getUTCDate() === 1) gastos.push([dmy(d), 'Nómina', pesos(21000)])
  if (azar() < 0.08) gastos.push([dmy(d), 'Mantenimiento', pesos(400 + azar() * 1600)])
})

const escribir = (nombre, filas, sep = ',') => writeFileSync(join(AQUI, 'datos', nombre), `${filas.map(f => f.map(csv).join(sep)).join('\n')}\n`)
escribir('ventas.csv', ventas)
escribir('interesados.csv', interesados)
escribir('gastos.csv', gastos, ';')
console.log(`ventas ${ventas.length - 1} · interesados ${interesados.length - 1} · gastos ${gastos.length - 1}`)
