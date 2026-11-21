# Fuentes en otros idiomas (China, Bilibili y cualquier ecosistema lejano)

Hay mercados donde los creadores van meses adelante en un tema y casi nadie los traduce. Leerlos crudos, no por el
filtro de otro, es una ventaja para el dueño. **El objetivo es input, no output:** Levy mina y traduce; el dueño no
tiene que producir en ese idioma.

## Primero: ¿el video está también en YouTube?

Muchos creadores espejean en YouTube y ahí no hay candado de sesión. Si el creador subió **subtítulos propios**, no
hace falta reconocimiento de voz: el transcript ya existe y es mejor que cualquiera automático.

```bash
python3 .claude/skills/intel/scripts/corpus.py bajar "<URL>" --corpus contenido/intel/<tema>/youtube --idioma zh-Hans
```

Las mismas fallas medidas de yt-dlp que en `references/corpus.md`. Para bajar solo subtítulos cuando el video falla:
`yt-dlp --skip-download --ignore-no-formats-error --write-subs --sub-langs "zh-Hans" "<URL>"` (sin el segundo flag
aborta antes de escribirlos), y luego `corpus.py texto <archivo.srt> --corpus … --id … --titulo "…"`.

## Bilibili sin cuenta (la ruta que funciona)

`yt-dlp` no puede bajar de Bilibili sin sesión: su API de medios responde **HTTP 412** a acceso anónimo o extranjero,
aun imitando a Chrome. Registrar una cuenta exige un SMS que un número de fuera de China normalmente no recibe.

Lo que sí funciona: el **navegador real** reproduce el video porque pasa el anti-bot con su huella completa. De ahí se
toma la URL firmada del audio y se descarga directo. Usa el navegador que el dueño tenga conectado a Levy (la
extensión de Arbrain o el que tenga configurado); en una ventana propia, nunca en sus pestañas.

1. **Descubrir:** abre `https://search.bilibili.com/all?keyword=<término>&order=pubdate` (sin sesión). Extrae las
   tarjetas con un script de página en vez de leer la pantalla entera:
   ```js
   () => [...document.querySelectorAll('.bili-video-card')].slice(0,16).map(c=>{
     const t=c.querySelector('.bili-video-card__info--tit'), up=c.querySelector('.bili-video-card__info--author');
     const d=c.querySelector('.bili-video-card__stats__duration'), a=c.querySelector('a[href*="/video/BV"]');
     return (t?t.title:'')+' | UP:'+(up?up.textContent.trim():'')+' | '+(d?d.textContent.trim():'')+' | '+(a?(a.href.match(/BV[0-9A-Za-z]+/)||[''])[0]:'');
   }).join('\n')
   ```
   Perfil de un canal: `https://space.bilibili.com/<mid>` (seguidores y catálogo).
2. **Capturar el audio:** abre `https://www.bilibili.com/video/<BVID>`, espera unos 3 s y lee:
   ```js
   () => { const pi=window.__playinfo__; if(!pi) return "NO_PLAYINFO";
     const a=pi.data.dash.audio.sort((x,y)=>x.bandwidth-y.bandwidth)[0];
     return JSON.stringify({duration: pi.data.dash.duration, audioUrl: a.baseUrl||a.base_url}); }
   ```
   El de menor ancho de banda basta para reconocer voz. Si sale `NO_PLAYINFO`, busca en el tráfico de red una URL
   `-30216.m4s` (itags de audio: 30216, 30232, 30280, 30250; los `300xx` bajos son video). La URL caduca en minutos:
   descarga de inmediato.
3. **Transcribir:**
   ```bash
   bash .claude/skills/intel/scripts/audio_a_texto.sh --audio-url "<url>" --referer "https://www.bilibili.com" --out <nombre> --lang zh
   python3 .claude/skills/intel/scripts/corpus.py texto /tmp/audio-a-texto/<nombre>.json \
     --corpus contenido/intel/<tema>/bilibili --id <BVID> --titulo "<título>" --url "https://www.bilibili.com/video/<BVID>"
   ```
   Usa whisper local si está instalado, o Groq con la llave del dueño en `GROQ_API_KEY`. Si no hay ninguno, dilo y
   ofrece las dos opciones en una línea. Comprueba la duración que imprime contra la del video: si es mucho menor, la
   descarga se truncó y hay que recapturar la URL.
4. **Videos de varias partes** (`?p=1`, `?p=2`…): cada parte tiene su audio. Repite el paso 2 y 3 por parte o dile al
   dueño cuántas hay.

**Con cuenta** (si algún día el dueño la tiene): exportar su cookie `SESSDATA` permite a yt-dlp bajar directo y en
lote. Es una credencial suya: va al llavero, nunca a un archivo del repo.

## Traducir

Levy traduce directo, sin servicio aparte: fiel, natural, en el español del dueño, con los términos técnicos en inglés
(agent, harness, token, MCP…). Guarda la traducción junto al verbatim como `<archivo>.es.md`; el verbatim original
queda intacto y es el que se cita.

## Curar a quién seguir: la rúbrica del dueño

Arma la rúbrica desde su avatar y sus valores (retrato, oferta), no desde una lista ajena, y guárdala en
`contenido/intel/<ecosistema>/WATCHLIST.md` junto con los creadores elegidos y los términos de búsqueda que funcionan.

- **Se queda:** le habla al mismo tipo de persona que el dueño quiere servir, con el tono que el dueño respeta
  (constructor, práctico, muestra procesos reales).
- **Se salta:** le habla al anti-avatar del dueño (si él sirve a fundadores, el que le habla al empleado con miedo;
  promesas de dinero rápido sin construir nada; cursos genéricos de relleno).
- Lo que traen los términos de búsqueda también se cura: anota cuáles traen avatar y cuáles anti-avatar.

## Cierre de cada captura

Todo destilado termina con el ángulo para el dueño: qué de esto ya tenía, qué le falta al creador y qué se convierte
en contenido, oferta o sistema suyo. Síntesis, no eco: traducir sin aportar criterio no le da nada que otros no tengan.
