# `mapa.json` · esquema `arbrain.mapa/v1`

La fuente del mapa. Un caso completo e inventado: `ejemplo.json` (una ferretería de barrio). `nuevo` lo siembra con lo
que ya existe; lo que falta nace `pendiente` y se le pregunta al dueño, de una en una. **Nunca se rellena.**

## De dónde sale cada cosa

| Parte del mapa | Si es de un cliente | Si es el tuyo |
|---|---|---|
| `norte.meta` | `radiografia.json › meta` | tu meta a 90 días |
| `norte.porque`, `juego`, `ondas`, `principios` | Se le pregunta (abajo) | tu porqué y tus principios, de tu memoria |
| `sistema.etapas`, `cuello`, `timonel.hoy` | `radiografia.json` (etapas, números, tareas a mano, cuello) | tu `mi-negocio/embudo.json` (tu oferta principal) |
| `oferta.escalera` | Lo que vende hoy, de la entrada a lo más grande: se le pregunta | los pisos y ofertas de tu `embudo.json` |
| `oferta.hoja` | Lo que la Radiografía ya reveló (avatar, dolor, precio); lo demás, pendiente | tu `mi-negocio/02-oferta.md` (skill `oferta`) |
| `vehiculo.pasos`, `costo` | Los arreglos de la Radiografía, en su orden, con sus horas y sus ventas | los pasos de tu método (pieza 3 de tu oferta) |

Las cuatro preguntas que casi siempre faltan, en este orden y una por mensaje:

1. «¿Para qué quieres llegar a esa meta? Dímelo como se lo dirías a alguien de tu casa.» → `norte.porque`
2. «Si esto sale bien, ¿a quién le cambia la vida primero, y después a quién?» → `norte.ondas` (de 3 a 6, del más chico al más grande)
3. «¿Qué no estás dispuesto a cambiar para lograrlo?» → `norte.tierra`
4. «De todo lo que vendes, ¿qué es la entrada, qué es lo que más empujas y qué te gustaría vender después?» → `oferta.escalera`

## Los campos

