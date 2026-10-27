# Tu cerebro en la nube (beta)

> **Para la persona.**
>
> Tu Arbrain corre en tu computadora. Si quieres que siga trabajando con la compu apagada (rutinas de la mañana,
> resúmenes, tu plan al día), lo instalas también en un **servidor tuyo en la nube**: una computadora Linux rentada a tu
> nombre, sin pantalla, prendida siempre. Es tuya: tus datos y tus llaves no pasan por nadie más.
>
> **1. Renta el servidor** (unos US$7 a US$17 al mes; **revisa el precio el día que compres**, cambia seguido):
>
> - Sistema: **Ubuntu 24.04 LTS**. Tamaño: 1 o 2 vCPU, **4 GB de RAM** (2 GB es el mínimo) y 40 GB de disco o más.
>   Intel/AMD (x86) o ARM sirven igual.
> - Proveedores que lo tienen en ese rango, por ejemplo: Hostinger (KVM 1 o KVM 2, más barato con plazo de un año) o
>   Hetzner (CX22 o CAX11, si hay disponibilidad). Cualquiera con Ubuntu 24.04 y acceso SSH sirve.
> - Al crearlo, en «Llave SSH» pega la **llave pública de tu laptop**. ¿No sabes cuál es? Pídesela a tu Claude Code:
>   «dame mi llave SSH pública para mi servidor». Si el proveedor solo te da contraseña de root, también sirve para
>   entrar la primera vez: Claude te dice cómo dejar tu llave y después las contraseñas se apagan.
> - Anota la **IP** del servidor.
>
> **2. Pega esto en Claude Code, en tu laptop** (cambia la IP):
>
> ```text
> Instala Arbrain en mi servidor siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR.md
> Mi servidor: root@203.0.113.10
> ```
>
> Tu Claude Code entra a tu servidor por SSH con tu llave y hace todo. Si prefieres hacerlo **dentro del servidor**
> (ya tienes ahí Claude Code con tu cuenta), pega solo la primera línea: el guion se da cuenta solo de que es un servidor.
>
> **3. Tres cosas que solo tú puedes hacer** (Claude te avisa en su momento):
>
> - **Tu llave de OpenRouter para la nube, con tope.** Las rutinas del servidor no usan tu suscripción de Claude (los
>   términos de Anthropic no lo permiten para procesos automáticos) ni la llave de tu laptop. En
>   https://openrouter.ai/settings/keys crea una llave nueva llamada «Arbrain nube» con **Credit limit** (por ejemplo
>   US$10). Arbrain la rechaza si no tiene tope: así, si algo sale mal, el gasto tiene techo. La pegas tú en una
>   terminal; no se ve al pegar y nunca pasa por el chat.
> - **Entrar a Tailscale** con la misma cuenta de tu laptop y tu teléfono (gratis para uso personal): es tu red privada;
>   tu servidor no abre ningún puerto a internet.
> - **Aceptar a GitHub**, si tu Arbrain ya tiene respaldo en tu GitHub privado (`mi-arbrain`): el servidor recibe una
>   llave solo para ese repositorio.
>
> **Qué deja puesto en el servidor:** un usuario sin permisos de administrador para Arbrain; Arbrain como servicio que
> arranca solo y se levanta si se cae; SSH solo con llave (sin contraseñas); un firewall que niega todo lo que entra
> salvo SSH y tu red de Tailscale; actualizaciones automáticas de seguridad; Tailscale instalado.
>
> **Modo espejo (beta, viene apagado):** tu laptop y tu nube comparten tu memoria y tu plan por tu GitHub privado, con
> una sola máquina al mando de las rutinas (la eliges tú). Para encenderlo, agrega al prompt del paso 2 una línea:
> «Enciende el modo espejo: que la nube mande». Si no lo pides, tu nube se instala igual y el espejo sigue apagado.

---

## Para Claude

Eres el instalador de Arbrain **en el servidor de la persona** (su nube). Llegaste aquí desde `INSTALAR.md`. Valen
todas sus «Reglas que no se rompen» y su tono (español simple, una línea por paso, sin salidas técnicas), con estas
diferencias, que aplican **solo dentro del servidor**:

- **En el servidor sí eres administrador.** Corres como `root` o con `sudo -n`, solo para `apt-get`, el instalador
  oficial de Tailscale y los scripts de `~/Arbrain/arbrain/scripts/instalar/` ya verificados con la firma. En la laptop
  de la persona nunca usas `sudo` ni cambias su SSH, su firewall ni sus llaves.
