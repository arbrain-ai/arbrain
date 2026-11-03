#!/usr/bin/env python3
"""ManosLinux: las manos de Arbrain en la pantalla virtual del modo servidor (1 nov 2026).

Mismo papel que ArbrainManos (macOS) y ManosWindows: el adaptador `linux` (src/manos/adaptadores/linux.ts) habla con
este proceso por JSON en líneas por stdin/stdout ({id, op, ...} → {id, ok, r | error, ms}). Debajo:

  - Pantalla: Xvfb (pantalla :N que no existe físicamente, -nolisten tcp y cookie MIT en un archivo 0600), un bus de
    sesión propio (dbus-daemon), openbox (el foco del teclado) y el bus de accesibilidad (at-spi-bus-launcher). Arranca
    la primera vez que se usa, una sola vez (candado flock), cada pieza en su propia sesión: si el daemon de Arbrain se
    reinicia, la pantalla y el navegador siguen vivos y el siguiente ayudante los retoma. Un vigía la apaga tras
    MANOS_LINUX_INACTIVA_MIN (30) minutos sin uso. Los restos de una pantalla anterior (pid vivo sin pantalla, candado
    de X sin dueño) se limpian antes de arrancar.
  - Lectura: árbol de accesibilidad AT-SPI (gi.repository.Atspi), con refs estables por objeto (ruta D-Bus), roles
    traducidos a los nombres AX que entiende el freno (AXButton, AXTextField, AXWebArea…).
  - Acciones: por accesibilidad primero (Action, EditableText, Value, Selection) y por X (xdotool/XTest) de respaldo.
    En esta pantalla no hay una persona con ratón ni teclado: el foco se puede tomar sin robárselo a nadie.
  - Capturas: Xlib + Pillow (PNG para el modelo, JPEG para la vista privada de la web).

Nada de esto decide si una acción es segura: el freno vive en TypeScript (src/manos/freno.ts) y todo pasa por él antes
de llegar aquí. Este proceso nunca abre puertos: solo stdin/stdout y los sockets locales de la pantalla.

Uso:  python3 manos_linux.py            (servidor JSON por líneas)
      python3 manos_linux.py vigia      (lo lanza el propio ayudante: apaga la pantalla sin uso)
      python3 manos_linux.py estado     (diagnóstico en una línea JSON)
"""
import base64
import fcntl
import io
import json
import os
import re
import secrets
import signal
import socket
import subprocess
import sys
import time
import warnings

# PyGObject marca como obsoletos algunos atajos de AT-SPI; aquí se llaman por su interfaz y el aviso solo ensucia stderr.
warnings.filterwarnings('ignore', category=DeprecationWarning)

VERSION = '0.1.0'
UID = os.getuid()
HOME = os.path.expanduser('~')
ESTADO = os.environ.get('MANOS_LINUX_ESTADO') or os.path.join(HOME, '.local', 'state', 'arbrain', 'pantalla')
PERFIL = os.environ.get('MANOS_LINUX_PERFIL') or os.path.join(HOME, '.local', 'share', 'arbrain', 'pantalla', 'chrome')
MARCADOR = os.environ.get('ARBRAIN_PANTALLA_MARCADOR') or '/etc/arbrain/pantalla-virtual.json'
GEOMETRIA = os.environ.get('MANOS_LINUX_GEOMETRIA') or '1440x900x24'
INACTIVA_S = float(os.environ.get('MANOS_LINUX_INACTIVA_MIN') or 30) * 60


def numero_pantalla(uid=UID, env=os.environ):
    """Pantalla por usuario (:99 para el primero, :100…): dos usuarios del mismo servidor no se pisan."""
    v = (env.get('MANOS_LINUX_PANTALLA') or '').strip()
    if re.fullmatch(r':?\d{1,4}', v):
        return int(v.lstrip(':'))
    return 99 + (uid - 1000 if 1000 <= uid < 1400 else uid % 400)


N = numero_pantalla()
PANTALLA = ':%d' % N
X_SOCKET = '/tmp/.X11-unix/X%d' % N
X_LOCK = '/tmp/.X%d-lock' % N
BUS = os.path.join(ESTADO, 'bus')
XAUTH = os.path.join(ESTADO, 'xauth')
RUNTIME = os.path.join(ESTADO, 'run')
ACTIVIDAD = os.path.join(ESTADO, 'actividad')
ANCHO, ALTO = (int(x) for x in GEOMETRIA.split('x')[:2])
NAVEGADORES = ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/google-chrome']
ATSPI_LAUNCHER = '/usr/libexec/at-spi-bus-launcher'


class Fallo(Exception):
    pass


# ---------------------------------------------------------------- utilidades

def marcador():
    try:
        with open(MARCADOR) as f:
            return json.load(f)
    except Exception:
        return None


def navegador():
    m = marcador() or {}
    for c in [os.environ.get('MANOS_LINUX_NAVEGADOR'), m.get('navegador')] + NAVEGADORES:
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def entorno():
    e = {k: v for k, v in os.environ.items() if k not in ('NO_AT_BRIDGE', 'WAYLAND_DISPLAY')}
    e.update({
        'DISPLAY': PANTALLA, 'XAUTHORITY': XAUTH, 'DBUS_SESSION_BUS_ADDRESS': 'unix:path=' + BUS,
        'XDG_RUNTIME_DIR': RUNTIME, 'QT_ACCESSIBILITY': '1', 'ACCESSIBILITY_ENABLED': '1', 'GTK_A11Y': 'atspi',
        # Mesa por software arranca un hilo por CPU: una página animada llenaría el servidor (lección de Cloudroom).
        'LP_NUM_THREADS': os.environ.get('LP_NUM_THREADS', '2'),
        'HOME': HOME, 'LANG': os.environ.get('LANG') or 'C.UTF-8',
    })
    return e


def escuchando(ruta):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(1)
    try:
        s.connect(ruta)
        return True
    except OSError:
        return False
    finally:
        s.close()


def pidfile(nombre):
    return os.path.join(ESTADO, nombre + '.pid')


def programa_de(pid):
    try:
        with open('/proc/%d/cmdline' % pid, 'rb') as f:
            return f.read().split(b'\0')
    except OSError:
        return []


def vivo(nombre, programa):
    """Pid del proceso del pidfile si sigue vivo y es `programa` (un pid reciclado o un zombi no cuentan)."""
    try:
        with open(pidfile(nombre)) as f:
            pid = int(f.read().split()[0])
    except (OSError, ValueError, IndexError):
        return 0
    partes = programa_de(pid)
    if not partes or not partes[0]:
        return 0
    cmd = partes[0].decode(errors='ignore')
    if os.path.basename(cmd) == programa or cmd == programa or programa in [p.decode(errors='ignore') for p in partes[:3]]:
        return pid
    return 0


def lanzar(nombre, argv, env):
    """Proceso en su propia sesión (sobrevive al ayudante y al daemon) con su log; devuelve su pid."""
    log = os.path.join(ESTADO, nombre + '.log')
    r = subprocess.run(['/bin/sh', '-c', 'L="$1"; shift; setsid "$@" </dev/null >>"$L" 2>&1 & echo $!', 'sh', log] + argv,
                       env=env, capture_output=True, text=True, timeout=10)
    pid = int(r.stdout.strip() or 0)
    if not pid:
        raise Fallo('no pude lanzar %s: %s' % (nombre, r.stderr.strip()[-300:]))
    with open(pidfile(nombre), 'w') as f:
        f.write('%d\n%s\n' % (pid, os.path.basename(argv[0])))
    return pid


def esperar(que, listo, tope=10.0):
    fin = time.time() + tope
    while time.time() < fin:
        if listo():
            return
        time.sleep(0.1)
    raise Fallo('%s no arrancó; mira %s/*.log' % (que, ESTADO))


def terminar(pid, tope=3.0):
    if not pid:
        return
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(pid, sig)
        except OSError:
            try:
                os.kill(pid, sig)
            except OSError:
                return
        fin = time.time() + tope
        while time.time() < fin:
            if not programa_de(pid) or not programa_de(pid)[0]:
                return
            time.sleep(0.1)


def tocar():
    try:
        with open(ACTIVIDAD, 'a'):
            pass
        os.utime(ACTIVIDAD, None)
    except OSError:
        pass


def preparar_estado():
    for d in (ESTADO, RUNTIME):
        os.makedirs(d, mode=0o700, exist_ok=True)
        os.chmod(d, 0o700)


# Procesos de la pantalla, en el orden en que se apagan (el navegador y las apps primero, X al final).
PIEZAS = [('vigia', 'vigia'), ('atspi', ATSPI_LAUNCHER), ('openbox', 'openbox'), ('dbus', 'dbus-daemon'), ('xvfb', 'Xvfb')]


def pantalla_encendida():
    return escuchando(X_SOCKET) and bool(vivo('xvfb', 'Xvfb'))


