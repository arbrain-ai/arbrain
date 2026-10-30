# Tu Arbrain en tu servidor

> **Para la persona.**
>
> Llegas aquí desde `INSTALAR.md`, por uno de estos dos caminos. Los dos están en beta: funcionan, pero todavía no se
> prueban en un servidor real de un alumno; si algo falla, avísalo en el grupo con el texto exacto.
>
> - **Solo en tu servidor (beta):** Arbrain vive en un servidor tuyo en la nube, prendido siempre. Lo abres desde el navegador
>   de cualquier computadora o desde tu teléfono, por tu red privada de Tailscale, aunque tu computadora esté apagada.
>   No hace falta tener Arbrain en tu computadora. Nada queda abierto a internet.
> - **Los dos (espejo, beta):** tu computadora y tu servidor comparten tu memoria y tu plan por tu GitHub privado, y
>   una sola máquina corre las rutinas: la eliges tú. Si ya tienes Arbrain en tu computadora y quieres llevar tu memoria
>   al servidor, este es tu camino.
>
> ### 1 · Renta tu servidor
>
> **Recomendado: Hostinger KVM 2.** 2 vCPU, 8 GB de RAM, 100 GB de disco NVMe, Ubuntu 24.04. Unos **US$8.79 al mes
> pagando 24 meses**; al renovar, US$14.99 al mes (precios publicados el 29 oct 2026).
> **Revisa el precio el día que compres**: cambian seguido.
>
> Por qué ese: 8 GB dan holgura a Arbrain, a Claude Code y a sus rutinas a la vez (2 GB es el mínimo que arranca, sin
> margen); es Intel/AMD, y Arbrain ya publica su programa compilado para Linux de Intel/AMD y de ARM, así que tu
> servidor no compila: lo baja y lo verifica con la firma de la versión; 100 GB alcanzan para años de memoria y
> respaldos; y a 24 meses el precio queda fijo y bajo. Cualquier otro proveedor con Ubuntu 24.04 y acceso SSH sirve
> igual.
>
> - Al crearlo elige **Ubuntu 24.04** y, en «Llave SSH», pega la **llave pública de tu computadora**. ¿No sabes cuál
>   es? Pídesela a tu Claude Code: «dame mi llave SSH pública para mi servidor». Si el proveedor solo te da contraseña
>   de root, también sirve para entrar la primera vez: Claude te dice cómo dejar tu llave y después las contraseñas se
>   apagan.
> - Anota la **IP** del servidor.
>
> ### 2 · Pega el prompt en Claude Code de tu computadora (cambia la IP)
>
> Solo en tu servidor:
>
> ```text
> Instala Arbrain solo en mi servidor siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR.md
> Mi servidor: root@IP-DE-TU-SERVIDOR
> ```
>
> Los dos (espejo):
>
> ```text
> Instala Arbrain en mi computadora y en mi servidor, en modo espejo, siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR.md
> Mi servidor: root@IP-DE-TU-SERVIDOR
> Que mande: mi servidor
> ```
>
> Tu Claude Code entra a tu servidor por SSH con tu llave y hace todo. Si prefieres hacerlo **dentro del servidor** (ya
> tienes ahí Claude Code con tu cuenta), pega solo la primera línea del prompt: el guion se da cuenta de que es un
> servidor.
>
> ### 3 · Lo que solo tú puedes hacer (Claude te avisa en su momento)
>
> - **Entrar a Tailscale** con el enlace que te da Claude, con la **misma cuenta** que usarás en tu teléfono (gratis
>   para uso personal). Es tu red privada: tu servidor no abre ningún puerto a internet.
> - **Abrir una terminal una sola vez** (Mac: Terminal; Windows: PowerShell) y pegar el comando que te da Claude. Ahí,
>   sin que nada pase por el chat: entras con tu **cuenta de Claude** (para el chat), pegas tu **llave de OpenRouter
>   con tope** (para las rutinas) y ves tu **código para entrar**.
> - **Aceptar a GitHub**, solo en espejo: el servidor recibe una llave que sirve únicamente para tu `mi-arbrain`.
>
> ### Tu cuenta de Claude y tus rutinas: por qué van separadas
>
> - **El chat que tú escribes** usa tu cuenta de Claude (Pro o Max): entras con el inicio de sesión oficial de Claude
>   Code en tu servidor, en tu terminal. Arbrain no ve tu contraseña, tu código ni tu sesión. Anthropic lo permite:
>   «Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude
>   subscription» (https://code.claude.com/docs/en/legal-and-compliance).
> - **Las rutinas que corren solas** (tu mañana, tus resúmenes, tu plan al día) **nunca** usan tu plan: los términos de
>   Anthropic no permiten usarlo por medios automáticos salvo con una llave de API (Consumer Terms, sección 3:
>   https://www.anthropic.com/legal/consumer-terms), y los límites de Pro y Max «assume ordinary, individual usage».
>   Van por tu llave de OpenRouter con **tope de gasto** y con **Claude Haiku 5.5**, rápido y barato para esto. Arbrain
>   rechaza una llave sin tope: si algo sale mal, el gasto tiene techo.
> - Si no pagas Claude Pro o Max, el chat también va por tu llave de OpenRouter.
>
> ### Qué cambia frente a tenerlo en tu computadora
>
> | En tu computadora | Solo en tu servidor |
> |---|---|
> | La app de escritorio Arbrain | **«Tu Arbrain»** en tu teléfono (se instala desde el navegador, como app) y el navegador de cualquier computadora con Tailscale |
> | Levy usa tus apps y tu pantalla (computer use) | No existe en el servidor: no hay pantalla. Si lo necesitas, usa el espejo con tu computadora |
> | Leer respuestas en voz alta con la voz de tu computadora | Con la voz del dispositivo donde lo abras (tu teléfono), o con LemonFox si quieres una mejor (Ajustes › Voz) |
> | Dictar con tu llave de Groq | Igual: tu llave gratis de Groq en Ajustes › Voz, desde el navegador |
> | Funciona con tu computadora prendida | Funciona siempre; tu computadora puede estar apagada |
>
> Tus colores, tu logo y tu nombre van en `mi-marca/`, igual que en tu computadora: cambiarlos no hace compilar, así que
> tu servidor sigue usando el programa ya compilado.
>
> **Qué deja puesto en el servidor:** un usuario sin permisos de administrador para Arbrain; Arbrain como servicio que
> arranca solo y se levanta si se cae; SSH solo con llave (sin contraseñas); un firewall que niega todo lo que entra
> salvo SSH y tu red de Tailscale; actualizaciones automáticas de seguridad; Tailscale. Arbrain escucha solo dentro del
> servidor (127.0.0.1) y Tailscale lo publica solo en tu red privada (`tailscale serve`, nunca `funnel`).
>
> **Después, para pegar en Claude Code de tu computadora:**
>
> ```text
> Dame un código para entrar a mi Arbrain siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR-NUBE.md
> Mi servidor: root@IP-DE-TU-SERVIDOR
> ```
>
> ```text
> Conecta mi cuenta de Claude en mi servidor siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR-NUBE.md
> Mi servidor: root@IP-DE-TU-SERVIDOR
> ```

---

## Para Claude

Eres el instalador de Arbrain **en el servidor de la persona**. Llegaste aquí desde `INSTALAR.md` (camino 2, «solo en
tu servidor», o camino 3, «espejo»), o por un pedido suelto de «Después». Valen todas sus «Reglas que no se rompen» y
su tono (español simple, una línea por paso, sin salidas técnicas), con estas diferencias, que aplican **solo dentro
del servidor**:

- **En el servidor sí eres administrador.** Corres como `root` o con `sudo -n`, solo para `apt-get`, el instalador
  oficial de Tailscale y los scripts de `~/Arbrain/arbrain/scripts/instalar/` ya verificados con la firma. En la
  computadora de la persona nunca usas `sudo` ni cambias su SSH, su firewall ni sus llaves.
- **Llaves, sesiones y códigos fuera de tu vista, también aquí.** Nunca pidas, leas ni muestres la llave de
  OpenRouter, la llave privada SSH, tokens, su código para entrar ni nada de su sesión de Claude. Lo que es suyo lo
  hace ella en **su terminal** con `nube.sh conectar` (o `claude`, `llave`, `codigo` por separado): esas órdenes
  escriben en su terminal y se niegan a correr sin ella. Nunca uses ni copies la llave o la sesión de su computadora;
  nunca `claude setup-token`; nunca abras tú el enlace de inicio de sesión de Claude.
- **Cero puertos públicos.** Nunca `tailscale funnel`, nunca abras puertos en el firewall ni hagas que Arbrain escuche
  fuera de `127.0.0.1`. Nunca `tailscale up --authkey`: la sesión de Tailscale la inicia la persona. La web llega a su
  red solo con `nube.sh telefono` (`tailscale serve`).
- **Su servidor no se apaga ni se reinicia** sin que ella lo pida, y no toques nada fuera de lo que dice este guion.

`MODO` es `solo` (camino 2) o `espejo` (camino 3); si llegaste sin saberlo y el prompt no dice «espejo», es `solo`.

### N0 · ¿Dónde estás?

- **En el servidor** (te mandó aquí la detección de Linux sin pantalla): corre cada bloque directo. Si la persona no
  dijo que esto es su servidor, pregúntale una sola vez: «Esta máquina parece un servidor Linux sin pantalla. ¿La
  instalo como tu Arbrain en tu servidor (queda prendido 24/7 y endurecido: SSH solo con llave y firewall)?». Si dice
  que no, vuelve a `INSTALAR.md` y síguelo como una computadora normal.
- **En su computadora** (te dio la dirección de su servidor, por ejemplo `root@203.0.113.10`): todo lo de este guion
  corre **en el servidor**, por SSH con su llave. Guarda la dirección en `S` y prueba el acceso:

  ```bash
  S=root@203.0.113.10
  ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new "$S" 'echo ACCESO_OK $(id -un) $(uname -sm); . /etc/os-release; echo $PRETTY_NAME'
  ```

  - `ACCESO_OK`: sigue. Desde aquí, cada bloque de este guion lo corres en el servidor así (el bloque va entre las
    líneas `BLOQUE`): `ssh -o BatchMode=yes "$S" 'bash -s' <<'BLOQUE'` … `BLOQUE`.
  - `Permission denied`: su llave no está en el servidor. Si no tiene llave, créala (nunca muestres la privada):
    `[ -f ~/.ssh/id_ed25519.pub ] || ssh-keygen -q -t ed25519 -N '' -f ~/.ssh/id_ed25519`, y enséñale solo
    `cat ~/.ssh/id_ed25519.pub`. Dile que la pegue en el panel de su proveedor (sección «Llaves SSH» del servidor) o,
    si tiene contraseña de root, que abra la terminal de su computadora y pegue
    `ssh-copy-id -i ~/.ssh/id_ed25519.pub root@<IP>` (le pedirá la contraseña una vez). Espera su «listo» y vuelve a
    probar.
  - El sistema no es Ubuntu o Debian: dile que el servidor necesita Ubuntu 24.04 (se puede reinstalar desde el panel de
    su proveedor) y detente.

**Pedidos sueltos de «Después»** (ya hay Arbrain en su servidor: `~/Arbrain` existe allá): prueba el acceso como
arriba y salta directo: «código para entrar» → la parte del código del N7; «conecta mi cuenta de Claude» → la parte
de Claude del N7; «llave de OpenRouter» → la parte de la llave del N7; «apaga» → `systemctl stop arbrain`. Nada más.

Dile en tres líneas qué vas a hacer: dejar Arbrain en su servidor y endurecerlo (SSH solo con llave, firewall,
actualizaciones); que la necesitas para entrar a Tailscale y para una terminal suya una sola vez; y, en espejo, para
aceptar una llave en GitHub.

### N1 · Git en el servidor

```bash
[ "$(id -u)" = 0 ] || sudo -n true || { echo NECESITO_ROOT; exit 0; }
command -v git >/dev/null || { R=""; [ "$(id -u)" = 0 ] || R="sudo -n"; $R apt-get update -qq && $R env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl python3 >/dev/null; }
git --version
```

`NECESITO_ROOT`: dile que entre como `root` (o con un usuario con sudo sin contraseña) y detente.

### N2 · Bajar Arbrain y verificar su firma, en el servidor

Corre en el servidor los dos bloques del **PASO 3 de `INSTALAR.md`**, literales (bajar y verificar la firma; crear la
rama `mi-arbrain`). Mismas reglas: `FIRMA_FALLA` = detente. Si `~/Arbrain` ya existe en el servidor y su remoto `dani`
es `https://github.com/arbrain-ai/arbrain`, ya hubo una instalación: salta al N4 (correr otra vez no cambia nada).

### N3 · Su respaldo en GitHub (solo espejo)

Con `MODO=solo`, `MI` queda vacío: su Arbrain nace en el servidor con su propia semilla. Con `MODO=espejo`, desde su
computadora: `git -C ~/Arbrain remote get-url origin 2>/dev/null`. Si es `https://github.com/<usuario>/mi-arbrain`
(con o sin `.git`), sube lo último sin forzar: `git -C ~/Arbrain push -q origin mi-arbrain` (si falla, sigue sin él y
díselo), y usa `MI=git@github.com:<usuario>/mi-arbrain.git` en el N4. Si no tiene respaldo, el espejo lo necesita:
vuelve al PASO 9 de `INSTALAR.md`, opción 1, y regresa.

### N4 · Instalar (endurecer, usuario, servicio)

```bash
bash ~/Arbrain/arbrain/scripts/instalar/nube.sh ${MI:+--mi-arbrain "$MI"}
```

Tarda de 3 a 10 minutos (paquetes, Tailscale, Node). Córrelo con el plazo más largo que tengas; si se corta, vuelve a
correrlo: es seguro, cada paso mira antes de cambiar. Mientras, dile en una línea qué hace (seguridad del servidor,
Arbrain, servicio). La última línea manda:

- `NUBE_OK …`: sigue al N5.
- `NUBE_ESPERA …`: Arbrain está bajando su programa. Revisa cada 15 segundos, hasta 20 minutos, con
  `bash ~/Arbrain/arbrain/scripts/instalar/nube.sh estado` hasta que diga `NUBE_ESTADO`.
- `NUBE_LLAVE_GITHUB <llave pública>`: el servidor necesita permiso para leer y escribir **solo** su `mi-arbrain`. Desde
  su computadora, si `gh auth status` está bien: guarda esa línea (sin el prefijo) en un archivo temporal y corre
  `gh repo deploy-key add <archivo> --repo <usuario>/mi-arbrain --title "Arbrain nube" --allow-write`. Si no, dile que
  abra `https://github.com/<usuario>/mi-arbrain/settings/keys/new`, pegue esa llave pública, marque «Allow write
  access» y guarde. Luego vuelve a correr el N4.
- `NUBE_FALTA <motivo>`: díselo con sus palabras y detente (por ejemplo, sin llave SSH autorizada no se apagan las
  contraseñas, para no dejarla fuera).

### N5 · Tailscale (su red privada)

```bash
nohup tailscale up --hostname="$(cat /home/arbrain/Arbrain/.claude/hooks/.host-slug)" > /root/tailscale-up.log 2>&1 &
sleep 5; grep -o 'https://login.tailscale.com/[^ ]*' /root/tailscale-up.log | head -1
```

Dale ese enlace: que lo abra y entre con **la misma cuenta** de Tailscale de su teléfono (si no tiene, la crea ahí,
gratis). Revisa cada 10 segundos, hasta 10 minutos, con
`tailscale status --json | grep -o '"BackendState": *"[A-Za-z]*"'` hasta que diga `Running`. Si prefiere hacerlo
después, sigue (sin Tailscale no hay N6: con `MODO=solo` díselo, porque es su única forma de entrar).

### N6 · Su Arbrain en su red (navegador y teléfono)

```bash
bash ~/Arbrain/arbrain/scripts/instalar/nube.sh telefono
```

Deja al usuario de Arbrain como operador de Tailscale y publica la web **solo** en su red (`tailscale serve`). Lee la
**última línea**; después de cada arreglo, vuelve a correrlo (cada 20 segundos mientras esperas, hasta 15 minutos):

| Última línea | Qué haces |
|---|---|
| `TELEFONO_ENCENDIDO <dirección>` | Anota la dirección (`https://….ts.net`): sigue al N7. |
| `TELEFONO_FALTA_HTTPS <enlace>` | Dale el enlace: «Pulsa *Enable* para que tu red tenga candado (HTTPS); es un clic». |
| `TELEFONO_SIN_MAGICDNS` | Que active MagicDNS en https://login.tailscale.com/admin/dns («Enable MagicDNS»). |
| `TELEFONO_FALTA_APROBACION` | Su red pide aprobar máquinas: que apruebe esta en https://login.tailscale.com/admin/machines. |
| `TELEFONO_FALTA_SESION …` o `TELEFONO_APAGADO_TAILSCALE` | Vuelve al N5. |
| `TELEFONO_SIN_SERVIDOR` o `TELEFONO_ARRANCANDO` | Espera 15 segundos y repite. |
| `TELEFONO_ERROR` u otra | Detente y dile las tres líneas exactas que salieron para que las pegue en el grupo. |

### N7 · Lo que solo ella hace, en su terminal (una sola vez)

Dile: «Ahora abre una terminal tuya (Mac: Terminal; Windows: PowerShell), pega este comando y sigue lo que te pide.
Ahí entras con tu cuenta de Claude, pegas tu llave de OpenRouter con tope y ves tu código para entrar. Nada de eso
pasa por este chat. Cuando termine, dime qué dice la última línea». El comando, con su dirección en lugar de `<S>`:

```text
ssh -t <S> 'bash ~/Arbrain/arbrain/scripts/instalar/nube.sh conectar'
```

Si estás **dentro del servidor**, que abra otra sesión SSH al servidor (o salga un momento de Claude Code con `/exit`,
corra `bash ~/Arbrain/arbrain/scripts/instalar/nube.sh conectar` y vuelva con `claude --continue`). Antes de dárselo,
explícale en dos líneas lo que va a ver:

1. **Su cuenta de Claude, para el chat** (si paga Pro o Max): Claude Code le muestra un enlace; lo abre en su
   teléfono o su computadora, entra, autoriza y, si la página le muestra un código, lo pega en la terminal.
2. **Su llave de OpenRouter con tope, para las rutinas:** en https://openrouter.ai/settings/keys, Create key, nombre
   «Arbrain servidor», **Credit limit** con lo que acepta gastar al mes (por ejemplo 10). La pega cuando la pida (no se
   ve). Las rutinas corren con Claude Haiku 5.5. Si prefiere después, Enter vacío.
3. **Su código para entrar**, con la dirección `https://….ts.net`.

La última línea dice `NUBE_CONECTAR claude=<…> llave=<…> codigo=<…>`:

- `claude=NUBE_CLAUDE_OK`: el chat usa su cuenta. `NUBE_CLAUDE_FALTA` o `saltado`: el chat va por su llave de
  OpenRouter (si no hay llave, Levy no puede responder hasta que la ponga). Para reintentar solo esta parte:
  `ssh -t <S> 'bash ~/Arbrain/arbrain/scripts/instalar/nube.sh claude'`.
- `llave=NUBE_LLAVE_OK`: rutinas encendidas con tope. `NUBE_LLAVE_FALTA`: casi siempre es una llave sin tope; que cree
  otra con Credit limit y corra `… nube.sh llave`. Sin llave, la nube corre igual, solo sin rutinas.
- `codigo=NUBE_CODIGO_OK`: sigue al N8. Si se le pasaron los 10 minutos: `… nube.sh codigo` le da otro.

Comprueba con `bash ~/Arbrain/arbrain/scripts/instalar/nube.sh estado`: `chat=claude:<plan>` u `openrouter`,
`llave=tope:<n>` y `tailnet=https://….ts.net`.

### N8 · Entrar desde su teléfono y sus computadoras

Dale estos pasos según su dispositivo (en todos, Tailscale encendido con **la misma cuenta**):

- **iPhone:** instala **Tailscale** (App Store) y entra. Abre la dirección `https://….ts.net` en **Safari**, escribe
  el código, y Compartir › **«Agregar a pantalla de inicio»** («Tu Arbrain»). La sesión dura 30 días.
- **Android:** instala **Tailscale** (Google Play) y entra. Abre la dirección en **Chrome**, escribe el código y
  menú ⋮ › **«Instalar app»**.
- **Otra computadora:** instala Tailscale (https://tailscale.com/download), entra, abre la dirección en su navegador y
  escribe el código.

Cada dispositivo nuevo necesita su código: desde uno donde ya entró, Ajustes › **Tu cerebro en el teléfono** ›
«Código para entrar», o en su terminal `… nube.sh codigo`. Si la página no carga: Tailscale de ese dispositivo está
apagado o con otra cuenta.

### N9 · El espejo (solo con `MODO=espejo`)

Si `~/Arbrain/arbrain/scripts/espejo/espejo.mjs` existe en la copia, usa lo que dijo en su prompt sobre qué máquina
manda («Que mande: …»); si no lo dijo, pregúntale una sola cosa: qué máquina corre sus rutinas. Con su respuesta,
vuelve a correr el instalador con sus palabras textuales:

```bash
bash ~/Arbrain/arbrain/scripts/instalar/nube.sh --mi-arbrain "$MI" --espejo --rol lider --cita "<lo que dijo, p. ej. que mande mi servidor>"
# o, si prefiere que siga mandando su compu:  … --espejo --rol ventana
```

La línea final dice `espejo=activo:nube-<host>`. Sin `--cita` no la pongas al mando: nadie se autopromueve.
Desde su computadora (tienes `S`), enciende ahí también el espejo, como ventana, en su copia:
`cd ~/Arbrain && node arbrain/scripts/espejo/espejo.mjs activar --host laptop-<su nombre>`, y reinicia su Arbrain
(`npm run servidor -- detener` en `~/Arbrain/arbrain` y vuelve a arrancarlo como en el PASO 4 de `INSTALAR.md`). Dile
que su computadora se pone al día cada 5 minutos mientras Arbrain corre en modo servidor; con la app de escritorio
todavía no lo hace sola. Si la copia no trae el motor (`espejo=pendiente-motor`), dile que el modo espejo llega en
beta y que su servidor ya quedó listo para recibirlo.

### N10 · Cierra

Corre `bash ~/Arbrain/arbrain/scripts/instalar/nube.sh estado` y dale este resumen:

```text
Tu Arbrain en tu servidor · versión <VERSION> · <IP o nombre>
Entra desde: <https://….ts.net> (teléfono o computadora con Tailscale, misma cuenta)
Chat: <tu cuenta de Claude (plan) / tu llave de OpenRouter / pendiente>
Rutinas: <OpenRouter con tope de US$n, Claude Haiku 5.5 / pendientes de tu llave>
Corre como servicio: arranca solo con el servidor y se levanta si se cae
Seguridad: SSH solo con llave · firewall cerrado salvo SSH y Tailscale · actualizaciones automáticas · nada abierto a internet
Modo espejo: <activado (manda …) / apagado>
Para apagarlo: pídeme «apaga mi Arbrain en mi servidor» (systemctl stop arbrain en el servidor).
```

## Si algo falla

- `nube.sh estado` dice `NUBE_ESPERA` por más de 20 minutos: enséñale `journalctl -u arbrain -n 30 --no-pager` y las
  últimas 20 líneas de `/home/arbrain/.local/share/ai.arbrain.servidor/logs/servidor.log`, y vuelve a correr el N4 una vez.
- La dirección `.ts.net` no carga en un dispositivo: Tailscale apagado o con otra cuenta en ese dispositivo; en el
  servidor, `nube.sh telefono` debe seguir diciendo `TELEFONO_ENCENDIDO`.
- El chat dice que falta su sesión de Claude o que venció: `… nube.sh claude` en su terminal.
- Perdió el acceso por SSH: el panel del proveedor trae una consola web. Desde ahí, como root, puede volver a pegar su
  llave en `/root/.ssh/authorized_keys`. Nunca se activan las contraseñas otra vez.
- En cualquier otro caso: detente, dile qué viste con las palabras exactas del error y que lo pegue en el grupo.
