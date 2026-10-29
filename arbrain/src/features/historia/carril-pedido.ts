'use client'
/**
 * «Ver cambios» desde el renglón de un agente (29 oct 2026, brecha 5 del benchmark de orquestación): el Taller pide a
 * Historia que abra el carril de una rama. Una tienda y no una prop porque el tablero y Historia son segmentos hermanos
 * del Taller: el pedido espera a que Historia se monte y lo tome. `n` distingue dos pedidos de la misma rama.
 */
import { create } from 'zustand'

export const useCarrilPedido = create<{ rama: string | null; n: number; pedir: (rama: string) => void }>(set => ({
  rama: null, n: 0,
  pedir: rama => set(s => ({ rama, n: s.n + 1 })),
}))

export const pedirCarrilHistoria = (rama: string) => useCarrilPedido.getState().pedir(rama)