def apagar(motivo='pedido', si=None):
    """Apaga apps, navegador y pantalla. Lo usa el vigía (sin uso) y `apagar`. `si`: condición que se vuelve a mirar
    con el candado tomado (el vigía no apaga una pantalla que otro ayudante acaba de encender o de usar)."""
    preparar_estado()
    with open(os.path.join(ESTADO, 'pantalla.lock'), 'w') as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        if si is not None and not si():
            return {'apagada': False, 'motivo': 'en uso'}
        for f in os.listdir(ESTADO):
            if f.startswith('app-') and f.endswith('.pid'):
                n = f[:-4]
                try:
                    prog = open(os.path.join(ESTADO, f)).read().split()[1]
                    terminar(vivo(n, prog))
                except (OSError, ValueError, IndexError):
                    pass
                try:
                    os.unlink(os.path.join(ESTADO, f))
                except OSError:
                    pass
        cerrar_navegador()
        for nombre, prog in PIEZAS:
            if nombre == 'vigia' and os.getpid() == vivo('vigia', 'vigia'):
                continue
            terminar(vivo(nombre, prog))
            try:
                os.unlink(pidfile(nombre))
            except OSError:
                pass
        for r in (BUS,):
            try:
                os.unlink(r)
            except OSError:
                pass
    return {'apagada': True, 'motivo': motivo}


def pids_navegador():
    """Procesos de Chrome con el perfil de la pantalla (los de otra persona o de otro perfil no se tocan)."""
    pids = []
    for d in os.listdir('/proc'):
        if not d.isdigit():
            continue
        try:
            if os.stat('/proc/' + d).st_uid != UID:
                continue
        except OSError:
            continue
        # Chrome reescribe la línea de comando de sus procesos (los hijos la dejan en un solo texto con espacios).
        cmd = b' '.join(programa_de(int(d))).decode(errors='ignore') + ' '
        if ('--user-data-dir=' + PERFIL + ' ') in cmd:
            pids.append(int(d))
    return pids


def cerrar_navegador():
    for pid in pids_navegador():
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
    fin = time.time() + 4
    while time.time() < fin and pids_navegador():
        time.sleep(0.2)
    for pid in pids_navegador():
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass


def limpiar_restos():
    """Sin X vivo, lo que quedó de una pantalla anterior no sirve: se termina antes de arrancar otra."""
    cerrar_navegador()
    for nombre, prog in PIEZAS:
        if nombre == 'vigia' and vivo('vigia', 'vigia') == os.getpid():
            continue
        terminar(vivo(nombre, prog))
    for r in (BUS,):
        try:
            os.unlink(r)
        except OSError:
            pass
    # El candado de X solo se quita si nombra un proceso que ya no es Xvfb (si es de otro usuario, no es nuestro).
    try:
        with open(X_LOCK) as f:
            pid = int(f.read().strip())
        partes = programa_de(pid)
        if partes and partes[0] and os.path.basename(partes[0].decode(errors='ignore')) == 'Xvfb':
            raise Fallo('la pantalla %s ya la usa otro Xvfb (pid %d); define MANOS_LINUX_PANTALLA con otro número' % (PANTALLA, pid))
        os.unlink(X_LOCK)
    except (OSError, ValueError):
        pass
    try:
        if os.path.exists(X_SOCKET) and os.stat(X_SOCKET).st_uid == UID:
            os.unlink(X_SOCKET)
    except OSError:
        pass


def dueno_a11y(env):
    """Pid de quien tiene el bus de accesibilidad (org.a11y.Bus) en el bus de sesión, o 0. No lo activa: preguntar por el
    dueño de un nombre no arranca su servicio. (Antes se esperaba con GetAddress, que sí lo activa: mientras arrancaba
    nuestro at-spi-bus-launcher, D-Bus lanzaba otro, el nuestro perdía el nombre y moría, y el pidfile quedaba apuntando
    a un muerto; desde ahí cada ayudante nuevo lanzaba otro condenado y `estado` decía atspi 0. QA del 1 nov 2026.)"""
    r = subprocess.run(['dbus-send', '--session', '--print-reply', '--dest=org.freedesktop.DBus', '/org/freedesktop/DBus',
                        'org.freedesktop.DBus.GetConnectionUnixProcessID', 'string:org.a11y.Bus'],
                       env=env, capture_output=True, text=True, timeout=5)
    m = re.search(r'uint32 (\d+)', r.stdout) if r.returncode == 0 else None
    return int(m.group(1)) if m else 0


def anotar(nombre, pid, programa):
    with open(pidfile(nombre), 'w') as f:
        f.write('%d\n%s\n' % (pid, os.path.basename(programa)))


def asegurar_atspi(env):
    """El bus de accesibilidad. Si ya hay uno en esta sesión (lo arrancó otro ayudante o la activación de D-Bus), se
    adopta; si no, se lanza y se espera sin activar otro. El pidfile nombra siempre al dueño real del bus: así `estado`
    lo cuenta y `apagar` lo termina. Devuelve True si lanzó uno nuevo."""
    if vivo('atspi', ATSPI_LAUNCHER):
        return False
    pid = dueno_a11y(env)
    nuevo = not pid
    if nuevo:
        lanzar('atspi', [ATSPI_LAUNCHER, '--launch-immediately'], env)
        esperar('El bus de accesibilidad (AT-SPI)', lambda: dueno_a11y(env))
        pid = dueno_a11y(env)
    anotar('atspi', pid, ATSPI_LAUNCHER)
    # Quien pregunte «¿hay un lector de pantalla?» (Chrome, Qt, GTK) oye que sí: así publican su árbol.
    for prop in ('IsEnabled', 'ScreenReaderEnabled'):
        subprocess.run(['dbus-send', '--session', '--type=method_call', '--dest=org.a11y.Bus', '/org/a11y/bus',
                        'org.freedesktop.DBus.Properties.Set', 'string:org.a11y.Status', 'string:' + prop, 'variant:boolean:true'],
                       env=env, capture_output=True, timeout=5)
    return nuevo


