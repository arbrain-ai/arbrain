# El resumen de competidores en `mercado.json`

`.claude/memory/project/mi-negocio/mercado.json` (esquema `arbrain.mercado/v2`) es la investigación de mercado del
dueño; la pinta la sección **Estrategia** de su panel (pestaña Competidores). El expediente completo vive en
`contenido/intel/embudos/<slug>/`; aquí va solo la ficha que el panel enseña. El archivo es la fuente y el panel su
vista: lo que no trae el archivo no aparece.

## Reglas

1. **Toda cifra con fuente y fecha** (`AAAA-MM-DD`). Sin las dos, no se pinta. Números como número; sin dato, `null`
   (nunca 0).
2. **Solo lo público.** Nada de miembros, correos ni mensajes de terceros.
3. **Lo que es lectura de Levy se marca:** `"inferido": true` en el campo, o «Inferencia» en el texto.
4. **No pises lo que ya está:** lee el archivo entero, cambia solo el bloque `competidores` y la ficha del referente
   que estudiaste, conserva lo demás tal cual y actualiza `actualizado`. Si el archivo no existe, créalo con
   `"esquema": "arbrain.mercado/v2"`, `actualizado` y el bloque `competidores`.
5. Una ficha sin al menos una fuente con `url` no se pinta.

## El bloque

```json
"competidores": {
  "metodo": "Cómo se eligieron y midieron (una frase)",
  "limites": ["Lo que esta medición no permite concluir"],
  "fuente": "Expedientes en contenido/intel/embudos/",
  "fecha": "2026-01-15",
  "lista": [ { …ficha… } ]
}
```

## La ficha (todos los campos opcionales salvo `id`, `nombre` y `fuentes`)

```json
{
  "id": "slug", "nombre": "Nombre público", "marca": "Su marca o comunidad",
  "mercado": "hispano | anglo", "grupo": "establecido | promesa | anglo", "pais": "MX",
  "descripcion": "Qué hace, en una línea",
  "canales": [{ "tipo": "youtube", "valor": "@canal", "seguidores": null, "url": "https://…", "fuente": "su canal", "fecha": "2026-01-15" }],
  "comunidad": { "plataforma": "Skool", "acceso": "pago | gratis | mixta", "miembros": null, "url": "https://…", "fuente": "su about", "fecha": "2026-01-15" },
  "oferta": [{ "nombre": "…", "precio": "texto tal como se ve", "usd_mes": null, "forma": "por mes | pago único | programa", "promesa": "…", "url": "https://…" }],
  "mensaje": { "texto": "su promesa principal, literal", "donde": "about", "url": "https://…", "fecha": "2026-01-15" },
  "mecanismo": { "texto": "cómo convierte atención en venta", "inferido": true },
  "sofisticacion": { "nivel": 3, "por_que": "…", "inferido": true },
  "cadencia": { "videos_semana": null, "fuente": "corpus.py, ventana de 30 días", "fecha": "2026-01-15" },
  "velocidad": { "pct_30d": null, "seguidores_30d": null, "vistas_30d": null, "fuente": "…", "fecha": "2026-01-15", "inferido": false },
  "por_que_crece": "Inferencia: …",
  "mejor_que_tu": "Lo que hace mejor que el dueño, dicho sin adorno",
  "imagen": { "url": "https://… (la que su página publica para compartirse)", "de": "su canal", "forma": "avatar | portada", "fuente": "…", "fecha": "2026-01-15" },
  "fuentes": [{ "url": "https://…", "que": "about de su comunidad", "fecha": "2026-01-15" }]
}
```

`precio` va como se ve en la página; `usd_mes` solo si la conversión es directa (una mensualidad en dólares). Una
mensualidad no se compara contra un pago único: por eso `forma`.

## Al terminar

Valida que el JSON abra (`python3 -c "import json;json.load(open('.claude/memory/project/mi-negocio/mercado.json'))"`)
y dile al dueño en una línea que su pestaña Estrategia ya muestra al referente.