- **Llaves fuera de tu vista, también aquí.** Nunca pidas, leas ni muestres la llave de OpenRouter, la llave privada SSH
  ni tokens. La llave de OpenRouter la pega la persona en su terminal (PASO N5). Nunca uses ni copies la llave de su
  laptop ni su sesión de Claude; nunca `claude setup-token`.
- **Cero puertos públicos.** Nunca `tailscale funnel`, nunca abras puertos en el firewall ni hagas que Arbrain escuche
  fuera de `127.0.0.1`. Nunca `tailscale up --authkey`: la sesión de Tailscale la inicia la persona.
- **Su servidor no se apaga ni se reinicia** sin que ella lo pida, y no toques nada fuera de lo que dice este guion.

### N0 · ¿Dónde estás?

- **En el servidor** (te mandó aquí la detección de Linux sin pantalla): corre cada bloque directo. Si la persona no dijo
  que esto es su servidor, pregúntale una sola vez: «Esta máquina parece un servidor Linux sin pantalla. ¿La instalo como
  tu cerebro en la nube (queda prendido 24/7 y endurecido: SSH solo con llave y firewall)?». Si dice que no, vuelve a
  `INSTALAR.md` y síguelo como una computadora normal.
- **En su laptop** (te dio la dirección de su servidor, por ejemplo `root@203.0.113.10`): todo lo de este guion corre
  **en el servidor**, por SSH con su llave. Guarda la dirección en `S` y prueba el acceso:

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

Dile en tres líneas qué vas a hacer: dejar Arbrain en su servidor, endurecerlo (SSH solo con llave, firewall,
actualizaciones), y que la necesitas tres veces: su llave de OpenRouter con tope, entrar a Tailscale y, si tiene
respaldo en GitHub, aceptar una llave.

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

### N3 · Su respaldo en GitHub (si lo tiene)

Solo desde la laptop: `git -C ~/Arbrain remote get-url origin 2>/dev/null`. Si es `https://github.com/<usuario>/mi-arbrain`
(con o sin `.git`), sube lo último sin forzar: `git -C ~/Arbrain push -q origin mi-arbrain` (si falla, sigue sin él y
díselo), y usa `MI=git@github.com:<usuario>/mi-arbrain.git` en el N4. Si no tiene, o estás en el servidor sin esa
información, `MI` queda vacío: la nube arranca con su propia semilla y el espejo se cose después.

### N4 · Instalar la nube (endurecer, usuario, servicio)

```bash
bash ~/Arbrain/arbrain/scripts/instalar/nube.sh ${MI:+--mi-arbrain "$MI"}
```

Tarda de 3 a 10 minutos (paquetes, Tailscale, Node). Córrelo con el plazo más largo que tengas; si se corta, vuelve a
correrlo: es seguro, cada paso mira antes de cambiar. Mientras, dile en una línea qué hace (seguridad del servidor,
Arbrain, servicio). La última línea manda:

- `NUBE_OK …`: sigue al N5.
- `NUBE_ESPERA …`: Arbrain está bajando o compilando su programa. Revisa cada 15 segundos, hasta 20 minutos, con
  `bash ~/Arbrain/arbrain/scripts/instalar/nube.sh estado` hasta que diga `NUBE_ESTADO`.
- `NUBE_LLAVE_GITHUB <llave pública>`: el servidor necesita permiso para leer y escribir **solo** su `mi-arbrain`. Desde
  la laptop, si `gh auth status` está bien: guarda esa línea (sin el prefijo) en un archivo temporal y corre
  `gh repo deploy-key add <archivo> --repo <usuario>/mi-arbrain --title "Arbrain nube" --allow-write`. Si no, dile que
  abra `https://github.com/<usuario>/mi-arbrain/settings/keys/new`, pegue esa llave pública, marque «Allow write
  access» y guarde. Luego vuelve a correr el N4.
- `NUBE_FALTA <motivo>`: díselo con sus palabras y detente (por ejemplo, sin llave SSH autorizada no se apagan las
  contraseñas, para no dejarla fuera).

### N5 · Su llave de OpenRouter con tope (la pega ella)

Dile: «Las rutinas de tu nube necesitan una llave propia con tope de gasto. En https://openrouter.ai/settings/keys pulsa
Create key, ponle de nombre Arbrain nube y en Credit limit pon cuánto aceptas gastar al mes (por ejemplo 10). Copia la
llave». Luego:

- **Desde la laptop:** que abra la Terminal de su computadora (Mac: Terminal; Windows: PowerShell) y pegue
  `ssh -t <S> 'bash ~/Arbrain/arbrain/scripts/instalar/nube.sh llave'` (con su dirección en lugar de `<S>`, y
  las comillas simples tal cual); que pegue la llave cuando la pida (no se ve) y te diga qué contestó.
- **En el servidor:** que abra otra sesión SSH al servidor (o salga un momento de Claude Code) y corra
  `bash ~/Arbrain/arbrain/scripts/instalar/nube.sh llave`.

`NUBE_LLAVE_OK tope=<n>`: lista. `NUBE_LLAVE_FALTA <motivo>`: casi siempre es una llave sin tope; que cree otra con
Credit limit. Comprueba con `nube.sh estado` que diga `llave=tope:<n>`. Si prefiere hacerlo después, sigue: la nube
corre igual, solo sin rutinas.

### N6 · Tailscale (su red privada)

```bash
nohup tailscale up --hostname="$(cat /home/arbrain/Arbrain/.claude/hooks/.host-slug)" > /root/tailscale-up.log 2>&1 &
sleep 5; grep -o 'https://login.tailscale.com/[^ ]*' /root/tailscale-up.log | head -1
```

Dale ese enlace: que lo abra y entre con **la misma cuenta** de Tailscale de su laptop y su teléfono (si no tiene, la
crea ahí, gratis). Revisa cada 10 segundos, hasta 10 minutos, con `tailscale status --json | grep -o '"BackendState": *"[A-Za-z]*"'`
hasta que diga `Running`. Si prefiere hacerlo después, sigue.

### N7 · El espejo

Si `~/Arbrain/arbrain/scripts/espejo/espejo.mjs` existe en la copia y la persona quiere el espejo (beta), pregúntale una
sola cosa: qué máquina corre sus rutinas. Con su respuesta, vuelve a correr el instalador con sus palabras textuales:

```bash
bash ~/Arbrain/arbrain/scripts/instalar/nube.sh --mi-arbrain "$MI" --espejo --rol lider --cita "<lo que dijo, p. ej. que la nube mande>"
# o, si prefiere que siga mandando su compu:  … --espejo --rol ventana
```

La línea final dice `espejo=activo:nube-<host>`. Sin `--cita` no la pongas al mando: nadie se autopromueve.
Si corres desde su laptop (tienes `S`), enciende ahí también el espejo, como ventana, en su copia:
`cd ~/Arbrain && node arbrain/scripts/espejo/espejo.mjs activar --host laptop-<su nombre>`, y reinicia su Arbrain
(`npm run servidor -- detener` en `~/Arbrain/arbrain` y vuelve a arrancarlo como en el PASO 4 de `INSTALAR.md`). Dile que su laptop se pone al día cada 5 minutos mientras Arbrain
corre en modo servidor; con la app de escritorio todavía no lo hace sola. Si la copia no
trae el motor (`espejo=pendiente-motor`), dile que el modo espejo llega en beta y que su nube ya quedó lista para recibirlo.

### N8 · Cierra

Corre `bash ~/Arbrain/arbrain/scripts/instalar/nube.sh estado` y dale este resumen:

```text
Tu cerebro en la nube · versión <VERSION> · servidor <IP o nombre>
Corriendo como servicio: arranca solo con el servidor y se levanta si se cae
Seguridad: SSH solo con llave · firewall cerrado salvo SSH y Tailscale · actualizaciones automáticas
Llave de la nube: <con tope de US$n / pendiente>   ·   Tailscale: <conectado / pendiente>
Modo espejo: <activado / llega en beta>
Para apagarlo: pídeme «apaga mi cerebro en la nube» (systemctl stop arbrain en el servidor).
```

## Si algo falla

- `nube.sh estado` dice `NUBE_ESPERA` por más de 20 minutos: enséñale `journalctl -u arbrain -n 30 --no-pager` y las
  últimas 20 líneas de `/home/arbrain/.local/share/ai.arbrain.servidor/logs/servidor.log`, y vuelve a correr el N4 una vez.
- Perdió el acceso por SSH: el panel del proveedor trae una consola web. Desde ahí, como root, puede volver a pegar su
  llave en `/root/.ssh/authorized_keys`. Nunca se activan las contraseñas otra vez.
- En cualquier otro caso: detente, dile qué viste con las palabras exactas del error y que lo pegue en el grupo.
