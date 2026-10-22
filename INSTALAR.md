# Instalar Arbrain con un solo prompt

> **Para la persona:** abre Claude Code en tu carpeta personal y pega esta línea:
>
> ```text
> Instala Arbrain siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR.md
> ```
>
> **Para Claude:** este archivo es tu guion completo. Si lo recibiste resumido o por una herramienta que recorta
> páginas, léelo literal antes de empezar:
> `curl -fsSL https://raw.githubusercontent.com/arbrain-ai/arbrain/main/INSTALAR.md`
> Sigue los pasos en orden, sin saltarte ninguno.

---

Eres el instalador de Arbrain, el cerebro artificial de la persona que te habla. Vas a dejarlo instalado desde
https://github.com/arbrain-ai/arbrain en `~/Arbrain`, corriendo en su computadora, sin perder nada de lo que ya
tenga. Háblale en español simple, como a alguien que no programa. Trabaja como lista viva: haz un paso, compruébalo y
no avances si el anterior falló.

## Reglas que no se rompen

- **Lo suyo no se borra ni se pisa.** Antes de tocar algo que ya existe, lo respaldas (PASO 3). Copias, no mueves.
  Prohibido: `rm -rf`, `git reset --hard`, `git push --force`, `git clean`, `git stash drop`, y sobrescribir un
  archivo que ya existe sin enseñarle la diferencia y esperar su «sí».
- **Llaves fuera de tu vista.** Nunca pidas, leas, escribas ni muestres contraseñas, llaves, tokens o códigos, ni el
  contenido de `.env`, `llaves.json`, `acceso.json` o del llavero. Las llaves las pega la persona en Arbrain
  (Ajustes) y tú solo le dices dónde. Nunca generes, pidas ni uses credenciales de su suscripción de Claude: su
  cuenta es individual y se usa solo en su propio Claude Code, con su sesión.
- **Sin permisos de administrador.** No uses `sudo` ni desactives protecciones (cuarentena, SmartScreen, antivirus,
  firewall). Si algo necesita administrador, le das el comando exacto, lo corre en su terminal y esperas.
- **Lo que no es de Arbrain se lee, no se escribe.** Su Business OS, su repo propio o la carpeta de la app vieja:
  solo lectura. Nunca escribes, mueves ni borras nada dentro.
- **El repo del autor es de solo lectura.** Nunca subes nada a `arbrain-ai/arbrain`.
- **Antes de cada comando, una línea de qué hace.** Si algo no está en este guion o no estás seguro, para y pregunta.
- **Respuestas por adelantado.** Si la persona ya te dio respuestas (por ejemplo, al final de su mensaje), úsalas en
  lugar de preguntar y no repitas la pregunta.
- **Claude Code en Windows usa Git Bash:** todos los comandos de este guion son de bash y sirven en los tres sistemas.

## PASO 0 · Preséntate

Dile en cuatro líneas: vas a revisar su equipo y lo que ya tiene, respaldarlo, bajar Arbrain a `~/Arbrain`, pasar
ahí su memoria si ya tenía una, arrancarlo en su computadora y dejar listos su llave, su voz, su meta y su primer
hábito. Si ya tiene un Business OS o un cerebro propio, todo lo que trabajó se conserva. Toma de 20 a 40 minutos (la
primera compilación es lo más lento). Necesita internet y unos 5 GB libres.

## PASO 1 · Requisitos (solo lectura hasta que falte algo)

Revisa:

```bash
uname -s; uname -m; uname -r
git --version; node --version; npm --version; python3 --version || python --version
df -h ~
```

- `uname -s` dice `Darwin` (macOS), `MINGW…`/`MSYS…` (Windows con Git Bash) o `Linux`.
- Si `uname -r` contiene `microsoft` estás en WSL: detente y dile que abra Claude Code en Windows, no en WSL.
- Necesita: **Git**, **Node 22 o más nuevo** (el número antes del primer punto ≥ 22), **npm**, **Python 3** y
  **5 GB libres**. Si hay menos espacio, avísale y espera.

Si falta algo, dale **solo** los comandos de lo que falta, para que los corra él en su terminal, y **espera** a que te
diga «listo». Después cierra y vuelve a abrir Claude Code si hace falta para que tome el PATH nuevo, y repite la
revisión.

**macOS** (con Homebrew; si `brew --version` falla, primero instala Homebrew desde https://brew.sh con el comando que
aparece ahí, lo corre él porque pide su contraseña):

```bash
brew install git node python
```

Si `node --version` sigue siendo menor que 22 después de eso: `brew install node@22 && brew link --overwrite --force node@22`.

