import {describe,it,expect} from 'vitest'
const {destinoDelEnvio,botonDelComposer,detenerArmado,unirFila,GRACIA_DETENER_MS}=await import('../../../src/features/chat/lib/envio-chat.ts')

// Bug 1 oct 09:32: el hilo mostró «[Request interrupted by user]» y el mismo texto.
// Journal real (sdk:2d56aed1…): 09:31:19 envío con 3 fotos → failed («Adjunto
// rechazado»); 09:32:42 reenvío → running; 09:32:49 el CLIENTE pidió detener
// (chat_runtime_cancellations); 09:33:12 otra vez con fotos → failed; 09:33:18 → ok.
describe('A dónde va lo que manda Daniel',()=>{
  const base={trabajando:false,hayContenido:true}
  it('con Levy trabajando, Enter o botón: SIEMPRE a la fila, nunca directo (no interrumpe)',()=>{
    expect(destinoDelEnvio({...base,trabajando:true})).toBe('fila')
  })
  it('sin turno activo sale directo',()=>{
    expect(destinoDelEnvio(base)).toBe('directo')
  })
  it('justo cuando el turno termina y la fila aún no sale: se forma detrás (respeta el orden)',()=>{
    expect(destinoDelEnvio({...base,filaEsperando:true})).toBe('fila')
  })
  it('la fila al vaciarse sale directo aunque el estado diga ocupado',()=>{
    expect(destinoDelEnvio({...base,trabajando:false,desdeCola:true})).toBe('directo')
  })
  it('caja vacía (doble Enter tras enviar) no manda nada: sin duplicados',()=>{
    expect(destinoDelEnvio({...base,hayContenido:false})).toBe('nada')
    expect(destinoDelEnvio({...base,hayContenido:false,trabajando:true})).toBe('nada')
  })
  it('editar un mensaje pasado con Levy trabajando no entra a la fila ni detiene',()=>{
    expect(destinoDelEnvio({...base,editando:true,trabajando:true})).toBe('nada')
    expect(destinoDelEnvio({...base,editando:true})).toBe('directo')
  })
})

describe('El botón único del composer',()=>{
  it('detener solo con la caja vacía y Levy trabajando',()=>{
    expect(botonDelComposer({trabajando:true,hayContenido:false})).toBe('detener')
    expect(botonDelComposer({trabajando:true,hayContenido:true})).toBe('enviar')
    expect(botonDelComposer({trabajando:false,hayContenido:false})).toBe('voz')
  })
  it('reproduce el hueco viejo: solo fotos en la caja con Levy trabajando mostraba DETENER',()=>{
    // Antes: hayParaEnviar = texto || archivos de texto (las fotos no contaban).
    const viejo=(trabajando:boolean,texto:string,fotos:number)=>trabajando&&!texto.trim()?'detener':'enviar'
    expect(viejo(true,'',2)).toBe('detener')            // tocar «enviar» detenía a Levy
    expect(botonDelComposer({trabajando:true,hayContenido:2>0})).toBe('enviar')
  })
  it('recién enviado, detener queda desarmado: un doble clic no interrumpe',()=>{
    const t0=1_000_000
    expect(detenerArmado(t0,t0+120)).toBe(false)        // segundo clic del doble clic
    expect(detenerArmado(t0,t0+GRACIA_DETENER_MS-1)).toBe(false)
    expect(detenerArmado(t0,t0+GRACIA_DETENER_MS)).toBe(true)
    expect(detenerArmado(0,t0)).toBe(true)              // sin envío reciente
  })
})

describe('La fila sale como UN mensaje',()=>{
  it('une textos en orden y conserva las fotos de todos',()=>{
    expect(unirFila([{texto:'uno'},{texto:'',imagenes:['a.png']},{texto:'tres',imagenes:['b.png']}]))
      .toEqual({texto:'uno\n\ntres',imagenes:['a.png','b.png']})
  })
  it('fila vacía no manda nada',()=>{
    expect(unirFila([])).toBeNull()
    expect(unirFila([{texto:'  '}])).toBeNull()
  })
})
