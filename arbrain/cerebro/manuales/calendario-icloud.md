# Calendario de iPhone o iCloud

Levy trabaja con Google Calendar (manual [google-calendar-gmail.md](google-calendar-gmail.md)). Si tú vives en el
calendario del iPhone, no tienes que cambiar de app: el iPhone puede mostrar y editar tu Google Calendar. Lo que hay
que decidir es **dónde vive tu agenda**.

> **Privacidad:** estos pasos solo conectan tus propias cuentas entre sí (Apple y Google). Levy no guarda tu
> contraseña de Apple ni de Google.

## Recomendación: Google es la casa; el iPhone es la ventana

Tus eventos viven en Google y los ves y editas desde la app Calendario del iPhone. Así Levy lee y escribe en el
mismo lugar que tú miras.

**En el iPhone:**

1. Ajustes › Apps › Calendario › Cuentas › Agregar cuenta › **Google** (en iOS anteriores: Ajustes › Calendario ›
   Cuentas).
2. Inicia sesión con la cuenta de Google que conectaste a Levy y enciende **Calendarios**.
3. Calendario › Calendarios (abajo): marca los de Google.
4. **Calendario por defecto:** Ajustes › Apps › Calendario › Calendario por omisión: elige el de Google. Así lo
   que crees en el iPhone también lo ve Levy.

**En la Mac:** Calendario › Ajustes › Cuentas › «+» › Google. Mismo resultado.

## Si quieres conservar iCloud como casa

Google no puede escribir en iCloud. Lo que sí se puede es que **Levy vea** tus eventos de iCloud (solo lectura):

1. En el iPhone: Calendario › Calendarios › la «i» junto a tu calendario de iCloud › enciende **Calendario
   público** › **Compartir enlace** y cópialo (empieza con `webcal://`).
2. En la computadora, abre <https://calendar.google.com> › junto a «Otros calendarios», «+» › **Desde URL**.
   Pega el enlace cambiando `webcal://` por `https://` y «Agregar calendario».

Límites, para que decidas con datos:

- **Solo lectura:** Levy ve esos eventos pero no puede crearlos ni moverlos en iCloud. Lo que agende Levy irá a tu
  calendario de Google (que ves en el iPhone si hiciste la parte de arriba).
- **Retraso:** Google refresca un calendario suscrito cada varias horas; un cambio en iCloud no aparece al
  instante.
- **Enlace público:** quien tenga el enlace puede ver ese calendario. No lo compartas y, si se filtra, apaga y
  vuelve a encender «Calendario público» para generar otro.

## Verificación

1. Crea en el iPhone un evento de prueba «Prueba Levy» mañana a las 10:00 en el calendario de Google.
2. Pídele a Levy: «¿qué tengo mañana?». Debe aparecer «Prueba Levy».
3. Pídele a Levy que cree «Prueba desde Levy» mañana a las 11:00. Revisa que aparezca en tu iPhone (puede tardar
   uno o dos minutos). Después borra los dos eventos tú mismo.

Si usaste la suscripción de iCloud: crea un evento en iCloud y comprueba al día siguiente que Levy lo ve.

## Si falla

- **No aparece la cuenta de Google en el iPhone:** revisa que «Calendarios» esté encendido en esa cuenta.
- **Los eventos que crea Levy no se ven en el iPhone:** en Calendario › Calendarios, marca el calendario de Google
  donde escribe Levy (normalmente el principal, con tu correo).
- **Google dice que no pudo agregar la URL:** revisa que cambiaste `webcal://` por `https://` y que «Calendario
  público» sigue encendido.
