# Quién manda en tu cerebro (modo espejo, beta)

Viene apagado. Solo importa si tu cerebro vive en dos máquinas: tu compu y un servidor Linux tuyo («tu nube»), en
espejo por tu repo privado `mi-arbrain`.

- **Una sola máquina manda.** Lo dice `lider.json` en esta carpeta. La que manda corre las rutinas y escribe `now.md`
  y los reportes; la otra es ventana: conversas con tu Levy, lees y editas tus archivos, pero no corre rutinas.
- **Cambiar quién manda es decisión tuya.** Dile a tu Levy «que la nube mande» o «que mi compu mande». Él corre
  `node arbrain/scripts/espejo/espejo.mjs lider elegir <máquina> --cita "<tus palabras>"`. La otra se entera en su
  siguiente sincronización (≈ 5 min) y apaga sus rutinas.
- **Nadie se promueve solo.** Si la que manda deja de dar señales, la otra te avisa y te pregunta; no toma el mando.
- **Tus llaves nunca viajan.** Cada máquina se conecta por su cuenta. Las rutinas de la que manda corren con una llave
  de OpenRouter con tope de gasto (tu suscripción de Claude es para tu uso directo); sin tope, no corren y te lo dicen.
- **Un choque no borra nada.** Si las dos editaron lo mismo, queda tu versión en el archivo y la otra al lado como
  `<archivo>.conflicto-<máquina>-<fecha>.md`. Tu Levy te propone cómo unirlas.
- **Lo que escribe cada máquina por evento lleva su nombre** (`2026-10-23.<máquina>.md`), así nunca chocan.

`maquinas/`, `latidos/` y `enviados/` son del espejo: altas, señales de vida y folios de lo que ya salió (para no
mandar nada dos veces). No los edites a mano.