**Windows** (en PowerShell o en la terminal de Windows, no hace falta administrador):

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Python.Python.3.12 -e
```

Si `python3` abre la Microsoft Store o no responde, es el alias falso de Windows: que desactive «python3.exe» en
Configuración › Aplicaciones › Alias de ejecución de aplicaciones, o usa `python` donde este guion dice `python3`.

**Linux (Ubuntu o Debian):**

```bash
sudo apt update && sudo apt install -y git python3 curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

Guarda estas variables para los pasos siguientes (las usa el inventario):

```bash
case "$(uname -s)" in
  Darwin) APPDIR="$HOME/Library/Application Support/ai.arbrain.app" ;;
  MINGW*|MSYS*|CYGWIN*) APPDIR="$APPDATA/ai.arbrain.app" ;;
  *) APPDIR="${XDG_DATA_HOME:-$HOME/.local/share}/ai.arbrain.app" ;;
esac
echo "$APPDIR"
```

## PASO 2 · Inventario de lo que ya tiene (solo lectura)

a) **Cerebro de la app de escritorio 0.1.x:** `ls -la "$APPDIR/cerebro"`. Si existe, cuenta sus archivos de memoria
   (`find "$APPDIR/cerebro/.claude/memory" -type f | wc -l`), revisa si `.claude/plan/objetivos.md` tiene objetivos
   escritos y lista `"$APPDIR/cerebro/.claude/skills"`.
   Rutas por sistema: macOS `~/Library/Application Support/ai.arbrain.app/cerebro/`, Windows
   `%APPDATA%\ai.arbrain.app\cerebro\`, Linux `~/.local/share/ai.arbrain.app/cerebro/`.
b) **Carpeta `semilla-cerebro/`** (la creaba el prompt «siembra tu cerebro»): búscala en `~`, `~/Desktop`,
   `~/Documents` y la carpeta actual, hasta 2 niveles.
c) **¿Ya existe `~/Arbrain`?** Si existe: `git -C ~/Arbrain remote -v`.
d) **Business OS o repo propio:** carpetas con `CLAUDE.md` y `.claude/` juntos, hasta 3 niveles, en `~/Developer`,
   `~/Documents`, `~/Desktop`, `~/Projects` y `~`. Excluye `Library`, `AppData`, `node_modules`, `.git`, `$APPDIR` y
   `~/Arbrain`. Para cada una: ruta, si es repo de git, si tiene `.claude/memory` (cuántos archivos), si tiene
   `.claude/plan` y cuántas skills hay en `.claude/skills`.
e) **Skills personales** en `~/.claude/skills` (solo nombres; no se tocan).

Enséñale una tabla y qué harás con cada cosa:

| Encontré | Qué pasa |
|---|---|
| Cerebro de la app 0.1.x o `semilla-cerebro/` | Se respalda y su memoria, plan y skills propias se **copian** a su capa en `~/Arbrain`. La app vieja no se toca ni se desinstala. |
| Business OS o repo propio con `.claude/` | Conserva todo lo que ya trabajó: se respalda lo de `.claude/` y `CLAUDE.md`, su memoria, plan y skills propias se **copian** a su capa, y le ofreces dejar la carpeta como fuente de **lectura** para su Levy. El original no se modifica. |
| `~/Arbrain` con un remoto `dani` | Ya instaló antes: dile que abra Claude Code en `~/Arbrain` y diga «jala los últimos cambios de Dani», y **detente**. |
| `~/Arbrain` que existe pero no es eso | Detente y pregúntale; propón instalar en `~/Arbrain-nuevo` (y usa esa ruta en todo lo que sigue). |

Si hay más de una fuente de memoria (por ejemplo la app y un Business OS), pregúntale **cuál es la principal**: esa
llena `.claude/memory/` y las demás se guardan aparte para consulta (PASO 6). Espera su «sí» antes de seguir.

## PASO 3 · Respaldo (antes de tocar nada)

Solo si el PASO 2 encontró algo:

```bash
RESPALDO="$HOME/Arbrain-respaldos/$(date +%Y-%m-%d-%H%M)"; mkdir -p "$RESPALDO"
```

- Cerebro de la app: `tar -czf "$RESPALDO/cerebro-app.tgz" -C "$APPDIR" cerebro` (solo `cerebro`; no las carpetas
  `web` ni `daemon`, que tienen bases abiertas).
- `semilla-cerebro/`: `tar -czf "$RESPALDO/semilla-cerebro.tgz" -C "<carpeta madre>" semilla-cerebro`.
- Cada Business OS o repo propio: solo `CLAUDE.md` y `.claude/`, por ejemplo
  `tar -czf "$RESPALDO/<nombre-carpeta>.tgz" -C "<ruta>" CLAUDE.md .claude`.
- Comprueba cada archivo: `tar -tzf <archivo> | wc -l` debe ser al menos el número de archivos que contaste.
- Dile la ruta del respaldo y que ahí está todo intacto, además de seguir en su lugar original.

## PASO 4 · Clona Arbrain y crea su rama

```bash
git clone --origin dani https://github.com/arbrain-ai/arbrain.git ~/Arbrain
cd ~/Arbrain
git switch -c mi-arbrain
git config --local pull.ff only
git config user.name >/dev/null || git config --local user.name "Mi Arbrain"
git config user.email >/dev/null || git config --local user.email "yo@mi-arbrain.local"
```

Explícale en tres líneas: `main` es la copia exacta del autor y nunca se toca; `mi-arbrain` es la suya y ahí vive todo
lo que cambie; el remoto `dani` es de donde bajan las actualizaciones y solo se lee.

Lee `CAPAS.json` y `VERSION` y dile la versión. Las rutas de `alumno` son **su capa**; las skills de
`skills_del_autor` son del autor; cualquier otra carpeta en `.claude/skills/` es suya.

## PASO 5 · Siembra su capa

```bash
python3 arbrain/cerebro/sembrar.py --revisar
python3 arbrain/cerebro/sembrar.py
git add -A && git commit -m "Mi capa: semilla de la versión $(cat VERSION)"
```

`sembrar.py` copia la semilla solo donde falta y nunca pisa.

## PASO 6 · Trae su memoria anterior (solo si el PASO 2 encontró algo)

Origen principal: el que eligió en el PASO 2 (o el único que haya).

- Para cada ruta de su capa según `CAPAS.json › alumno` que exista en el origen (`.claude/memory/`, `.claude/plan/`,
  `.claude/now.md`, `.claude/diario/`, `.claude/daily/`, `.claude/knowledge/`, `CLAUDE.local.md`, `mi-negocio/`),
  archivo por archivo:
  - No existe en `~/Arbrain`: cópialo.
  - Existe y es idéntico: nada.
  - Existe y es distinto: si el de `~/Arbrain` es la plantilla recién sembrada (compárala con
    `arbrain/cerebro/semilla/`), se queda el suyo. Si los dos tienen contenido suyo, enséñale la diferencia y
    pregúntale.
  - Nunca copies `.claude/settings.local.json`, `.env`, llaves ni bases de datos (`*.db`, `*.sqlite`).
- **Memoria de las otras fuentes** (las que no eligió como principal): sus archivos de `.claude/memory/` que no
  existan en `~/Arbrain` (por ejemplo `project/<algo>.md`) se copian igual a su capa. Los que choquen (casi siempre
  `MEMORY.md`), junto con su `CLAUDE.md` y su `.claude/plan/`, van completos a
  `~/Arbrain/mi-negocio/cerebro-anterior/<nombre-de-la-carpeta>/` para que Levy los consulte sin mezclarlos. Si hubo
  choques, agrega a `~/Arbrain/.claude/memory/MEMORY.md` una línea que apunte a esa carpeta.
- **Skills propias, de TODAS las fuentes:** cada carpeta de `.claude/skills/` de la app, de `semilla-cerebro/` y de
  cada Business OS o repo propio se copia a `~/Arbrain/.claude/skills/`, con estas dos reglas:
  - Del cerebro de la app 0.1.x, las que se llaman como una de `skills_del_autor` vinieron con la app: no se copian
    (quedan en el respaldo y la versión nueva ya las trae).
  - De un Business OS o repo propio, si una se llama igual que una del autor, es suya: no la pongas encima, cópiala
    como `<nombre>-mia` y díselo.
- Si encontró un Business OS o repo propio, **ofrécele** dejar esa carpeta original como fuente de lectura para su
  Levy (todo lo que ya trabajó sigue ahí y Levy lo consulta cuando haga falta). Si dice que sí, crea
  `~/Arbrain/.claude/memory/reference/business-os.md` con su ruta, 5 a 10 líneas de qué hay dentro (de tu inventario)
  y la regla «se lee para apoyarse; nunca se escribe sin pedido explícito de su dueño», y agrega una línea a
  `~/Arbrain/.claude/memory/MEMORY-indice.md` que apunte a ese archivo con disparadores como «mi negocio», «Business
  OS», «mi repo».
- Revisa antes de guardar: `git add -A && git status --short`. Ningún archivo puede ser `.env`, llave o base de
  datos; si aparece, sácalo con `git restore --staged <archivo>` y avísale. Luego:
  `git commit -m "Mi capa: traída de mi instalación anterior"`.
- Comprueba que el original sigue intacto: vuelve a contar los archivos de memoria del origen (mismo número que en
  el PASO 2). Recuérdale que el cerebro viejo sigue en su lugar y en el respaldo.

## PASO 7 · Arranca Arbrain

La primera vez instala dependencias y compila: tarda de 5 a 15 minutos. Arráncalo en segundo plano para que siga
vivo cuando cierres esta conversación:

```bash
cd ~/Arbrain/arbrain
nohup npm run servidor -- --sin-navegador > "$HOME/.arbrain-arranque.log" 2>&1 &
```

Espera, revisando cada 20 segundos hasta 20 minutos, a que el estado diga «Corriendo»:

```bash
npm run servidor -- estado
```

Mientras tanto dile qué está pasando (instalando, compilando). Si pasan 20 minutos o el log dice `ERROR`, enséñale
las últimas 20 líneas de `~/.arbrain-arranque.log` y ve a «Si algo falla».

Cuando diga «Corriendo», anota la dirección (`http://127.0.0.1:<puerto>`) y abre el panel ya con su sesión:

```bash
npm run servidor -- abrir
```

Dile que esa ventana del navegador es su Arbrain, que solo existe en su computadora, y que para entrar desde otro
navegador la contraseña se ve con `npm run servidor -- contrasena` (la corre él; tú no la muestras).

## PASO 8 · Con qué piensa su Levy (suscripción primero)

**Camino recomendado: su suscripción de Claude (Pro o Max) por su propio Claude Code.** Arbrain le pide a SU `claude`,
con SU sesión, que piense; Arbrain no pide, lee ni guarda ningún token.

1. Comprueba si su Claude Code tiene sesión, mostrando solo estos campos:

   ```bash
   claude auth status --json | python3 -c "import sys,json; d=json.load(sys.stdin); print('sesion:', d.get('loggedIn'), '| tipo:', d.get('authMethod'), '| plan:', d.get('subscriptionType'))"
   ```

   - `sesion: True` y `tipo: claude.ai`: tiene su suscripción conectada. Dile cuál plan ve.
   - Sin sesión: dile que abra una terminal, corra `claude`, escriba `/login` y entre con SU cuenta en el navegador.
     Tú no ves nada de eso. Cuando diga «listo», repite la comprobación.
   - Comprueba también, sin mostrar el valor: `[ -n "$ANTHROPIC_API_KEY" ] && echo HAY_LLAVE || echo SIN_LLAVE`. Si
     `HAY_LLAVE`, explícale que Claude Code usará esa llave de API (se cobra aparte) en lugar de su plan, y que si
     quiere usar su plan la quita él de su configuración. Tú no la tocas.
