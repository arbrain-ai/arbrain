// Cámara de Live (5 oct 2026). Lógica pura, sin navegador, para poder probarse en Node.
// Contrato de privacidad: el cuadro solo existe al enviar y viaja como adjunto de ese turno; nada se graba.
export const LADO_CUADRO=768
export const CALIDAD_CUADRO=0.72
export const CAMARA_ON_KEY='arbrain.live.camara'
export const CAMARA_DISP_KEY='arbrain.live.camara.dispositivo'

/** Reduce al lado mayor `max` sin agrandar nunca. */
export function dimensionesCuadro(ancho:number,alto:number,max=LADO_CUADRO){
 if(!(ancho>0)||!(alto>0))return {ancho:0,alto:0}
 const f=Math.min(1,max/Math.max(ancho,alto))
 return {ancho:Math.max(1,Math.round(ancho*f)),alto:Math.max(1,Math.round(alto*f))}
}

export type Dispositivo={deviceId:string;label:string}
/** Cam Link y capturadoras HDMI suelen ser la cámara real del dueño (una cámara de video por HDMI); se prefieren si no hay elección guardada. */
const PREFERIDAS=/cam\s*link|elgato|capture|capturadora|zv-?e10/i
export function elegirDispositivo(lista:Dispositivo[],guardado:string|null):string|null{
 if(!lista.length)return null
 if(guardado&&lista.some(d=>d.deviceId===guardado))return guardado
 return (lista.find(d=>PREFERIDAS.test(d.label))??lista[0]).deviceId
}

export function leerPreferencia(storage:Pick<Storage,'getItem'>|null):{encendida:boolean;dispositivo:string|null}{
 try{return {encendida:storage?.getItem(CAMARA_ON_KEY)==='1',dispositivo:storage?.getItem(CAMARA_DISP_KEY)||null}}catch{return {encendida:false,dispositivo:null}}
}

/** Mensaje en español para los fallos de getUserMedia. */
export function mensajeErrorCamara(e:unknown):string{
 const n=(e as {name?:string})?.name
 if(n==='NotAllowedError'||n==='SecurityError')return 'La cámara está bloqueada. Dale permiso a Arbrain en Ajustes del Sistema > Privacidad > Cámara.'
 if(n==='NotFoundError'||n==='OverconstrainedError')return 'No encuentro esa cámara. ¿Está conectada y encendida? Elige otra en la lista.'
 if(n==='NotReadableError')return 'La cámara está ocupada por otra app (OBS, por ejemplo). Ciérrala o elige otra.'
 return `No pude abrir la cámara: ${e instanceof Error?e.message:'error desconocido'}.`
}