def asegurar_pantalla():
    """Enciende lo que falte de la pantalla, una sola vez aunque lleguen varios ayudantes a la vez (flock)."""
    if not marcador():
        raise Fallo('la pantalla virtual no está instalada en este servidor (falta %s): corre «bash arbrain/scripts/instalar/nube.sh pantalla» como root' % MARCADOR)
    preparar_estado()
    env = entorno()
    with open(os.path.join(ESTADO, 'pantalla.lock'), 'w') as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        if not pantalla_encendida():
            limpiar_restos()
            # Cookie nueva en cada arranque (MIT-MAGIC-COOKIE-1, archivo 0600): otro usuario del servidor no entra.
            if os.path.exists(XAUTH):
                os.unlink(XAUTH)
            os.close(os.open(XAUTH, os.O_CREAT | os.O_WRONLY, 0o600))
            subprocess.run(['xauth', '-q', '-f', XAUTH, 'add', PANTALLA, '.', secrets.token_hex(16)], env=env, check=True, timeout=10)
            lanzar('xvfb', ['Xvfb', PANTALLA, '-screen', '0', GEOMETRIA, '-nolisten', 'tcp', '-nolisten', 'local', '-auth', XAUTH, '-dpi', '96'], env)
            esperar('La pantalla virtual (Xvfb)', lambda: escuchando(X_SOCKET))
            x_reiniciar()
            ESTADOS.clear()
        if not escuchando(BUS):
            try:
                os.unlink(BUS)
            except OSError:
                pass
            terminar(vivo('dbus', 'dbus-daemon'))
            lanzar('dbus', ['dbus-daemon', '--session', '--nofork', '--nopidfile', '--address=unix:path=' + BUS], env)
            esperar('El bus de sesión', lambda: escuchando(BUS))
        if not vivo('openbox', 'openbox'):
            lanzar('openbox', ['openbox', '--sm-disable'], env)
        asegurar_atspi(env)
        if not vivo('vigia', 'vigia') and os.environ.get('MANOS_LINUX_SIN_VIGIA') != '1':
            lanzar('vigia', [sys.executable, os.path.abspath(__file__), 'vigia'], env)
        tocar()
    for k in ('DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'ACCESSIBILITY_ENABLED'):
        os.environ[k] = env[k]
    os.environ.pop('NO_AT_BRIDGE', None)


def vigia():
    """Apaga la pantalla tras INACTIVA_S sin uso (ni Levy ni la vista privada la miraron) o si X murió."""
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

    def quieta():
        try:
            return time.time() - os.stat(ACTIVIDAD).st_mtime
        except OSError:
            return INACTIVA_S + 1
    while True:
        time.sleep(15)
        if vivo('vigia', 'vigia') != os.getpid():
            return
        if not escuchando(X_SOCKET):
            if apagar('la pantalla ya no estaba', si=lambda: not escuchando(X_SOCKET)).get('apagada'):
                return
        elif quieta() > INACTIVA_S:
            if apagar('sin uso %d min' % (quieta() // 60), si=lambda: quieta() > INACTIVA_S).get('apagada'):
                return


# ---------------------------------------------------------------- X (ventanas, capturas, entrada)

_x = None


def x():
    global _x
    if _x is None:
        from Xlib import display as xdisplay
        # La cookie de la pantalla (MIT-MAGIC-COOKIE-1) vive en XAUTH: sin ella X dice «Authorization required».
        os.environ['XAUTHORITY'] = XAUTH
        os.environ['DISPLAY'] = PANTALLA
        _x = xdisplay.Display(PANTALLA)
    return _x


def x_reiniciar():
    global _x
    try:
        if _x is not None:
            _x.close()
    except Exception:
        pass
    _x = None


def atomo(nombre):
    return x().intern_atom(nombre)


def prop(w, nombre, tipo=None):
    try:
        from Xlib import X
        p = w.get_full_property(atomo(nombre), tipo if tipo is not None else X.AnyPropertyType)
        return p.value if p else None
    except Exception:
        return None


def titulo_x(w):
    v = prop(w, '_NET_WM_NAME', atomo('UTF8_STRING'))
    if v is None:
        v = prop(w, 'WM_NAME')
    if isinstance(v, bytes):
        v = v.decode('utf-8', errors='replace')
    return v or ''


def exe_de(pid):
    try:
        return os.path.basename(os.readlink('/proc/%d/exe' % pid))
    except OSError:
        try:
            return open('/proc/%d/comm' % pid).read().strip()
        except OSError:
            return ''


def ventanas_x():
    """Ventanas de nivel superior que maneja openbox, de la de abajo a la de arriba (z)."""
    from Xlib import X
    raiz = x().screen().root
    ids = prop(raiz, '_NET_CLIENT_LIST_STACKING') or prop(raiz, '_NET_CLIENT_LIST') or []
    activa = (prop(raiz, '_NET_ACTIVE_WINDOW') or [0])[0]
    salida = []
    for z, wid in enumerate(ids):
        try:
            w = x().create_resource_object('window', wid)
            pidv = prop(w, '_NET_WM_PID')
            pid = int(pidv[0]) if pidv is not None and len(pidv) else 0
            g = w.get_geometry()
            o = raiz.translate_coords(w, 0, 0)
            visible = w.get_attributes().map_state == X.IsViewable
            clase = prop(w, 'WM_CLASS')
            if isinstance(clase, bytes):
                clase = clase.split(b'\0')
                clase = clase[1].decode(errors='ignore') if len(clase) > 1 else ''
            salida.append({'id': int(wid), 'pid': pid, 'titulo': titulo_x(w), 'clase': clase or '',
                           'marco': {'x': int(o.x), 'y': int(o.y), 'w': int(g.width), 'h': int(g.height)},
                           'en_pantalla': bool(visible), 'z': z, 'activa': int(wid) == int(activa)})
        except Exception:
            continue
    return salida


def nombre_app(pid, clase=''):
    a = app_atspi(pid)
    if a is not None:
        try:
            n = a.get_name()
            if n:
                return n
        except Exception:
            pass
    e = exe_de(pid)
    if e == 'chrome':
        return 'Google Chrome'
    return clase or e or ('pid %d' % pid)


def ventana_contrato(w):
    return {'id': w['id'], 'pid': w['pid'], 'app': nombre_app(w['pid'], w['clase']), 'titulo': w['titulo'],
            'marco': w['marco'], 'en_pantalla': w['en_pantalla'], 'z': w['z']}


def xdotool(*args, tope=15):
    r = subprocess.run(['xdotool'] + [str(a) for a in args], env=entorno(), capture_output=True, text=True, timeout=tope)
    if r.returncode != 0:
        raise Fallo('xdotool %s: %s' % (args[0], (r.stderr or r.stdout).strip()[-200:]))
    return r.stdout


def activar(wid):
    try:
        xdotool('windowactivate', '--sync', wid, tope=5)
    except Exception:
        try:
            xdotool('windowfocus', '--sync', wid, tope=5)
        except Exception:
            pass


def imagen(region=None):
    """Imagen RGB de la pantalla (o de una región) leída de X."""
    from Xlib import X
    from PIL import Image
    raiz = x().screen().root
    gx, gy, gw, gh = region or (0, 0, ANCHO, ALTO)
    gx, gy = max(0, gx), max(0, gy)
    gw, gh = max(1, min(gw, ANCHO - gx)), max(1, min(gh, ALTO - gy))
    raw = raiz.get_image(gx, gy, gw, gh, X.ZPixmap, 0xffffffff)
    return Image.frombytes('RGB', (gw, gh), raw.data, 'raw', 'BGRX')


def captura_png(ruta=None, ventana=None):
    region = None
    if ventana:
        w = next((v for v in ventanas_x() if v['id'] == int(ventana)), None)
        if w:
            m = w['marco']
            region = (m['x'], m['y'], m['w'], m['h'])
    ruta = ruta or os.path.join(ESTADO, 'captura-%d.png' % int(time.time() * 1000))
    imagen(region).save(ruta, 'PNG')
    os.chmod(ruta, 0o600)
    return ruta


def captura_jpeg(calidad=60, ancho_max=1440):
    im = imagen()
    if ancho_max and im.width > ancho_max:
        from PIL import Image
        im = im.resize((int(ancho_max), int(im.height * ancho_max / im.width)), Image.BILINEAR)
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=max(20, min(90, int(calidad))), optimize=False)
    return base64.b64encode(b.getvalue()).decode(), im.width, im.height


# ---------------------------------------------------------------- AT-SPI

_atspi = None


def A():
    global _atspi
    if _atspi is None:
        import gi
        gi.require_version('Atspi', '2.0')
        from gi.repository import Atspi
        Atspi.init()
        _atspi = Atspi
    return _atspi


def refrescar_atspi():
    """Este proceso no corre un bucle de eventos: antes de cada lectura se atienden los eventos pendientes y se vacía el
    caché de AT-SPI, para leer el estado real (con el caché apagado, Atspi.Cache.NONE, las llamadas se cuelgan: 1 nov)."""
    Atspi = A()
    try:
        from gi.repository import GLib
        ctx = GLib.MainContext.default()
        for _ in range(200):
            if not ctx.pending():
                break
            ctx.iteration(False)
    except Exception:
        pass
    try:
        Atspi.get_desktop(0).clear_cache()
    except Exception:
        pass


def apps_atspi():
    Atspi = A()
    d = Atspi.get_desktop(0)
    salida = []
    for i in range(d.get_child_count()):
        try:
            a = d.get_child_at_index(i)
            if a is None:
                continue
            salida.append((a.get_process_id(), a))
        except Exception:
            continue
    return salida


def app_atspi(pid):
    try:
        for p, a in apps_atspi():
            if p == pid:
                return a
    except Exception:
        return None
    return None


def fresco(acc):
    """Olvida lo que AT-SPI tenía guardado de este elemento (y sus hijos): lo siguiente se lee del programa."""
    try:
        acc.clear_cache()
    except Exception:
        pass
    return acc


def rol_nombre(acc):
    try:
        return acc.get_role_name() or ''
    except Exception:
        return ''


def nombre(acc):
    try:
        return (acc.get_name() or '').strip()
    except Exception:
        return ''


def estados(acc):
    Atspi = A()
    try:
        s = acc.get_state_set()
    except Exception:
        return set()
    salida = set()
    for n in ('ENABLED', 'SENSITIVE', 'CHECKED', 'SELECTED', 'FOCUSED', 'EDITABLE', 'MULTI_LINE', 'SHOWING', 'VISIBLE', 'FOCUSABLE', 'DEFUNCT', 'MODAL', 'EXPANDED', 'PRESSED', 'INDETERMINATE'):
        st = getattr(Atspi.StateType, n, None)
        if st is not None and s.contains(st):
            salida.add(n)
    return salida


def interfaces(acc):
    try:
        return set(acc.get_interfaces() or [])
    except Exception:
        return set()


def atributos(acc):
    try:
        return dict(acc.get_attributes() or {})
    except Exception:
        return {}


def texto_de(acc, maximo=4000):
    try:
        t = acc.get_text_iface()
        if t is None:
            return None
        Atspi = A()
        n = Atspi.Text.get_character_count(acc)
        s = Atspi.Text.get_text(acc, 0, min(n, maximo) if n >= 0 else maximo) or ''
        return s.replace('￼', '').strip()
    except Exception:
        return None


def acciones_de(acc):
    try:
        a = acc.get_action_iface()
        if a is None:
            return []
        Atspi = A()
        return [Atspi.Action.get_action_name(acc, i) for i in range(Atspi.Action.get_n_actions(acc))]
    except Exception:
        return []


def extents(acc):
    Atspi = A()
    try:
        c = acc.get_component_iface()
        if c is None:
            return None
        r = c.get_extents(Atspi.CoordType.SCREEN)
        if r.width <= 0 or r.height <= 0:
            return None
        return {'x': int(r.x), 'y': int(r.y), 'w': int(r.width), 'h': int(r.height)}
    except Exception:
        return None


ROLES = {
    'push button': 'AXButton', 'button': 'AXButton', 'toggle button': 'AXCheckBox', 'push button menu': 'AXMenuButton',
    'check box': 'AXCheckBox', 'radio button': 'AXRadioButton', 'link': 'AXLink',
    'entry': 'AXTextField', 'password text': 'AXTextField', 'spin button': 'AXTextField', 'text': 'AXStaticText',
    'combo box': 'AXPopUpButton', 'menu item': 'AXMenuItem', 'check menu item': 'AXMenuItem', 'radio menu item': 'AXMenuItem',
    'menu': 'AXMenu', 'menu bar': 'AXMenuBar', 'list': 'AXList', 'list box': 'AXList', 'list item': 'AXRow',
    'table': 'AXTable', 'table row': 'AXRow', 'table cell': 'AXCell', 'table column header': 'AXCell', 'table row header': 'AXCell',
    'column header': 'AXCell', 'row header': 'AXCell', 'tree': 'AXOutline', 'tree table': 'AXOutline', 'tree item': 'AXRow',
    'page tab': 'AXRadioButton', 'page tab list': 'AXTabGroup', 'slider': 'AXSlider', 'scroll bar': 'AXScrollBar',
    'progress bar': 'AXProgressIndicator', 'image': 'AXImage', 'icon': 'AXImage', 'heading': 'AXHeading',
    'document web': 'AXWebArea', 'document frame': 'AXWebArea', 'frame': 'AXWindow', 'window': 'AXWindow',
    'dialog': 'AXWindow', 'alert': 'AXWindow', 'file chooser': 'AXWindow', 'tool bar': 'AXToolbar', 'label': 'AXStaticText',
    'static': 'AXStaticText', 'paragraph': 'AXStaticText', 'caption': 'AXStaticText', 'tool tip': 'AXHelpTag',
    'option pane': 'AXWindow', 'status bar': 'AXGroup', 'separator': 'AXSplitter', 'split pane': 'AXSplitGroup',
}
# Roles que solo dan estructura: se omiten si no tienen nombre, valor ni acciones (sus hijos sí cuentan).
ESTRUCTURA = {'panel', 'filler', 'section', 'form', 'grouping', 'landmark', 'block quote', 'article', 'internal frame',
              'scroll pane', 'viewport', 'layered pane', 'root pane', 'glass pane', 'redundant object', 'unknown',
              'application', 'html container', 'description list', 'description term', 'description value', 'static',
              'footer', 'header', 'list', 'table row', 'page tab list', 'tool bar', 'menu bar', 'status bar', 'math',
              'content deletion', 'content insertion', 'mark', 'suggestion', 'comment', 'footnote', 'image map', 'figure',
              'separator', 'split pane', 'canvas', 'embedded'}
EDITABLES = {'entry', 'password text', 'spin button', 'text', 'combo box', 'terminal'}
DIALOGOS = {'dialog', 'alert', 'file chooser', 'option pane'}


def rol_ax(rn, st, acc=None):
    if rn in ('entry', 'text') and 'EDITABLE' in st:
        return 'AXTextArea' if 'MULTI_LINE' in st else 'AXTextField'
    if rn == 'combo box' and 'EDITABLE' in st:
        return 'AXComboBox'
    if rn == 'section' or rn == 'panel' or rn == 'form' or rn == 'grouping':
        return 'AXGroup'
    return ROLES.get(rn, 'AXGroup')


def subrol(rn, st, nm, attrs):
    if rn == 'password text' or attrs.get('text-input-type') == 'password':
        return 'AXSecureTextField'
    if rn in ('entry', 'combo box') and (attrs.get('text-input-type') == 'search' or re.search(r'search|buscar|búsqueda', nm or '', re.I)):
        return 'AXSearchField'
    if rn in DIALOGOS:
        return 'AXDialog'
    return None


class Nodo(object):
    __slots__ = ('acc', 'rn', 'rol', 'sub', 'etiqueta', 'valor', 'acciones', 'marco', 'prof', 'habil', 'st', 'clave')


def valor_de(acc, rn, st, ifs):
    if rn in ('check box', 'radio button', 'toggle button', 'check menu item', 'radio menu item'):
        return '1' if 'CHECKED' in st else '0'
    if 'Value' in ifs and rn in ('slider', 'progress bar', 'scroll bar', 'spin button'):
        try:
            return ('%g' % acc.get_value_iface().get_current_value())
        except Exception:
            pass
    if 'Text' in ifs and (rn in EDITABLES or rn in ('paragraph', 'heading', 'label', 'static', 'caption', 'list item', 'table cell', 'link', 'text')):
        return texto_de(acc)
    return None


def nodo_de(acc, prof):
    n = Nodo()
    n.acc = acc
    n.rn = rol_nombre(acc)
    n.st = estados(acc)
    ifs = interfaces(acc)
    nm = nombre(acc)
    attrs = atributos(acc) if n.rn in ('entry', 'password text', 'combo box', 'push button', 'button') else {}
    n.rol = rol_ax(n.rn, n.st)
    n.sub = subrol(n.rn, n.st, nm, attrs)
    v = valor_de(acc, n.rn, n.st, ifs)
    if n.rn == 'combo box' and not v:
        v = nm
        nm = attrs.get('label') or ''
    if n.rol == 'AXStaticText' and not nm and v:
        pass
    elif n.rol == 'AXStaticText' and nm and not v:
        v, nm = nm, ''
    n.etiqueta = nm or None
    if n.rn in ('link', 'heading') and v and v == nm:
        v = None
    n.valor = v or None
    n.acciones = acciones_de(acc) if 'Action' in ifs else []
    n.marco = extents(acc)
    n.prof = prof
    n.habil = ('ENABLED' in n.st or 'SENSITIVE' in n.st) or n.rn in ESTRUCTURA
    try:
        n.clave = acc.path   # ruta D-Bus del objeto: la misma mientras el elemento exista (refs estables)
    except Exception:
        n.clave = None
    return n


def recortar(s, k):
    return s if len(s) <= k else s[:k] + '…'


def linea(n, r):
    s = '  ' * max(0, n.prof) + '[' + r + '] ' + n.rol
    if n.etiqueta:
        s += ' «' + recortar(n.etiqueta, 80) + '»'
    if n.valor:
        s += ' = ' + recortar(n.valor.replace('\r', '').replace('\n', '⏎'), 80)
    if not n.habil:
        s += ' (inactivo)'
    if 'FOCUSED' in n.st:
        s += ' (foco)'
    return s


def recorrer(acc, prof, lista, cuenta, tope, raiz, en_web, fin_t):
    if cuenta[0] >= tope or time.time() > fin_t:
        cuenta[1] = True
        return
    cuenta[0] += 1
    sub = prof
    rn = rol_nombre(acc)
    web = en_web or rn in ('document web', 'document frame')
    if not raiz:
        st = estados(acc)
        if 'DEFUNCT' in st:
            return
        # Fuera de la vista: en una página sí se lee (el texto de abajo también es la página); en lo nativo, no.
        if not web and 'SHOWING' not in st and 'VISIBLE' not in st and rn not in ('menu item', 'list item', 'page tab', 'table row', 'tree item'):
            return
        n = nodo_de(acc, prof)
        # Ruido: estructura sin nombre ni valor (Chrome le pone «click-ancestor» a casi todo: eso no cuenta como acción)
        # y párrafos o etiquetas vacíos (su texto ya lo trae el hijo que importa).
        util = [a for a in n.acciones if a in ACCIONES_CLIC]
        ruido = ((n.rn in ESTRUCTURA or n.rn in ('paragraph', 'label', 'static', 'text', 'caption')) and not n.etiqueta and not n.valor and not util and 'EDITABLE' not in n.st) \
            or n.rn in ('separator', 'notification') and not n.etiqueta
        if not ruido:
            lista.append(n)
            sub = prof + 1
        # Texto de un párrafo o encabezado ya leído: sus hijos (enlaces) se recorren; las hojas de texto, no.
    try:
        k = acc.get_child_count()
    except Exception:
        return
    for i in range(min(k, 2000)):
        try:
            h = acc.get_child_at_index(i)
        except Exception:
            continue
        if h is not None:
            recorrer(h, sub, lista, cuenta, tope, False, web, fin_t)


class EstadoVentana(object):
    def __init__(self):
        self.ref_por_clave = {}
        self.sig = 1
        self.nodos = {}
        self.lineas = {}


ESTADOS = {}


def puntaje(frame, w):
    """Qué tan bien coincide un marco de AT-SPI con una ventana de X (posición, tamaño y título)."""
    e = extents(frame)
    s = 0.0
    if e:
        m = w['marco']
        s -= (abs(e['x'] - m['x']) + abs(e['y'] - m['y']) + abs(e['w'] - m['w']) + abs(e['h'] - m['h'])) / 50.0
    t = nombre(frame)
    if t and w['titulo'] and (t in w['titulo'] or w['titulo'].startswith(t)):
        s += 20
    return s


def frame_de(w):
    a = app_atspi(w['pid'])
    if a is None:
        return None
    mejor, pm = None, None
    try:
        k = a.get_child_count()
    except Exception:
        return None
    for i in range(k):
        try:
            f = a.get_child_at_index(i)
        except Exception:
            continue
        if f is None:
            continue
        try:
            p = puntaje(f, w)
        except Exception:
            p = -1e9
        if pm is None or p > pm:
            mejor, pm = f, p
    return mejor


def resolver(p):
    """Ventana de X del pedido: `ventana` (id), o la de más arriba de `pid`, o de la app por nombre o ejecutable."""
    vs = ventanas_x()
    if p.get('ventana'):
        w = next((v for v in vs if v['id'] == int(p['ventana'])), None)
        if not w:
            raise Fallo('La ventana %s ya no existe: lista las ventanas otra vez.' % p['ventana'])
        return w
    pid = int(p.get('pid') or 0)
    if not pid and p.get('app'):
        q = str(p['app']).lower()
        for v in vs:
            if q in (exe_de(v['pid']).lower(), nombre_app(v['pid'], v['clase']).lower(), v['clase'].lower()):
                pid = v['pid']
    cand = [v for v in vs if v['pid'] == pid and v['en_pantalla']] if pid else []
    if not cand:
        raise Fallo('No encontré una ventana de %s en la pantalla virtual.' % (p.get('app') or p.get('pid') or 'esa app'))
    return sorted(cand, key=lambda v: v['z'])[-1]


def leer_arbol(w, tope, tiempo_ms):
    f = frame_de(w)
    if f is None:
        return None, [], False
    lista, cuenta = [], [0, False]
    recorrer(f, 0, lista, cuenta, tope, True, False, time.time() + tiempo_ms / 1000.0)
    return f, lista, cuenta[1]


def tiene_web(lista):
    for i, n in enumerate(lista):
        if n.rn in ('document web', 'document frame'):
            return i + 1 < len(lista) and lista[i + 1].prof > n.prof
    return False


def es_navegador_pid(pid):
    return exe_de(pid) in ('chrome', 'chromium', 'firefox', 'firefox-bin')


def observar(p):
    w = resolver(p)
    maximo = int(p.get('max_elementos') or 600)
    tiempo = int(p.get('tiempo_max_ms') or 5000)
    f, lista, truncado_t = leer_arbol(w, maximo * 4, tiempo)
    # Chrome publica el árbol de la página unos cientos de ms después del primer cliente de accesibilidad.
    if f is not None and es_navegador_pid(w['pid']):
        for _ in range(15):
            if tiene_web(lista):
                break
            time.sleep(0.2)
            f, lista, truncado_t = leer_arbol(w, maximo * 4, tiempo)
    est = ESTADOS.setdefault(w['id'], EstadoVentana())
    ordenados, nuevos, lineas_n = [], {}, {}
    for n in lista:
        clave = n.clave or ('x%d' % est.sig)
        r = est.ref_por_clave.get(clave)
        if r is None:
            r = 'e%d' % est.sig
            est.sig += 1
            est.ref_por_clave[clave] = r
        if r in nuevos:
            continue
        nuevos[r] = n
        lineas_n[r] = linea(n, r)
        ordenados.append((r, n))
    cambios = []
    for r, n in ordenados:
        antes = est.lineas.get(r)
        if antes is None:
            cambios.append('+ ' + lineas_n[r].lstrip())
        elif antes != lineas_n[r]:
            cambios.append('~ ' + lineas_n[r].lstrip())
    for r, l in est.lineas.items():
        if r not in lineas_n:
            cambios.append('- ' + l.lstrip())
    est.nodos, est.lineas = nuevos, lineas_n
    consulta = (p.get('consulta') or '').lower()
    if consulta:
        visibles, pila, incluidos = [], [], set()
        for r, n in ordenados:
            while pila and pila[-1][1].prof >= n.prof:
                pila.pop()
            if consulta in lineas_n[r].lower():
                for a in pila:
                    if a[0] not in incluidos:
                        incluidos.add(a[0])
                        visibles.append(a)
                if r not in incluidos:
                    incluidos.add(r)
                    visibles.append((r, n))
            pila.append((r, n))
    else:
        visibles = ordenados
    truncado = len(visibles) > maximo
    visibles = visibles[:maximo]
    elementos, texto = [], []
    for r, n in visibles:
        texto.append(lineas_n[r])
        e = {'ref': r, 'rol': n.rol, 'profundidad': n.prof}
        if n.etiqueta:
            e['etiqueta'] = n.etiqueta
        if n.valor:
            e['valor'] = recortar(n.valor, 4000)
        if n.acciones:
            e['acciones'] = n.acciones
        if n.marco:
            e['marco'] = n.marco
        elementos.append(e)
    salida = {'app': nombre_app(w['pid'], w['clase']), 'bundle': exe_de(w['pid']), 'pid': w['pid'], 'ventana': w['id'],
              'titulo': w['titulo'], 'elementos': elementos, 'texto': '\n'.join(texto), 'total_elementos': len(ordenados),
              'cambios': '\n'.join(cambios)}
    avisos = []
    if f is None:
        avisos.append('esta ventana no publica accesibilidad (AT-SPI): usa captura y clic por coordenadas no existe aquí; prueba otra app')
    if truncado:
        avisos.append('árbol truncado a %d elementos: usa consulta o sube max_elementos' % maximo)
    if truncado_t:
        avisos.append('recorrido cortado por tiempo o tamaño: usa consulta o sube tiempo_max_ms')
    if p.get('ocr'):
        avisos.append('OCR local aún no existe en Linux: usa captura')
    if avisos:
        salida['aviso'] = ' · '.join(avisos)
    if es_navegador_pid(w['pid']):
        u = url_de(f, lista)
        if u:
            salida['url'] = u
    if p.get('captura'):
        salida['captura'] = captura_png(p.get('captura_ruta'), w['id'])
    return salida


def url_de(frame, lista=None):
    """URL de la página de una ventana del navegador: la del documento web que se ve (no la de los paneles internos de
    Chrome, que también son documentos web con chrome://)."""
    docs = [n.acc for n in (lista or []) if n.rn in ('document web', 'document frame')]
    if not docs and frame is not None:
        docs = buscar(frame, lambda a: rol_nombre(a) in ('document web', 'document frame'), 8, 3000)
    candidatas = []
    for d in docs[:8]:
        u = None
        try:
            for k in ('DocURL', 'URI', 'URL'):
                v = A().Document.get_document_attribute_value(d, k)
                if v and re.match(r'^[a-z-]+:', v):
                    u = v
                    break
        except Exception:
            pass
        u = u or atributos(d).get('url') or atributos(d).get('DocURL')
        if u:
            candidatas.append((0 if re.match(r'^https?:', u) else 1, 0 if 'SHOWING' in estados(d) else 1, u))
    return sorted(candidatas)[0][2] if candidatas else None


def buscar(acc, cond, maximo=1, tope=4000):
    salida, pila, vistos = [], [acc], 0
    while pila and len(salida) < maximo and vistos < tope:
        a = pila.pop(0)
        vistos += 1
        try:
            if cond(a):
                salida.append(a)
                continue
            k = a.get_child_count()
        except Exception:
            continue
        for i in range(min(k, 500)):
            try:
                h = a.get_child_at_index(i)
            except Exception:
                continue
            if h is not None:
                pila.append(h)
    return salida


def nodo_por_ref(w, r):
    est = ESTADOS.get(w['id'])
    n = est.nodos.get(r) if est else None
    if n is None:
        raise Fallo('Ref %s desconocido o vencido para esa ventana: vuelve a observar.' % r)
    if 'DEFUNCT' in estados(fresco(n.acc)):
        raise Fallo('El elemento %s ya no existe (la página cambió): vuelve a observar.' % r)
    return n


def centro(n):
    m = extents(n.acc) or n.marco
    if not m:
        return None
    return (m['x'] + m['w'] // 2, m['y'] + m['h'] // 2)


def res(ok, efecto, detalle):
    return {'ok': ok, 'efecto': efecto, 'detalle': detalle}


ACCIONES_CLIC = ['click', 'press', 'activate', 'jump', 'toggle', 'select', 'open', 'invoke', 'expand or contract', 'switch']

TECLAS = {'return': 'Return', 'enter': 'Return', 'tab': 'Tab', 'escape': 'Escape', 'esc': 'Escape', 'up': 'Up', 'down': 'Down',
          'left': 'Left', 'right': 'Right', 'arriba': 'Up', 'abajo': 'Down', 'izquierda': 'Left', 'derecha': 'Right',
          'space': 'space', 'espacio': 'space', 'delete': 'BackSpace', 'borrar': 'BackSpace', 'backspace': 'BackSpace',
          'forwarddelete': 'Delete', 'suprimir': 'Delete', 'home': 'Home', 'end': 'End', 'pageup': 'Prior', 'pagedown': 'Next'}
MODS = {'cmd': 'ctrl', 'command': 'ctrl', 'ctrl': 'ctrl', 'control': 'ctrl', 'option': 'alt', 'alt': 'alt', 'shift': 'shift', 'super': 'super', 'win': 'super', 'meta': 'super'}


def combo_tecla(tecla, mods):
    t = str(tecla or '').strip()
    k = TECLAS.get(t.lower()) or (t.upper() if re.fullmatch(r'f\d{1,2}', t, re.I) else t)
    if not k:
        raise Fallo('tecla necesita un nombre (return, tab, escape, letras…).')
    ms = [MODS[m.lower()] for m in (mods or []) if m.lower() in MODS]
    return '+'.join(ms + [k])


def leer_valor(acc):
    t = texto_de(acc)
    return t if t is not None else nombre(acc)


def clic(w, n, p):
    rn = n.rn
    antes = estados(n.acc)
    acciones = acciones_de(n.acc)
    hecho = None
    for nombre_a in ACCIONES_CLIC:
        if nombre_a in acciones:
            try:
                if A().Action.do_action(n.acc, acciones.index(nombre_a)):
                    hecho = nombre_a
                    break
            except Exception:
                continue
    via = 'accesibilidad (%s)' % hecho if hecho else None
    if not hecho:
        c = centro(n)
        if not c:
            return res(False, 'fallo', 'el elemento no tiene acción de accesibilidad ni posición en pantalla')
        activar(w['id'])
        xdotool('mousemove', '--sync', c[0], c[1], 'click', '1')
        via = 'clic por X en (%d, %d)' % c
    time.sleep(0.15)
    if rn in ('check box', 'radio button', 'toggle button', 'check menu item', 'radio menu item'):
        despues = estados(fresco(n.acc))
        cambio = ('CHECKED' in antes) != ('CHECKED' in despues)
        if cambio or (rn == 'radio button' and 'CHECKED' in despues):
            return res(True, 'confirmado', '%s · %s' % (via, 'marcado' if 'CHECKED' in despues else 'desmarcado'))
        return res(True, 'sin_verificar', '%s · el estado no cambió' % via)
    return res(True, 'sin_verificar', via)


def escribir(w, n, texto, visible):
    if texto is None:
        raise Fallo('escribir necesita texto.')
    acc = n.acc
    antes = texto_de(acc) or ''
    ed = None
    try:
        ed = acc.get_editable_text_iface()
    except Exception:
        ed = None
    if ed is not None and not visible:
        try:
            ok = ed.insert_text(len(antes), texto, len(texto.encode('utf-8')))
        except Exception:
            ok = False
        despues = texto_de(acc) or ''
        if texto in despues and despues != antes:
            return res(True, 'confirmado', 'texto por accesibilidad (EditableText)')
        try:
            ed.set_text_contents(antes + texto)
        except Exception:
            pass
        despues = texto_de(acc) or ''
        if texto in despues and despues != antes:
            return res(True, 'confirmado', 'texto por accesibilidad (EditableText, contenido)')
    # Respaldo: foco en el campo y teclas por X (en la pantalla virtual el foco no es de nadie más).
    activar(w['id'])
    try:
        c = acc.get_component_iface()
        if c is not None:
            c.grab_focus()
    except Exception:
        pass
    if 'FOCUSED' not in estados(fresco(acc)):
        cc = centro(n)
        if cc:
            xdotool('mousemove', '--sync', cc[0], cc[1], 'click', '1')
            time.sleep(0.1)
            xdotool('key', '--clearmodifiers', 'End')
    xdotool('type', '--clearmodifiers', '--delay', '45' if visible else '4', '--', texto, tope=max(15, len(texto) // 5))
    time.sleep(0.1)
    despues = texto_de(acc)
    if despues is not None and texto.strip() and texto.strip() in despues and despues != antes:
        return res(True, 'confirmado', 'teclas por X con el campo enfocado')
    if despues is None:
        return res(True, 'sin_verificar', 'teclas por X (el campo no deja leer su texto)')
    return res(False, 'fallo', 'el campo no aceptó el texto por accesibilidad ni por teclas')


def poner_valor(w, n, valor):
    if valor is None:
        raise Fallo('valor necesita valor.')
    acc, rn = n.acc, n.rn
    if rn == 'combo box' or n.rol in ('AXPopUpButton', 'AXComboBox'):
        q = str(valor).strip().lower()
        ops = buscar(acc, lambda a: rol_nombre(a) in ('menu item', 'list item', 'option', 'check menu item', 'radio menu item') and nombre(a).lower() == q, 1, 800)
        if not ops:
            ops = buscar(acc, lambda a: rol_nombre(a) in ('menu item', 'list item', 'option') and q in nombre(a).lower(), 1, 800)
        if ops:
            o = ops[0]
            acciones = acciones_de(o)
            for an in ACCIONES_CLIC:
                if an in acciones:
                    try:
                        A().Action.do_action(o, acciones.index(an))
                        break
                    except Exception:
                        continue
            else:
                try:
                    padre = o.get_parent()
                    padre.get_selection_iface().select_child(o.get_index_in_parent())
                except Exception:
                    pass
            time.sleep(0.2)
            ahora = (nombre(fresco(acc)) or texto_de(acc) or '').strip().lower()
            if q in ahora:
                return res(True, 'confirmado', 'opción «%s» elegida por accesibilidad' % nombre(o))
            return res(True, 'sin_verificar', 'opción «%s» elegida; el control dice «%s»' % (nombre(o), ahora))
        return res(False, 'fallo', 'no hay una opción «%s» en ese control' % valor)
    try:
        vi = acc.get_value_iface()
    except Exception:
        vi = None
    if vi is not None and rn in ('slider', 'spin button', 'scroll bar'):
        try:
            vi.set_current_value(float(valor))
            return res(True, 'confirmado' if abs(vi.get_current_value() - float(valor)) < 1e-6 else 'sin_verificar', 'valor por accesibilidad (Value)')
        except Exception as e:
            return res(False, 'fallo', 'valor: %s' % e)
    try:
        ed = acc.get_editable_text_iface()
    except Exception:
        ed = None
    if ed is not None:
        try:
            ed.set_text_contents(str(valor))
        except Exception:
            pass
        if (texto_de(acc) or '') == str(valor):
            return res(True, 'confirmado', 'contenido por accesibilidad (EditableText)')
        activar(w['id'])
        try:
            acc.get_component_iface().grab_focus()
        except Exception:
            pass
        xdotool('key', '--clearmodifiers', 'ctrl+a')
        xdotool('type', '--clearmodifiers', '--delay', '4', '--', str(valor))
        if (texto_de(acc) or '') == str(valor):
            return res(True, 'confirmado', 'contenido por teclas (X)')
        return res(False, 'fallo', 'el campo no aceptó el valor')
    if rn in ('check box', 'radio button', 'toggle button'):
        quiere = str(valor).strip().lower() in ('1', 'true', 'sí', 'si', 'yes', 'on', 'marcado')
        if ('CHECKED' in estados(fresco(acc))) != quiere:
            return clic(w, n, {})
        return res(True, 'confirmado', 'ya estaba %s' % ('marcado' if quiere else 'desmarcado'))
    return res(False, 'fallo', 'ese elemento (%s) no acepta un valor' % n.rol)


def actuar(p):
    w = resolver(p)
    accion = p.get('accion')
    r = p.get('ref')
    n = nodo_por_ref(w, r) if r else None
    if accion == 'click':
        if not n:
            raise Fallo('click necesita ref (observa la ventana y usa el ref del elemento).')
        return clic(w, n, p)
    if accion == 'escribir':
        if not n:
            activar(w['id'])
            xdotool('type', '--clearmodifiers', '--delay', '45' if p.get('visible') else '4', '--', p.get('texto') or '')
            return res(True, 'sin_verificar', 'teclas por X en la ventana enfocada')
        return escribir(w, n, p.get('texto'), bool(p.get('visible')))
    if accion == 'tecla':
        activar(w['id'])
        if n:
            try:
                n.acc.get_component_iface().grab_focus()
            except Exception:
                pass
        combo = combo_tecla(p.get('tecla'), p.get('modificadores'))
        xdotool('key', '--clearmodifiers', combo)
        time.sleep(0.1)
        return res(True, 'sin_verificar', 'tecla %s por X' % combo)
    if accion == 'scroll':
        c = centro(n) if n else (w['marco']['x'] + w['marco']['w'] // 2, w['marco']['y'] + w['marco']['h'] // 2)
        boton = {'arriba': 4, 'abajo': 5, 'izquierda': 6, 'derecha': 7}.get(p.get('direccion') or 'abajo', 5)
        veces = max(1, min(50, int(p.get('cantidad') or 3)))
        xdotool('mousemove', '--sync', c[0], c[1], 'click', '--repeat', veces, '--delay', 20, boton)
        return res(True, 'sin_verificar', 'rueda %s ×%d' % (p.get('direccion') or 'abajo', veces))
    if accion == 'valor':
        if not n:
            raise Fallo('valor necesita ref.')
        return poner_valor(w, n, p.get('valor'))
    raise Fallo('acción desconocida: %s' % accion)


def verificar(p):
    w = resolver(p)
    f, lista, _ = leer_arbol(w, 5000, 8000)
    detalles, todo = [], True
    for e in p.get('espera') or []:
        rol, etq, val = e.get('rol'), e.get('etiqueta_contiene'), e.get('valor')
        cand = [n for n in lista if (rol is None or n.rol == rol) and (etq is None or etq.lower() in ((n.etiqueta or '') + ' ' + (n.valor or '')).lower())]
        ok = bool(cand)
        if ok and val is not None:
            ok = any((n.valor if n.valor is not None else (n.etiqueta or '')).strip() == str(val).strip() for n in cand)
        if ok and 'habilitado' in e:
            ok = any(n.habil == bool(e['habilitado']) for n in cand)
        if ok and 'seleccionado' in e:
            ok = any((('CHECKED' in n.st) or ('SELECTED' in n.st)) == bool(e['seleccionado']) for n in cand)
        d = ('✓ ' if ok else '✗ ') + (rol or '*') + (' «%s»' % etq if etq else '') + (' = %s' % val if val is not None else '')
        if not ok:
            d += ' (no existe)' if not cand else ' (valor: %s)' % (cand[0].valor or cand[0].etiqueta)
        detalles.append(d)
        todo = todo and ok
    if f is None:
        return {'cumple': 'desconocido', 'detalle': 'la ventana no publica accesibilidad'}
    return {'cumple': todo, 'detalle': ' · '.join(detalles)}


def contexto(p):
    w = resolver(p)
    r = p.get('ref')
    acc = nodo_por_ref(w, r).acc if r else None
    pid = w['pid']
    c = {'bundle': exe_de(pid), 'app': nombre_app(pid, w['clase']), 'plataforma': 'linux', 'ventana': {'titulo': w['titulo']}}
    f = frame_de(w)
    if acc is None and f is not None:
        foco = buscar(f, lambda a: 'FOCUSED' in estados(a), 1, 3000)
        acc = foco[0] if foco else None
    if acc is not None:
        rn = rol_nombre(acc)
        st = estados(acc)
        attrs = atributos(acc)
        nm = nombre(acc)
        el = {'rol': rol_ax(rn, st)}
        sr = subrol(rn, st, nm, attrs)
        if sr:
            el['subrol'] = sr
        if nm:
            el['titulo'] = nm
        try:
            d = acc.get_description()
            if d:
                el['descripcion'] = d
        except Exception:
            pass
        if attrs.get('placeholder-text'):
            el['placeholder'] = attrs['placeholder-text']
        if attrs.get('id'):
            el['dom_id'] = attrs['id']
            el['identificador'] = attrs['id']
        if attrs.get('class'):
            el['dom_clases'] = attrs['class'][:200]
        if attrs.get('name'):
            el['identificador'] = el.get('identificador') or attrs['name']
        v = texto_de(acc)
        if v:
            el['valor_largo'] = len(v)
        a = acciones_de(acc)
        if a:
            el['acciones'] = a
        c['elemento'] = el
        anc, dentro = [], []
        x_ = acc
        for _ in range(40):
            try:
                x_ = x_.get_parent()
            except Exception:
                x_ = None
            if x_ is None:
                break
            prn = rol_nombre(x_)
            if prn == 'application':
                break
            pr = 'AXWebArea' if prn in ('document web', 'document frame') else rol_ax(prn, set())
            if prn in ('document web', 'document frame') and 'web' not in dentro:
                dentro.append('web')
            if prn in DIALOGOS and 'dialogo' not in dentro:
                dentro.append('dialogo')
            if prn == 'form':
                pr = 'AXGroup «formulario»' if not nombre(x_) else 'AXGroup «%s»' % recortar(nombre(x_), 60)
                anc.append(pr)
                continue
            nmx = nombre(x_)
            anc.append(pr if not nmx else '%s «%s»' % (pr, recortar(nmx, 60)))
            if prn == 'frame':
                break
        c['ancestros'] = anc
        c['dentro_de'] = dentro
        if 'dialogo' in dentro:
            dlg = buscar(f, lambda a: rol_nombre(a) in DIALOGOS, 1, 3000) if f is not None else []
            if dlg:
                textos = [texto_de(t) or nombre(t) for t in buscar(dlg[0], lambda a: rol_nombre(a) in ('label', 'paragraph', 'static', 'text'), 6, 400)]
                c['dialogo'] = {'tipo': rol_nombre(dlg[0]), 'texto': ' '.join(t for t in textos if t)[:400]}
    if es_navegador_pid(pid):
        u = url_de(f)
        if u:
            c['url'] = u
    return c


def pagina(p):
    w = resolver(p)
    f = frame_de(w)
    titulo = re.sub(r'\s+[-–—]\s+(Google Chrome|Chromium|Mozilla Firefox)$', '', w['titulo'] or '')
    return {'ventana': w['id'], 'titulo_pagina': titulo, 'url': url_de(f)}


def medios(p):
    """Chrome de la pantalla corre con --mute-audio y sin reproducción automática; si hay un botón de pausa, se toca."""
    t0 = time.time()
    w = resolver(p)
    f = frame_de(w)
    acciones = ['Chrome de la pantalla corre con --mute-audio y autoplay bloqueado']
    pausado = reproductor = False
    if f is not None:
        bs = buscar(f, lambda a: rol_nombre(a) in ('push button', 'button', 'toggle button') and re.search(r'^(pausa|pause)\b', nombre(a), re.I) is not None, 1, 3000)
        if bs:
            reproductor = True
            try:
                an = acciones_de(bs[0])
                A().Action.do_action(bs[0], an.index('press') if 'press' in an else 0)
                pausado = True
                acciones.append('botón «%s»' % nombre(bs[0]))
            except Exception:
                pass
        elif buscar(f, lambda a: rol_nombre(a) in ('video', 'audio'), 1, 3000):
            reproductor = True
    return {'silenciado': True, 'pausado': pausado or not reproductor, 'reproductor': reproductor, 'acciones': acciones,
            'ms': int((time.time() - t0) * 1000), 'url': url_de(f)}


# ---------------------------------------------------------------- apps

def apps():
    vs = ventanas_x()
    activa = next((v['pid'] for v in vs if v.get('activa')), 0)
    vistos, salida = set(), []
    for v in vs:
        if v['pid'] and v['pid'] not in vistos:
            vistos.add(v['pid'])
            salida.append({'nombre': nombre_app(v['pid'], v['clase']), 'bundle': exe_de(v['pid']), 'pid': v['pid'], 'activa': v['pid'] == activa})
    return salida


ESCRITORIO = ['/usr/share/applications', '/usr/local/share/applications', os.path.join(HOME, '.local', 'share', 'applications')]


def args_navegador(nav, url=None):
    a = [nav, '--user-data-dir=' + PERFIL, '--no-first-run', '--no-default-browser-check', '--password-store=basic',
         '--force-renderer-accessibility', '--window-position=0,0', '--window-size=%d,%d' % (ANCHO, ALTO),
         '--mute-audio', '--autoplay-policy=user-gesture-required', '--disable-features=Translate,MediaRouter,DialMediaRouteProvider',
         '--disable-session-crashed-bubble', '--hide-crash-restore-bubble', '--lang=' + (os.environ.get('MANOS_LINUX_IDIOMA') or 'es-419')]
    if url:
        a += ['--new-window', url]
    return a


def es_chrome(nombre_app_):
    return re.fullmatch(r'(google[ -]?chrome(-stable)?|chrome|chromium|navegador|browser|com\.google\.chrome)', nombre_app_.strip(), re.I) is not None


def desde_escritorio(q):
    """Ejecutable de una app instalada por su nombre visible o su .desktop (sin terminal)."""
    ql = q.lower()
    for d in ESCRITORIO:
        try:
            archivos = sorted(os.listdir(d))
        except OSError:
            continue
        for a in archivos:
            if not a.endswith('.desktop'):
                continue
            try:
                txt = open(os.path.join(d, a), encoding='utf-8', errors='ignore').read()
            except OSError:
                continue
            sec = txt.split('[Desktop Entry]', 1)[-1].split('\n[', 1)[0]
            campos = dict(re.findall(r'^([A-Za-z\[\]@_-]+)=(.*)$', sec, re.M))
            if campos.get('Terminal', 'false').lower() == 'true' or campos.get('NoDisplay', 'false').lower() == 'true':
                continue
            nombres = [v.lower() for k, v in campos.items() if k == 'Name' or k.startswith('Name[')] + [a[:-8].lower()]
            if ql in nombres and campos.get('Exec'):
                return [t for t in re.sub(r'%[a-zA-Z]', '', campos['Exec']).split() if t]
    return None


def abrir(app):
    asegurar_pantalla()
    q = str(app or '').strip()
    if not q:
        raise Fallo('abrir necesita el nombre de una app.')
    antes = {v['id'] for v in ventanas_x()}
    if es_chrome(q):
        nav = navegador()
        if not nav:
            raise Fallo('no hay navegador instalado en la pantalla (corre nube.sh pantalla)')
        argv = args_navegador(nav, 'about:blank')
        clave = 'app-navegador'
    else:
        argv = desde_escritorio(q)
        if not argv:
            raise Fallo('no encontré la app «%s» en este servidor (en la pantalla virtual hay: Google Chrome)' % q)
        clave = 'app-' + re.sub(r'[^a-z0-9]+', '-', q.lower())[:30]
    lanzar(clave, argv, entorno())
    nuevas = esperar_ventanas(antes, 20)
    pid = nuevas[0]['pid'] if nuevas else 0
    return {'pid': pid, 'ventanas': [ventana_contrato(v) for v in nuevas]}


def esperar_ventanas(antes, tope):
    fin = time.time() + tope
    while time.time() < fin:
        x_reiniciar()
        nuevas = [v for v in ventanas_x() if v['id'] not in antes and v['en_pantalla'] and v['marco']['h'] > 150]
        if nuevas:
            return nuevas
        time.sleep(0.25)
    return []


def abrir_url(p):
    asegurar_pantalla()
    url = str(p.get('url') or '')
    if not re.match(r'^https?://', url, re.I):
        raise Fallo('solo http(s): «%s»' % url[:120])
    nav = navegador()
    if not nav:
        raise Fallo('no hay navegador instalado en la pantalla (corre nube.sh pantalla)')
    antes = {v['id'] for v in ventanas_x()}
    vivo_nav = bool(pids_navegador())
    lanzar('app-navegador' if not vivo_nav else 'abrir-url', args_navegador(nav, url), entorno())
    nuevas = esperar_ventanas(antes, 25)
    if not nuevas:
        raise Fallo('el navegador no mostró la ventana en 25 s (mira %s/app-navegador.log)' % ESTADO)
    w = nuevas[-1]
    activar(w['id'])
    return {'pid': w['pid'], 'ventanas': [ventana_contrato(w)]}


def salud():
    m = marcador()
    faltan = [b for b in ('Xvfb', 'xauth', 'openbox', 'dbus-daemon', 'xdotool') if not any(os.access(os.path.join(d, b), os.X_OK) for d in os.environ.get('PATH', '/usr/bin:/bin').split(':') + ['/usr/bin'])]
    try:
        import gi
        gi.require_version('Atspi', '2.0')
        from gi.repository import Atspi  # noqa: F401
        atspi = 'AT-SPI 2'
    except Exception as e:
        atspi = 'sin AT-SPI (%s)' % e
        faltan.append('python3-pyatspi')
    try:
        import Xlib  # noqa: F401
        import PIL  # noqa: F401
    except Exception:
        faltan.append('python3-xlib/python3-pil')
    nav = navegador()
    if not nav:
        faltan.append('google-chrome-stable')
    return {'ok': bool(m) and not faltan, 'version': VERSION, 'pantalla': PANTALLA, 'geometria': GEOMETRIA, 'encendida': pantalla_encendida(),
            'navegador': nav, 'atspi': atspi, 'marcador': MARCADOR if m else None, 'faltan': faltan}


def memoria_kb(pid):
    """Memoria proporcional (PSS) del proceso: Chrome comparte páginas entre sus procesos y sumar RSS las contaría
    varias veces (1.2 GB de RSS eran ~560 MB reales el 1 nov). Sin smaps_rollup, RSS."""
    for archivo, clave in (('smaps_rollup', 'Pss:'), ('status', 'VmRSS:')):
        try:
            for l in open('/proc/%d/%s' % (pid, archivo)):
                if l.startswith(clave):
                    return int(l.split()[1])
        except OSError:
            continue
    return 0


def estado_pantalla():
    procesos = {}
    for nombre_p, prog in PIEZAS:
        procesos[nombre_p] = vivo(nombre_p, prog)
    nav = pids_navegador()
    pantalla_kb = sum(memoria_kb(p) for p in procesos.values() if p)
    nav_kb = sum(memoria_kb(p) for p in nav)
    encendida = pantalla_encendida()
    try:
        ultima = int(time.time() - os.stat(ACTIVIDAD).st_mtime)
    except OSError:
        ultima = None
    return {'encendida': encendida, 'pantalla': PANTALLA, 'geometria': GEOMETRIA, 'procesos': procesos, 'navegador_procesos': len(nav),
            'memoria_mb': {'pantalla': round(pantalla_kb / 1024.0, 1), 'navegador': round(nav_kb / 1024.0, 1)},
            'ventanas': len(ventanas_x()) if encendida else 0, 'sin_uso_s': ultima, 'apaga_tras_s': int(INACTIVA_S), 'instalada': bool(marcador())}


# ---------------------------------------------------------------- despacho

def despachar(op, p):
    if op == 'salud':
        return salud()
    if op == 'estado':
        return estado_pantalla()
    if op == 'captura_jpeg':
        # La vista privada de la web no enciende la pantalla: si está apagada, lo dice.
        if not pantalla_encendida():
            return {'apagada': True}
        for k in ('DISPLAY', 'XAUTHORITY'):
            os.environ[k] = entorno()[k]
        tocar()
        try:
            b64, an, al = captura_jpeg(p.get('calidad') or 60, p.get('ancho_max') or ANCHO)
        except Exception:
            x_reiniciar()
            b64, an, al = captura_jpeg(p.get('calidad') or 60, p.get('ancho_max') or ANCHO)
        return {'apagada': False, 'jpeg': b64, 'ancho': an, 'alto': al}
    if op == 'apagar':
        x_reiniciar()
        return apagar('pedido')
    asegurar_pantalla()
    tocar()
    if op in ('apps', 'ventanas', 'observar', 'actuar', 'verificar', 'contexto', 'pagina', 'medios', 'abrir', 'abrir_url'):
        refrescar_atspi()
    if op == 'pantalla':
        return estado_pantalla()
    if op == 'apps':
        return apps()
    if op == 'ventanas':
        vs = ventanas_x()
        if p.get('pid'):
            vs = [v for v in vs if v['pid'] == int(p['pid'])]
        elif p.get('app'):
            q = str(p['app']).lower()
            vs = [v for v in vs if q in (exe_de(v['pid']).lower(), nombre_app(v['pid'], v['clase']).lower(), v['clase'].lower())]
        return [ventana_contrato(v) for v in vs]
    if op == 'abrir':
        return abrir(p.get('app'))
    if op == 'abrir_url':
        return abrir_url(p)
    if op == 'observar':
        return observar(p)
    if op == 'actuar':
        return actuar(p)
    if op == 'verificar':
        return verificar(p)
    if op == 'contexto':
        return contexto(p)
    if op == 'pagina':
        return pagina(p)
    if op == 'medios':
        return medios(p)
    if op == 'mostrar':
        activar(resolver(p)['id'])
        return {'ok': True}
    if op == 'cursor':
        q = x().screen().root.query_pointer()
        return {'x': int(q.root_x), 'y': int(q.root_y)}
    if op == 'inactividad':
        # En la pantalla virtual no hay persona: nadie toca ratón ni teclado.
        return {'segundos': 1e9}
    if op == 'captura':
        return {'ruta': captura_png(p.get('ruta'), p.get('ventana'))}
    if op == 'soltar':
        return {}
    raise Fallo('op desconocida: %s' % op)


SIN_PANTALLA = {'salud', 'estado', 'captura_jpeg', 'apagar'}


def servir():
    """JSON por líneas. Lee stdin con su propio búfer (no el de Python) para que un reemplazo del proceso no pierda pedidos."""
    salida = sys.stdout
    if os.environ.get('MANOS_LINUX_DEPURAR') == '1':
        import faulthandler
        faulthandler.dump_traceback_later(8, repeat=True, file=sys.stderr)
    buf = os.environ.pop('MANOS_LINUX_PENDIENTE', '').encode()
    while True:
        while b'\n' not in buf:
            trozo = os.read(0, 65536)
            if not trozo:
                return
            buf += trozo
        cruda, buf = buf.split(b'\n', 1)
        l = cruda.decode('utf-8', errors='replace').strip()
        if not l:
            continue
        t0 = time.time()
        try:
            p = json.loads(l)
        except ValueError:
            continue
        # La pantalla se apagó (el vigía, sin uso) con AT-SPI ya conectado al bus viejo: este proceso se reemplaza a sí
        # mismo (mismo stdin/stdout) y el pedido, con los que venían detrás, lo atiende el nuevo. Ninguno se pierde.
        if _atspi is not None and p.get('op') not in SIN_PANTALLA and not pantalla_encendida():
            salida.flush()
            os.environ['MANOS_LINUX_PENDIENTE'] = (cruda + b'\n' + buf).decode('utf-8', errors='replace')
            os.execv(sys.executable, [sys.executable, os.path.abspath(__file__)])
        rid = p.get('id')
        try:
            r = despachar(p.get('op'), p)
            resp = {'id': rid, 'ok': True, 'r': r}
        except Fallo as e:
            resp = {'id': rid, 'ok': False, 'error': str(e)}
        except Exception as e:  # una excepción de X o de AT-SPI no tumba al ayudante
            if 'Xlib' in type(e).__module__ or 'Display' in str(e):
                x_reiniciar()
            resp = {'id': rid, 'ok': False, 'error': '%s: %s' % (type(e).__name__, str(e)[:400])}
        resp['ms'] = round((time.time() - t0) * 1000, 1)
        salida.write(json.dumps(resp, ensure_ascii=False) + '\n')
        salida.flush()


if __name__ == '__main__':
    orden = sys.argv[1] if len(sys.argv) > 1 else 'servir'
    if orden == 'vigia':
        vigia()
    elif orden == 'estado':
        print(json.dumps(estado_pantalla(), ensure_ascii=False))
    elif orden == 'apagar':
        print(json.dumps(apagar('orden'), ensure_ascii=False))
    else:
        servir()