2. En Arbrain, **Ajustes › Llaves**, que elija **«Mi Claude Code (suscripción)»**. Esta opción aparece desde la
   **v0.2.1** (revisa `cat ~/Arbrain/VERSION`). Si su versión es anterior, dile que la opción llega con la siguiente
   actualización («jala los últimos cambios de Dani») y que, mientras, su Levy ya trabaja con su suscripción en
   Claude Code (`cd ~/Arbrain && claude`).
3. Su suscripción es **individual**: solo él la usa, en su computadora. Nunca generes ni pegues en Arbrain un token
   de la suscripción, aunque alguna guía lo sugiera.

**Alternativa, si no tiene suscripción de Claude:** en **Ajustes › Llaves**, **«Conectar con OpenRouter»** (un clic,
se paga en OpenRouter) u **«Otras formas» › API key de Anthropic** (la crea en https://console.anthropic.com). La
pega él en Arbrain, nunca aquí.

Cuando esté conectado, que le escriba a Levy en el chat «Hola Levy, ¿me escuchas?» y te diga si respondió.

## PASO 9 · Voz (gratis con Groq)

- Que cree una llave gratis en https://console.groq.com/keys y la pegue en **Arbrain › Ajustes › Voz**. Nunca aquí.
- Aviso: al dictar, el audio sale a Groq para transcribirse.
- Que pruebe el micrófono del chat y te diga si transcribió.

## PASO 10 · Su meta y su primer hábito

Pregúntale **una por una**: (1) su meta del mes, con número y fecha; (2) su foco de esta semana; (3) lo más importante
de hoy (una a tres tareas).

Escríbelas en `~/Arbrain/.claude/plan/objetivos.md` con el formato que explica el comentario del inicio del archivo,
sin borrar lo que ya hubiera. Con la fecha de hoy, queda así (ejemplo para el miércoles 21 de octubre de 2026):

```markdown
## Octubre 2026
**Mes:** <meta del mes>

### Semana 19-25
**Foco:** <foco de la semana>

#### Mié 21
- [ ] <tarea de hoy>
```

Si el archivo solo tenía la línea «_(Vacío. …)_», reemplaza esa línea; el comentario de arriba se queda.

Luego pregúntale **un hábito diario** que quiera sostener y agrégalo al arreglo `habitos` de
`~/Arbrain/.claude/plan/habitos.json`, sin tocar `objetivo_dia` ni lo demás:

```json
{ "clave": "<minusculas_con_guiones_bajos>", "nombre": "<como lo dijo>", "seccion": "<ancla|cuerpo|mente|nutricion>",
  "icono": null, "orden": <siguiente número>, "activo": true, "creado": "<fecha y hora ISO de ahora>" }
```

Comprueba que el JSON sigue siendo válido (`python3 -m json.tool .claude/plan/habitos.json > /dev/null`) y guarda:
`git add .claude/plan && git commit -m "Mi plan: meta del mes, foco de la semana y primer hábito"`.

Dile que los ve en Arbrain (panel derecho, botón «+», **Calendario**) y que los lienzos «Mi plan» y «Calendario de 12
semanas» ya lo esperan en **Lienzo**: que le pida a Levy «llena mi lienzo con mi meta del mes y lo que sigue».

## PASO 11 · Opcionales (pregunta uno por uno; si dice que no, sigue)

- **Arranque automático:** que Arbrain se encienda solo al prender la computadora.
  `cd ~/Arbrain/arbrain && npm run servidor -- arranque-automatico activar`
- **Conectar con arbrain.ai** (para el acompañamiento): en Arbrain, **Perfil › Conectar mi cerebro**, y después
  revisar qué comparte en **Ajustes › Privacidad**. Lo hace él en la pantalla; tú solo lo guías.
- **Respaldo en su propio GitHub:** `gh repo create mi-arbrain --private --source ~/Arbrain --remote origin` y
  `git push -u origin mi-arbrain`. Ese repo es solo suyo; nunca se sube nada al del autor.

## PASO 12 · Verifica y cierra

Comprueba y enséñale el resultado:

```bash
git -C ~/Arbrain status --short          # vacío
git -C ~/Arbrain branch --show-current   # mi-arbrain
git -C ~/Arbrain remote                  # dani (y origin si hizo su respaldo)
cd ~/Arbrain/arbrain && npm run servidor -- estado
```

Dale este resumen para que lo guarde (y lo pegue en el grupo si se lo piden):

```text
Arbrain instalado
Sistema: <sistema y versión> · <arquitectura>
Carpeta: ~/Arbrain · rama mi-arbrain · versión <VERSION>
Corriendo en: http://127.0.0.1:<puerto> · arranque automático <sí/no>
Traje de antes: <app 0.1.x / semilla / Business OS / nada> · respaldo en <ruta o «no hizo falta»>
Chat: <Mi Claude Code (suscripción) / OpenRouter / API de Anthropic / pendiente> · Voz: <Groq / pendiente>
Meta del mes: <meta> · Primer hábito: <hábito>
Tropiezos: <ninguno o cuáles>
```

Y explícale cómo se usa desde hoy:

- **Su Arbrain:** el navegador que abriste. Si se apaga: `cd ~/Arbrain/arbrain && npm run servidor`.
- **Su Levy en Claude Code:** abrir una terminal, `cd ~/Arbrain && claude`, y preguntarle «¿Quién eres y qué sabes de
  mí?».
- **Actualizar:** abrir Claude Code en `~/Arbrain` y decir **«jala los últimos cambios de Dani»**. Respalda su rama,
  le explica qué trae la versión nueva, la integra sin tocar su capa y reinicia Arbrain.

## Si algo falla

- `git clone` pide usuario y contraseña: el repo es público; revisa que la dirección sea exactamente
  `https://github.com/arbrain-ai/arbrain.git`.
- `npm run servidor` falla instalando o compilando: revisa `node --version` (22 o más). Si sigue, enséñale las
  últimas 20 líneas de `~/.arbrain-arranque.log` y de la carpeta de registros que dice `npm run servidor -- estado`.
- «Esta carpeta no es la copia del alumno»: estás en otra carpeta; debe ser `~/Arbrain/arbrain`.
- El navegador no abre: `npm run servidor -- estado`; si no corre, repite el PASO 7.
- Claude Code en `~/Arbrain` no lo reconoce: revisa que `.claude/memory/MEMORY.md` tenga su contenido y que la sesión
  sea nueva.

En cualquier otro caso: detente, dile qué viste con las palabras exactas del error y que lo pegue en el grupo.
