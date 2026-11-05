# El modelo sin filtro (DeepSeek V4.1 Flash · abliterated)

Para ti, Levy, y para el dueño. Desde la v0.2.23 tu Arbrain puede conversar con **DeepSeek V4.1 Flash abliterated**:
un modelo abierto al que le quitaron las negativas. Corre con el mismo cerebro, las mismas skills y las mismas
herramientas, en una conversación aparte. **No es Claude.** Lo paga el dueño por uso en abliteration.ai, con su propia
llave. Nunca le pidas la llave en el chat: se pega en Ajustes.

> **Privacidad:** la llave vive en su computadora, en el lugar privado donde Arbrain guarda sus llaves (el llavero del
> sistema o un archivo privado de su carpeta de datos), y solo la usa la conversación sin filtro. Lo que el dueño
> escribe en esa conversación sí sale hacia abliteration.ai: es un servicio de terceros.

## Paso a paso (guíalo así, uno por mensaje)

1. **Crear la cuenta.** Que abra https://abliteration.ai/console y entre con su cuenta de Google (o cree una cuenta).
2. **Saldo.** Si su cuenta no trae saldo, que cargue crédito en la sección de facturación de esa consola. Se cobra por
   uso; no hay mensualidad. Con poco crédito alcanza para probar.
3. **La llave.** En «API keys», que cree una llave nueva y le ponga de nombre «Arbrain». Empieza con «ak_».
4. **Pegarla en Arbrain.** Ajustes (engrane abajo a la izquierda, o ⌘, en Mac) › **Sin filtro** › pegar la llave ›
   Guardar. Tu Arbrain se reinicia unos segundos para tomarla.
5. **Usarlo.** En el chat, el selector de modelo (abajo, junto al «+») › **DeepSeek V4.1 Flash · abliterated**. Se
   abre una conversación nueva y el selector se ve como una píldora roja mientras esté en él. Para volver a Claude,
   elige otro modelo.

## Lo que tiene que saber el dueño (díselo una vez, corto)

- **Los frenos de Arbrain siguen:** sus permisos, la pregunta antes de mandar mensajes, borrar o publicar, y nada de
  dinero. Lo que se quita es la negativa del modelo, no la guardia del sistema.
- **Sus mensajes de esa conversación van a abliteration.ai,** un servicio de terceros. Nada de contraseñas ni datos de
  sus clientes que no quiera compartir.
- **Costo** (tarifa del 3 nov 2026): 1 USD por millón de tokens de entrada, 0.10 USD en caché y 2 USD de salida. Abrir
  una conversación cuesta unos 6 centavos de dólar (manda todo el contexto del cerebro) y cada mensaje corto que sigue,
  menos de 1 centavo. Preguntar varias cosas en la MISMA conversación rinde mucho más que abrir una por pregunta.
- Lo que le pida al modelo es responsabilidad suya. Úsenlo con criterio y dentro de la ley.

## Verificación

- Ajustes › Sin filtro muestra «Guardada · ak_…» con los últimos cuatro caracteres.
- En el selector de modelo, «DeepSeek V4.1 Flash · abliterated» ya no sale gris.
- Una conversación nueva en él responde, y el selector se ve como píldora roja.

## Si falla

| Lo que ve | Qué hacer |
|---|---|
| La opción sale gris y dice «Pon tu llave de abliteration.ai en Ajustes › Sin filtro» | Falta la llave o el reinicio no terminó: que la pegue (paso 4) y espere unos segundos |
| Ajustes › Sin filtro dice que su Arbrain todavía no conoce esta llave | Su copia es anterior a la v0.2.23: «jala los últimos cambios» (skill `actualizar-arbrain`) |
| Error de saldo o «credit» en la respuesta | Recargar crédito en la consola de abliteration.ai |
| Error de llave inválida | Quitar la llave en Ajustes › Sin filtro, crear otra en la consola y pegarla de nuevo |
| Una conversación con muchas capturas | abliteration.ai acepta máximo 4 imágenes por mensaje; Arbrain manda solo las 4 más recientes y avisa en el texto de las demás |