```jsonc
{
  "esquema": "arbrain.mapa/v1",
  "negocio": "Ferretería La Tuerca",
  "ejemplo": true,                        // solo en casos inventados: la página lo dice
  "fecha": "2026-11-16",
  "para": "cliente",                      // "cliente": se le habla de tú al dueño («Tu norte») · "propio": «Mi norte»
  "moneda": "EUR",
  "marca": { "acento": "#C2410C", "segundo": "#0F766E", "motivo": "tuerca" },   // opcional: ver oficio.md
  "titulos": { "vehiculo": "El plan" },   // opcional: otro nombre para un capítulo (norte, sistema, oferta, vehiculo)
  "tesis": { "sistema": "…" },            // opcional: otra frase bajo el nombre del capítulo
  "bajada": "…",                          // opcional: la línea bajo el título de la página

  "norte": {
    "luz": "Tu porqué",
    "porque": { "texto": "«…»", "estado": "firmado", "sello": "lo dijo la dueña · 14 nov" },
    "meta":   { "texto": "Pasar de 18,000 a 22,000 EUR al mes en 3 meses…", "de": "18,000", "a": "22,000",
                "unidad": "EUR al mes", "plazo": "3 meses", "estado": "firmado" },
    "juego":  { "texto": "…", "estado": "abierto" },
    "ondas":  [ { "nombre": "La dueña", "glosa": "sus noches, de vuelta" } ],   // de 3 a 6
    "tierra": "Lo que no se negocia.",
    "principios": [ { "texto": "Primero se mide, después se arregla.", "estado": "firmado" } ],   // de 3 a 5
    "enfoque": { "texto": "Cotizar el mismo día", "estado": "firmado", "abierto": "lo que sigue sin decidir" }
  },

  "sistema": {
    "unidad": "cotizaciones",             // qué fluye por el negocio, en plural
    "entrada": "contratistas y vecinos →",
    "etapas": [                           // SIEMPRE las seis, en orden: Adquisición, Nutrición, Conversión, Bienvenida, Entrega, Expansión
      { "etapa": "Conversión", "que_pasa": "…", "opera_hoy": true, "quien": ["la dueña"],
        "numero": { "nombre": "Cotizaciones que se vuelven venta", "valor": "12 de 35", "medido_en": "13 nov" },
        "a_mano": { "horas_mes": 30 } }   // valor null = «por medir» (con "como_medirlo")
    ],
    "cuello": { "etapa": "Conversión", "frase": "…", "se_van": "23 de 35 cotizaciones", "fuga": 0.66,
                "evidencia": "…", "fecha": "2026-11-14" },
    "organos": [ { "nombre": "Venta", "pregunta": "¿compra?", "etapas": ["Conversión"] } ],   // opcional: por defecto Marketing, Venta, Entrega, Finanzas
    "timonel": { "meta": "22,000 EUR al mes", "hoy": "18,000 EUR al mes", "empuje": "Cotizar el mismo día" },
    "lazo": { "texto": "los clientes bien servidos recomiendan", "estado": "pendiente", "sello": "nadie lo pide hoy" }
  },

  "oferta": {
    "entrada": "De dónde llegan, en una línea.",
    "escalera": [                         // de 2 a 5 escalones, de la entrada a lo más grande
      { "nombre": "Pedido a obra", "kicker": "Al frente · lo que se empuja", "voz": "«…»", "texto": "…",
        "precio": "150 EUR por pedido", "estado": "opera", "sello": "medido · oct", "peso": 2.9, "frente": true }
    ],
    "en_corto": "La oferta en una línea.",
    "hoja": [ { "n": 1, "texto": "A quién le vende.", "estado": "firmado" } ]   // las 11, por su número; sin texto = pendiente
  },

  "vehiculo": {
    "rotulos": { "pasos": "Qué se arregla primero", "pasos_glosa": "en este orden", "costo": "Lo que cuesta no arreglarlo", "llegada": "A dónde llega" },
    "pasos": [                            // hasta 7, en orden
      { "nombre": "…", "detalle": "…", "estado": "abierto", "sello": "piloto de 30 días",
        "quita": "30 h al mes", "recupera": "≈ 2,600 EUR al mes", "peso": 3, "hilos": ["Conversión"] }
    ],
    "destinos": { "titulo": "Tu sistema, etapa por etapa", "lista": [ { "nombre": "Conversión", "nota": "el cuello: 12 de 35", "volumen": 0.34 } ] },
    "costo": { "mes": "≈ 3,600 EUR", "noventa": "≈ 10,900 EUR", "nota": "…",
               "escala": [ { "rotulo": "se van al mes", "valor": 3600, "texto": "≈ 3,600 EUR" },
                           { "rotulo": "faltan para la meta", "valor": 4000, "texto": "4,000 EUR" } ] },
    "llegada": "22,000 EUR al mes y las noches de vuelta"
  },

  "ir_a": [ { "texto": "La Radiografía", "destino": "doc:.claude/memory/project/clientes/<slug>/radiografia.md" } ]
}
```

## Reglas de cada campo

- **`estado`** en cualquier parte: `firmado`, `opera`, `abierto`, `pendiente` o `idea` (también entiende «firmada»,
  «borrador», «vacía», «por medir»). `sello` es el texto de su etiqueta («medido · oct», «lo dijo la dueña»); si falta,
  dice el estado.
- **`numero.valor`**: como lo diría el dueño («12 de 35», «1 de cada 10»), con `medido_en`. Sin fuente: `null`.
- **`cuello.fuga`**: de 0 a 1, la parte que se pierde ahí (23 de 35 = 0.66). Decide cuántos puntos se escapan y cuánto
  adelgaza la línea después. Sin dato, deja `0.66` solo si el dueño confirma que «casi todos»; si no, mídelo primero.
- **`escalera[].peso`**: el ancho del escalón (1 = normal, 3 = el ancho que se empuja). Uno solo lleva `frente: true`.
- **`pasos[].hilos`**: nombres que existan en `destinos.lista` (o su número). Un paso puede tocar varios destinos.
  **`peso`** (1 a 3) es el grosor de su hilo: el primero, el que ataca el cuello, va en 3.
- **`destinos`**: para el mapa de un cliente, las seis etapas; para el tuyo, las piezas de tu oferta que cada paso
  llena. `volumen` (0 a 1) dibuja cuánto pasa por cada una **solo si se midió en la misma unidad**; si no, se omite.
- **`costo.escala`**: dos o tres cifras comparables (misma unidad y mismo periodo) que se dibujan como largos. Si das
  `norte.meta.de` y `a` y la Radiografía calculó el costo, se arma sola.
- **`ir_a`**: hasta 3 documentos de fondo (`doc:<ruta dentro de tu cerebro>`). Salen como tarjetas que los abren.
- **Textos cortos.** Un nombre, hasta 40 letras; una frase, hasta 90. Lo que no cabe se corta con «…»: mejor edítalo tú.
