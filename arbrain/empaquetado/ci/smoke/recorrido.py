#!/usr/bin/env python3
"""Recorrido del primer arranque de Arbrain (edición del alumno) sobre la app INSTALADA, sin cuenta real.

    python recorrido.py --motor cdp   --puerto 9222 --salida <dir>     # Windows: WebView2 con --remote-debugging-port
    python recorrido.py --motor atspi --salida <dir>                   # Linux: árbol de accesibilidad + xdotool (Xvfb)

Lo lanzan `recorrido-windows.ps1` y `recorrido-linux.sh` (smoke-instaladores.yml, 13 oct 2026) con la app ya abierta.
Llaves: dos llaves FALSAS de formato válido (canarios), generadas por quien lanza y recibidas por entorno
(`RECORRIDO_CANARIO_ANTHROPIC`, `RECORRIDO_CANARIO_OPENROUTER`). Nunca una llave real: el login real de OpenRouter queda
pendiente salvo que exista `RECORRIDO_OPENROUTER_PRUEBA` (llave de prueba con tope mínimo, secreto del repo).

Pasos (PrimerArranque.tsx / PanelLlaves.tsx): bienvenida → privacidad → llaves → listo → chat. En llaves: «Conectar con
OpenRouter» abre el navegador del sistema y se cancela; «Otras formas» › Anthropic (canario) → la prueba automática
debe responder «llave no válida» (la llamada real a Anthropic corre: CLI de Claude + red); con las dos llaves la
prueba debe ir por Anthropic; se quita la de Anthropic y la prueba va por OpenRouter (orden de autenticación del
contrato §4). Cada paso: captura, título, «no está en negro» y su duración. Escribe `recorrido.json` y sale 0 si
todos los pasos críticos pasan.
"""
import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

PASOS = []
T0 = time.time()
MOTOR = [None]
SALIDA = [None]


def norm(t):
    """Minúsculas, espacios simples y sin acentos ni comillas (el OCR no siempre los lee)."""
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c)).replace("«", "").replace("»", "")
    return " ".join(t.split()).lower()


def di(t):
    print(t, flush=True)


# ─────────────────────────────────────────────────────────────── imagen

def analizar_png(ruta):
    """{ancho, alto, media, desv, negro}: negro = casi todo un solo tono muy oscuro (ventana vacía o webview muerto)."""
    try:
        from PIL import Image, ImageStat
        im = Image.open(ruta).convert("L")
        st = ImageStat.Stat(im)
        media, desv = st.mean[0], st.stddev[0]
        return {"ancho": im.width, "alto": im.height, "media": round(media, 1), "desv": round(desv, 1),
                "negro": media < 12 and desv < 6, "plano": desv < 3}
    except Exception as e:  # sin Pillow: no se decide
        return {"error": str(e)}


# ─────────────────────────────────────────────────────────────── motor CDP (Windows · WebView2)

class MotorCDP:
    nombre = "cdp"

    def __init__(self, puerto, salida):
        import websocket  # websocket-client
        self.websocket = websocket
        self.puerto, self.salida, self.ws, self.n = puerto, salida, None, 0
        self.conectar(120)

    def objetivos(self):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.puerto}/json/list", timeout=5) as r:
            return json.load(r)

    def conectar(self, espera):
        limite, ultimo = time.time() + espera, None
        while time.time() < limite:
            try:
                pags = [o for o in self.objetivos() if o.get("type") == "page" and o.get("url", "").startswith("http://127.0.0.1")]
                if pags:
                    self.ws = self.websocket.create_connection(pags[0]["webSocketDebuggerUrl"], timeout=60, suppress_origin=True)
                    di(f"cdp: conectado a {pags[0]['url']}")
                    return
                ultimo = "sin página de la app todavía"
            except Exception as e:
                ultimo = str(e)
            time.sleep(1)
        raise RuntimeError(f"no hay depurador remoto del WebView2 en :{self.puerto} ({ultimo})")

    def cmd(self, metodo, **params):
        self.n += 1
        mid = self.n
        try:
            self.ws.send(json.dumps({"id": mid, "method": metodo, "params": params}))
            while True:
                m = json.loads(self.ws.recv())
                if m.get("id") == mid:
                    if "error" in m:
                        raise RuntimeError(f"{metodo}: {m['error']}")
                    return m.get("result", {})
        except (self.websocket.WebSocketException, ConnectionError, OSError):
            self.conectar(30)
            raise

    def js(self, expr):
        r = self.cmd("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if r.get("exceptionDetails"):
            raise RuntimeError(f"js: {r['exceptionDetails'].get('text')} {r['exceptionDetails'].get('exception', {}).get('description', '')[:200]}")
        return r.get("result", {}).get("value")

    def texto(self):
        try:
            return self.js("document.body ? document.body.innerText : ''") or ""
        except Exception:
            return ""

    def titulo(self):
        return self.js("document.title")

    def url(self):
        return self.js("location.href")

    def captura(self, ruta):
        d = self.cmd("Page.captureScreenshot", format="png")
        Path(ruta).write_bytes(base64.b64decode(d["data"]))

    CLIC = r"""
    ((t, roles) => {
      const n = s => (s || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
      const els = [...document.querySelectorAll(roles)].filter(e => !e.disabled && e.offsetParent !== null);
      const e = els.find(e => n(e.innerText) === n(t)) || els.find(e => n(e.innerText).includes(n(t)));
      if (!e) return null;
      e.scrollIntoView({block: 'center'}); e.click(); return n(e.innerText).slice(0, 80);
    })(%s, %s)"""

    def clic(self, texto, roles="button, summary, [role=button], [role=radio], a"):
        return self.js(self.CLIC % (json.dumps(texto), json.dumps(roles)))

    def clic_en_fila(self, fila, boton):
        return self.js("""((fila, boton) => { const n = s => (s||'').normalize('NFKC').replace(/\\s+/g,' ').trim().toLowerCase();
          const li = [...document.querySelectorAll('li')].find(l => n(l.innerText).includes(n(fila)));
          const b = li && [...li.querySelectorAll('button')].filter(b => !b.disabled).reverse().find(b => n(b.innerText).includes(n(boton)));
          if (!b) return false; b.click(); return true; })(%s, %s)""" % (json.dumps(fila), json.dumps(boton)))

    def casilla(self, texto):
        return self.js("""((t) => { const n = s => (s||'').normalize('NFKC').replace(/\\s+/g,' ').toLowerCase();
          const l = [...document.querySelectorAll('label')].find(l => n(l.innerText).includes(n(t)));
          const i = l && l.querySelector('input[type=checkbox]'); if (!i) return false; if (!i.checked) i.click(); return i.checked; })(%s)""" % json.dumps(texto))

    def escribir(self, valor, placeholder=None, tipo=None):
        # Setter nativo + evento input: así React ve el cambio como si se hubiera tecleado.
        return self.js("""((v, ph, tipo) => {
          const ins = [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null &&
            (!ph || (i.placeholder || '').toLowerCase().includes(ph.toLowerCase())) && (!tipo || i.type === tipo));
          const i = ins[0]; if (!i) return false; i.focus();
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v);
          i.dispatchEvent(new Event('input', {bubbles: true})); return true; })(%s, %s, %s)""" % (json.dumps(valor), json.dumps(placeholder), json.dumps(tipo)))

    def probar_api(self):
        """POST /api/llaves/probar desde la propia página (misma sesión): devuelve proveedor y código, sin la llave."""
        return self.js("fetch('/api/llaves/probar', {method: 'POST', cache: 'no-store'}).then(r => r.json()).catch(e => ({error: String(e)}))")

    def cerrar(self):
        try:
            self.ws.close()
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────── motor AT-SPI (Linux · WebKitGTK)

class MotorUIA:
    """Windows (WebView2/Chromium): árbol de UI Automation, que Chromium expone completo. Clics por los patrones
    Invoke/Toggle (o clic real en el centro) y teclado real (SendKeys) con la ventana al frente. El WebView2 de la app no
    acepta depurador remoto (ni por variable de entorno ni por política: Tauri fija sus argumentos), así que esta es la
    vía de una persona: lo que se ve y se pulsa."""
    nombre = "uia"
    TIPOS_CLIC = ("ButtonControl", "RadioButtonControl", "HyperlinkControl", "CheckBoxControl", "MenuItemControl", "SplitButtonControl")

    def __init__(self, salida):
        import uiautomation as auto
        self.auto, self.salida = auto, salida
        auto.SetGlobalSearchTimeout(5)
        limite = time.time() + 120
        self.win = None
        while time.time() < limite:
            w = auto.WindowControl(searchDepth=1, RegexName="^Arbrain")
            if w.Exists(2, 0.5):
                self.win = w
                break
        if not self.win:
            raise RuntimeError("no aparece la ventana «Arbrain» en UI Automation")
        self.al_frente()
        time.sleep(3)
        self.volcar_arbol("uia-arbol-inicio.txt")

    def volcar_arbol(self, nombre):
        """Diagnóstico: el árbol de UI Automation de la ventana (tipo, clase y nombre), para ver qué expone el WebView2."""
        lineas = []
        try:
            for c, d in self.auto.WalkControl(self.win, includeTop=True, maxDepth=40):
                lineas.append(f"{'  ' * d}{c.ControlTypeName} [{c.ClassName}] {c.Name!r}"[:200])
                if len(lineas) > 600:
                    break
        except Exception as e:
            lineas.append(f"error: {e}")
        (Path(self.salida) / nombre).write_text("\n".join(lineas), encoding="utf-8")

    def al_frente(self):
        try:
            self.win.SetActive()
            self.win.SetTopmost(True)
        except Exception:
            pass

    def documento(self):
        """El documento web de la app (dentro de «Chrome Legacy Window»); sin él, la ventana entera. Fuera de ese
        subárbol el WebView2 expone botones ocultos del marco de Edge que no son de la app."""
        try:
            for c, _ in self.auto.WalkControl(self.win, includeTop=False, maxDepth=25):
                if c.ControlTypeName == "PaneControl" and c.ClassName == "Chrome_RenderWidgetHostHWND":
                    d = c.GetFirstChildControl()
                    if d is not None:
                        return d
        except Exception:
            pass
        return self.win

    def todos(self, raiz=None, prof=60):
        raiz = raiz or self.documento()
        try:
            return [c for c, _ in self.auto.WalkControl(raiz, includeTop=True, maxDepth=prof)]
        except Exception:
            return []

    def texto(self):
        partes = []
        for c in self.todos():
            try:
                n = c.Name
            except Exception:
                continue
            if n and (not partes or partes[-1] != n):
                partes.append(n)
        return "\n".join(partes)

    def titulo(self):
        try:
            return self.win.Name
        except Exception:
            return None

    def url(self):
        try:
            return self.documento().GetValuePattern().Value
        except Exception:
            return None

    def captura(self, ruta):
        from PIL import ImageGrab
        self.al_frente()
        time.sleep(0.4)
        r = self.win.BoundingRectangle
        ImageGrab.grab(bbox=(r.left, r.top, r.right, r.bottom)).save(ruta)

    def pulsar(self, c):
        try:
            c.GetScrollItemPattern().ScrollIntoView()
        except Exception:
            pass
        for patron in ("GetInvokePattern", "GetTogglePattern", "GetSelectionItemPattern"):
            try:
                p = getattr(c, patron)()
                if p is None:
                    continue
                if patron == "GetInvokePattern":
                    p.Invoke()
                elif patron == "GetTogglePattern":
                    p.Toggle()
                else:
                    p.Select()
                return True
            except Exception:
                continue
        try:
            self.al_frente()
            c.Click(simulateMove=False)
            return True
        except Exception:
            return False

    def buscar(self, texto, tipos, raiz=None):
        t = norm(texto)
        exacto = parcial = None
        for c in self.todos(raiz):
            try:
                if tipos and c.ControlTypeName not in tipos:
                    continue
                s = norm(c.Name)
            except Exception:
                continue
            if not s:
                continue
            if s == t and exacto is None:
                exacto = c
            elif t in s and parcial is None:
                parcial = c
        return exacto or parcial

    def clic(self, texto, roles=None):
        c = self.buscar(texto, self.TIPOS_CLIC) or self.buscar(texto, ("GroupControl", "TextControl", "CustomControl"))
        if c is None:
            return None
        nombre = norm(c.Name)[:80]
        return nombre if self.pulsar(c) else None

    def clic_en_fila(self, fila, boton):
        for li in self.todos():
            try:
                if li.ControlTypeName != "ListItemControl":
                    continue
                if norm(fila) not in norm(" ".join(x.Name or "" for x in self.todos(li, 8))):
                    continue
            except Exception:
                continue
            b = self.buscar(boton, ("ButtonControl",), li)
            if b is not None:
                return self.pulsar(b)
        return False

    def casilla(self, texto):
        c = self.buscar(texto, ("CheckBoxControl",)) or next((x for x in self.todos() if x.ControlTypeName == "CheckBoxControl"), None)
        if c is None:
            return False
        try:
            p = c.GetTogglePattern()
            if p.ToggleState != 1:
                p.Toggle()
            return p.ToggleState == 1
        except Exception:
            return self.pulsar(c)

    def escribir(self, valor, placeholder=None, tipo=None):
        cands = []
        for c in self.todos():
            try:
                if c.ControlTypeName != "EditControl":
                    continue
                es_pw = bool(c.GetPropertyValue(30019))  # UIA_IsPasswordPropertyId
                texto = norm((c.Name or "") + " " + (c.HelpText or ""))
            except Exception:
                continue
            if tipo == "password" and not es_pw:
                continue
            cands.append((0 if (placeholder and norm(placeholder) in texto) else 1, c))
        if not cands:
            return False
        c = sorted(cands, key=lambda x: x[0])[0][1]
        self.al_frente()
        try:
            c.GetScrollItemPattern().ScrollIntoView()
        except Exception:
            pass
        try:
            c.SetFocus()
        except Exception:
            c.Click(simulateMove=False)
        time.sleep(0.3)
        self.auto.SendKeys("{Ctrl}a{Del}", waitTime=0.1)
        self.auto.SendKeys(valor, interval=0.005, waitTime=0.2)
        return True

    def enviar_chat(self, texto):
        eds = [c for c in self.todos() if c.ControlTypeName == "EditControl"]
        if not eds:
            return False
        c = eds[-1]
        self.al_frente()
        c.SetFocus()
        time.sleep(0.3)
        self.auto.SendKeys(texto, interval=0.01, waitTime=0.2)
        self.auto.SendKeys("{Enter}", waitTime=0.2)
        return True

    def probar_api(self):
        return None

    def cerrar(self):
        try:
            self.win.SetTopmost(False)
        except Exception:
            pass


class MotorATSPI:
    """Linux (WebKitGTK): lee la pantalla por el árbol de accesibilidad Y por OCR de la captura (tesseract), y actúa con
    eventos reales de X (xdotool), como una persona. WebKitGTK no expone todo por AT-SPI (los avisos, y en 22.04 casi
    nada): si un elemento no aparece en el árbol, se ubica por su texto en la captura."""
    nombre = "atspi+ocr"
    ROLES_CLIC = ("push button", "toggle button", "radio button", "link", "check box", "menu item", "button")

    def __init__(self, salida):
        self.salida = salida
        try:
            import pyatspi
            self.pyatspi = pyatspi
        except Exception:
            self.pyatspi = None
        self.tmp = Path(salida) / ".ocr"
        self.tmp.mkdir(exist_ok=True)
        limite = time.time() + 120
        while time.time() < limite:
            if self.titulo():
                return
            time.sleep(2)
        raise RuntimeError("no aparece la ventana de Arbrain")

    # ── árbol de accesibilidad (si existe)
    def documento(self):
        if not self.pyatspi:
            return None
        mejor = None
        try:
            apps = list(self.pyatspi.Registry.getDesktop(0))
        except Exception:
            return None
        for app in apps:
            if not app:
                continue
            for n in self.recorrer(app, 12, 4000):
                try:
                    rol = n.getRoleName()
                except Exception:
                    continue
                if rol in ("document web", "document frame"):
                    mejor = n
                    try:
                        if n.childCount:
                            return n
                    except Exception:
                        pass
        return mejor

    def recorrer(self, raiz, prof=40, maximo=6000):
        pila, vistos = [(raiz, 0)], 0
        while pila and vistos < maximo:
            n, d = pila.pop()
            vistos += 1
            yield n
            if d >= prof:
                continue
            try:
                hijos = [n.getChildAtIndex(i) for i in range(min(n.childCount, 400))]
            except Exception:
                hijos = []
            pila.extend((h, d + 1) for h in reversed(hijos) if h is not None)

    def refrescar(self, n):
        try:
            from gi.repository import GLib
            ctx = GLib.MainContext.default()
            while ctx.pending():
                ctx.iteration(False)
        except Exception:
            pass
        for metodo in ("clearCache", "clear_cache"):
            try:
                getattr(n, metodo)()
                return
            except Exception:
                continue

    def nodos(self, raiz=None):
        doc = raiz or self.documento()
        if not doc:
            return []
        self.refrescar(doc)
        return list(self.recorrer(doc))

    @staticmethod
    def texto_de(n):
        partes = []
        try:
            partes.append(n.name or "")
        except Exception:
            pass
        try:
            t = n.queryText()
            partes.append(t.getText(0, min(t.characterCount, 4000)))
        except Exception:
            pass
        return " ".join(p for p in partes if p)

    def buscar(self, texto, roles):
        t = norm(texto)
        exacto = parcial = None
        for n in self.nodos():
            try:
                rol = n.getRoleName()
            except Exception:
                continue
            if roles and rol not in roles:
                continue
            s = norm(self.texto_de(n))
            if not s:
                continue
            if s == t and exacto is None:
                exacto = n
            elif t in s and parcial is None:
                parcial = n
        return exacto or parcial

    # ── OCR de la captura
    def ocr(self):
        """Líneas visibles [(texto_normalizado, [(palabra_norm, x, y, w, h)])] de la ventana, por tesseract."""
        png = self.tmp / "pantalla.png"
        # Solo la columna del contenido (la tarjeta del primer arranque), en escala de grises y al doble: más rápido y
        # más fiel que la pantalla entera. Las coordenadas se devuelven en las de la pantalla.
        X0, Y0, ANCHO, ALTO, ESC = 440, 40, 720, 960, 2
        subprocess.run(["import", "-window", "root", "-crop", f"{ANCHO}x{ALTO}+{X0}+{Y0}", "+repage", "-colorspace", "Gray",
                        "-resize", f"{ESC * 100}%", str(png)], check=False, timeout=30)
        # Tema oscuro (la app lo pone de noche, hora de México): tesseract lee mucho mejor texto oscuro sobre claro.
        try:
            media = float(subprocess.run(["convert", str(png), "-format", "%[fx:mean]", "info:"], capture_output=True,
                                         text=True, timeout=30).stdout or 1)
            if media < 0.45:
                subprocess.run(["convert", str(png), "-negate", str(png)], check=False, timeout=30)
        except (ValueError, OSError, subprocess.SubprocessError):
            pass
        try:
            out = subprocess.run(["tesseract", str(png), "-", "-l", "spa", "--psm", "11", "tsv"],
                                 capture_output=True, text=True, timeout=60).stdout
        except Exception:
            return []
        lineas = {}
        for fila in out.splitlines()[1:]:
            c = fila.split("\t")
            if len(c) < 12 or not c[11].strip():
                continue
            try:
                conf = float(c[10])
            except ValueError:
                continue
            if conf < 20:
                continue
            x, y, w, h = map(int, c[6:10])
            x, y, w, h = X0 + x // ESC, Y0 + y // ESC, w // ESC, h // ESC
            clave = (c[2], c[3], c[4])
            lineas.setdefault(clave, []).append((norm(c[11]), x, y, w, h))
        # tesseract --psm 11 parte las líneas: se reagrupan por altura (misma fila de pantalla).
        palabras = sorted((p for ps in lineas.values() for p in ps), key=lambda p: (p[2], p[1]))
        filas = []
        for p in palabras:
            if filas and abs(filas[-1][-1][2] - p[2]) <= 8:
                filas[-1].append(p)
            else:
                filas.append([p])
        return [(" ".join(p[0] for p in sorted(f, key=lambda p: p[1])), sorted(f, key=lambda p: p[1])) for f in filas]

    def ocr_buscar(self, texto, lineas=None):
        """Caja (x, y, w, h) del texto en pantalla, o None. Busca la secuencia de palabras dentro de una fila."""
        objetivo = norm(texto).split()
        if not objetivo:
            return None
        for _, ps in (lineas if lineas is not None else self.ocr()):
            ws = [p[0] for p in ps]
            for i in range(len(ws) - len(objetivo) + 1):
                if all(objetivo[k] in ws[i + k] or ws[i + k] in objetivo[k] and len(ws[i + k]) > 2 for k in range(len(objetivo))):
                    sel = ps[i:i + len(objetivo)]
                    x0, y0 = min(p[1] for p in sel), min(p[2] for p in sel)
                    x1, y1 = max(p[1] + p[3] for p in sel), max(p[2] + p[4] for p in sel)
                    return x0, y0, x1 - x0, y1 - y0
        return None

    def rueda(self, abajo=True, veces=3):
        subprocess.run(["xdotool", "mousemove", "800", "600"], check=False, timeout=10)
        for _ in range(veces):
            subprocess.run(["xdotool", "click", "5" if abajo else "4"], check=False, timeout=10)
        time.sleep(0.6)

    def ocr_ubicar(self, texto):
        """Busca el texto en la vista; si no está, baja la página por tramos y luego la recorre desde arriba."""
        caja = self.ocr_buscar(texto)
        if caja:
            return caja
        for _ in range(5):
            self.rueda(True)
            caja = self.ocr_buscar(texto)
            if caja:
                return caja
        self.rueda(False, 25)
        for _ in range(6):
            caja = self.ocr_buscar(texto)
            if caja:
                return caja
            self.rueda(True)
        return None

    @staticmethod
    def clic_xy(x, y):
        subprocess.run(["xdotool", "mousemove", str(int(x)), str(int(y)), "click", "1"], check=False, timeout=10)

    # ── interfaz del recorrido
    def texto(self):
        a11y = "\n".join(t for t in (self.texto_de(n) for n in self.nodos()) if t)
        return a11y + "\n" + "\n".join(l for l, _ in self.ocr())

    def titulo(self):
        try:
            out = subprocess.run(["xdotool", "search", "--onlyvisible", "--name", "^Arbrain", "getwindowname"],
                                 capture_output=True, text=True, timeout=10).stdout.strip().splitlines()
            return out[0] if out else None
        except Exception:
            return None

    def url(self):
        try:
            doc = self.documento()
            return dict(a.split(":", 1) for a in doc.getAttributes() if ":" in a).get("URI") if doc else None
        except Exception:
            return None

    def captura(self, ruta):
        subprocess.run(["import", "-window", "root", str(ruta)], check=False, timeout=30)

    def pulsar(self, n):
        try:
            e = n.queryComponent().getExtents(self.pyatspi.DESKTOP_COORDS)
            if e.width > 0 and e.height > 0 and e.x >= 0 and e.y >= 0 and e.y + e.height // 2 < 1000:
                self.clic_xy(e.x + e.width // 2, e.y + e.height // 2)
                return True
        except Exception:
            pass
        try:
            return bool(n.queryAction().doAction(0))
        except Exception:
            return False

    def clic(self, texto, roles=None):
        n = self.buscar(texto, self.ROLES_CLIC)
        if n is not None:
            nombre = norm(self.texto_de(n))[:80]
            if self.pulsar(n):
                return nombre
        caja = self.ocr_ubicar(texto)
        if not caja:
            return None
        x, y, w, h = caja
        self.clic_xy(x + w / 2, y + h / 2)
        return f"ocr:{norm(texto)}"

    def clic_en_fila(self, fila, boton):
        for _ in range(2):
            lineas = self.ocr()
            for _, ps in lineas:
                caja = self.ocr_buscar(fila, [(None, ps)])
                if not caja:
                    continue
                b = next((p for p in ps if p[0].strip(".,;:¿?") == norm(boton) and p[1] > caja[0] + caja[2]), None)
                if b:
                    self.clic_xy(b[1] + b[3] / 2, b[2] + b[4] / 2)
                    return True
            # La confirmación («¿Quitarla del llavero?» [Quitar] [Cancelar]): el botón hermano de «Cancelar».
            for n in self.nodos():
                try:
                    if n.getRoleName() in self.ROLES_CLIC and norm(self.texto_de(n)) == "cancelar":
                        padre = n.parent
                        for i in range(padre.childCount):
                            h = padre.getChildAtIndex(i)
                            if h is not None and norm(self.texto_de(h)) == norm(boton) and self.pulsar(h):
                                return True
                except Exception:
                    continue
            self.rueda(False, 25)
        return False

    def casilla(self, texto):
        caja = self.ocr_ubicar(texto)
        if not caja:
            return False
        x, y, w, h = caja
        self.clic_xy(x + 10, y + h / 2)  # la etiqueta envuelve la casilla: un clic en el texto la marca
        return True

    def escribir(self, valor, placeholder=None, tipo=None):
        # 1) el campo por el árbol de accesibilidad (WebKitGTK sí expone los <input>); 2) por su placeholder en pantalla.
        n = None
        roles = ("password text",) if tipo == "password" else ("entry", "text", "password text")
        for c in self.nodos():
            try:
                if c.getRoleName() in roles:
                    attrs = dict(x.split(":", 1) for x in c.getAttributes() if ":" in x)
                    ph = norm(attrs.get("placeholder-text", "") + " " + (c.name or ""))
                    if not placeholder or norm(placeholder) in ph or n is None:
                        n = c
                        if not placeholder or norm(placeholder) in ph:
                            break
            except Exception:
                continue
        if n is not None and self.pulsar(n):
            pass
        else:
            # Placeholder exacto del campo (no las instrucciones de arriba, que también dicen «sk-ant-»).
            objetivo = placeholder or ("sk-or-v1" if valor.startswith("sk-or") else "sk-ant-api03")
            caja = self.ocr_ubicar(objetivo)
            if not caja:
                return False
            x, y, w, h = caja
            self.clic_xy(x + w / 2, y + h / 2)
        time.sleep(0.4)
        subprocess.run(["xdotool", "key", "--clearmodifiers", "ctrl+a", "BackSpace"], check=False, timeout=10)
        subprocess.run(["xdotool", "type", "--delay", "15", valor], check=False, timeout=120)
        return True

    def probar_api(self):
        return None  # sin acceso a la sesión de la página: la prueba se lee en pantalla

    def cerrar(self):
        pass


# ─────────────────────────────────────────────────────────────── recorrido

def paso(nombre, critico=True):
    def deco(f):
        def envoltura(*a, **k):
            t = time.time()
            di(f"\n── {nombre}")
            try:
                ok, detalle, extra = f(*a, **k)
            except Exception as e:
                ok, detalle, extra = False, f"excepción: {e}", {}
            r = {"paso": nombre, "ok": ok, "critico": critico, "segundos": round(time.time() - t, 1), "detalle": detalle}
            if not ok and MOTOR[0] is not None and SALIDA[0]:
                try:  # lo que la herramienta veía en pantalla, para diagnosticar sin volver a correr
                    (Path(SALIDA[0]) / f"texto-paso-{len(PASOS) + 1:02d}.txt").write_text(MOTOR[0].texto(), encoding="utf-8")
                except Exception:
                    pass
            r.update(extra or {})
            PASOS.append(r)
            di(f"   {'OK' if ok else ('FALLO' if critico else 'AVISO')} ({r['segundos']} s): {detalle}")
            return ok
        return envoltura
    return deco


def esperar_texto(m, textos, espera=60, cada=1.0):
    """Espera a que la pantalla diga alguno de `textos`; devuelve el que apareció o None."""
    limite = time.time() + espera
    while time.time() < limite:
        t = norm(m.texto())
        for x in textos:
            if norm(x) in t:
                return x
        time.sleep(cada)
    return None


def foto(m, salida, nombre):
    ruta = Path(salida) / f"recorrido-{len(PASOS) + 1:02d}-{nombre}.png"
    try:
        m.captura(ruta)
    except Exception as e:
        return {"captura": None, "captura_error": str(e)}
    return {"captura": ruta.name, "imagen": analizar_png(ruta)}


def navegador_abrio(espera=15):
    """Host y ruta de la URL que la app mandó al navegador del sistema (sin la query: lleva el reto PKCE)."""
    from urllib.parse import urlsplit
    limite = time.time() + espera
    while time.time() < limite:
        url = None
        reg = os.environ.get("RECORRIDO_NAVEGADOR_LOG")
        if reg and Path(reg).exists():
            url = (Path(reg).read_text().strip().splitlines() or [None])[-1]
        elif os.name == "nt":
            out = subprocess.run(["powershell", "-NoProfile", "-Command",
                                  "(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -match 'openrouter' } | Select-Object -First 1).CommandLine"],
                                 capture_output=True, text=True, timeout=30).stdout
            i = out.find("https://")
            url = out[i:].split()[0].strip('"') if i >= 0 else None
        if url:
            u = urlsplit(url)
            return f"{u.scheme}://{u.netloc}{u.path}"
        time.sleep(1)
    return None


PRUEBAS = {  # MENSAJE_PRUEBA de PanelLlaves.tsx
    "llave_invalida": "La llave no es válida o venció",
    "sin_saldo": "tu cuenta no tiene saldo",
    "saturado": "Claude está saturado",
    "sin_red": "No hay conexión a internet",
    "tiempo": "tardó demasiado en responder",
    "falta_llave": "todavía no ve la llave",
    "ok": "Conexión lista",
    "generico": "No pude probar la conexión",
}


def main():
    for flujo in (sys.stdout, sys.stderr):  # consola cp1252 del runner de Windows
        try:
            flujo.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--motor", choices=["cdp", "uia", "atspi"], required=True)
    ap.add_argument("--puerto", type=int, default=9222)
    ap.add_argument("--salida", required=True)
    a = ap.parse_args()
    salida = Path(a.salida)
    salida.mkdir(parents=True, exist_ok=True)
    SALIDA[0] = salida
    can_a = os.environ.get("RECORRIDO_CANARIO_ANTHROPIC", "")
    can_o = os.environ.get("RECORRIDO_CANARIO_OPENROUTER", "")
    llave_prueba_or = os.environ.get("RECORRIDO_OPENROUTER_PRUEBA", "")
    if not (can_a and can_o):
        di("faltan los canarios (RECORRIDO_CANARIO_ANTHROPIC / RECORRIDO_CANARIO_OPENROUTER)")
        return 2

    m = None

    @paso("conectar con la ventana")
    def conectar():
        nonlocal m
        m = {"cdp": lambda: MotorCDP(a.puerto, salida), "uia": lambda: MotorUIA(salida), "atspi": lambda: MotorATSPI(salida)}[a.motor]()
        MOTOR[0] = m
        return True, f"motor {m.nombre}", {}

    if not conectar():
        return terminar(salida, a.motor)

    @paso("UI carga: bienvenida, título y no está en negro")
    def bienvenida():
        vio = esperar_texto(m, ["Bienvenido a Arbrain"], 90)
        titulo = m.titulo()
        f = foto(m, salida, "bienvenida")
        img = f.get("imagen", {})
        ok = bool(vio) and (titulo or "").strip().lower().startswith("arbrain") and not img.get("negro") and not img.get("plano")
        return ok, f"texto={'sí' if vio else 'NO'} · título={titulo!r} · imagen={img}", {**f, "titulo": titulo, "url": m.url()}

    if not bienvenida():
        return terminar(salida, a.motor, m)

    @paso("paso 1 · nombre y «Empezar»")
    def p1():
        e = m.escribir("Alumno Prueba", placeholder="Tu nombre")
        time.sleep(0.5)
        c = m.clic("Empezar")
        vio = esperar_texto(m, ["Antes de empezar"], 30)
        return bool(e and c and vio), f"escribió={e} clic={c!r} → {vio!r}", foto(m, salida, "privacidad")

    @paso("paso 2 · aceptar privacidad, términos y licencia")
    def p2():
        k = m.casilla("Leí y acepto")
        time.sleep(0.5)
        c = m.clic("Aceptar y continuar")
        vio = esperar_texto(m, ["Conecta a Levy con un modelo"], 30)
        return bool(k and c and vio), f"casilla={k} clic={c!r} → {vio!r}", foto(m, salida, "llaves")

    @paso("paso 3a · llavero del sistema disponible")
    def p3a():
        t = norm(m.texto())
        sin = "no tiene un llavero disponible" in t
        almacen = next((x for x in ("administrador de credenciales de windows", "secret service", "llavero de macos") if x in t), None)
        return (not sin) and bool(almacen), f"almacén={almacen!r}{' · SIN LLAVERO' if sin else ''}", {}

    @paso("paso 3b · «Conectar con OpenRouter» abre el navegador (se cancela)", critico=False)
    def p3b():
        c = m.clic("Conectar con OpenRouter")
        vio = esperar_texto(m, ["Esperando a que autorices", "No pude", "no se pudo"], 20)
        f = foto(m, salida, "openrouter-oauth")
        destino = navegador_abrio()
        m.clic("Cancelar")
        if os.name == "nt":  # el navegador del sistema (Edge) le quitaría el teclado a la app
            subprocess.run(["taskkill", "/F", "/IM", "msedge.exe"], capture_output=True, timeout=30)
            if hasattr(m, "al_frente"):
                m.al_frente()
        time.sleep(1)
        ok = vio == "Esperando a que autorices" and bool(destino) and "openrouter.ai" in destino
        return ok, f"clic={c!r} → {vio!r} · el navegador del sistema abrió {destino!r} (login real: pendiente, sin cuenta de prueba)", {**f, "navegador": destino}

    def prueba_visible(espera=120):
        # Tras guardar, la app relanza el daemon y prueba sola. Puede pasar por «todavía no ve la llave» antes del final.
        # Primero se espera a que el resultado anterior se borre (o a «Probando…»): si no, se leería el de antes.
        t1 = time.time() + 15
        while time.time() < t1:
            t = norm(m.texto())
            if "probando con un mensaje corto" in t or not any(norm(v) in t for k, v in PRUEBAS.items() if k != "falta_llave"):
                break
            time.sleep(0.5)
        limite, ultimo = time.time() + espera, None
        while time.time() < limite:
            t = norm(m.texto())
            vis = [k for k, v in PRUEBAS.items() if norm(v) in t]
            if vis and vis != ["falta_llave"] and "probando con un mensaje corto" not in t:
                return [k for k in vis if k != "falta_llave"][0]
            ultimo = vis
            time.sleep(1.5)
        return (ultimo or [None])[0]

    def prueba_con_reintento():
        """La app prueba sola al guardar. Si esa primera prueba sale «no pude probar»/«no ve la llave» (el daemon se
        estaba reiniciando), se anota y se pulsa «Probar conexión» como haría la persona."""
        primera = prueba_visible()
        if primera in ("generico", "falta_llave", None):
            time.sleep(3)
            m.clic("Probar conexión")
            return primera, prueba_visible()
        return primera, primera

    @paso("paso 3c · llave de Anthropic (canario) → llavero → prueba real responde «no válida»")
    def p3c():
        c1 = m.clic("Otras formas de conectar")
        time.sleep(0.8)
        c2 = m.clic("API key de Anthropic")
        time.sleep(0.8)
        e = m.escribir(can_a, tipo="password")
        time.sleep(0.5)
        g = m.clic("Guardar")
        primera, res = prueba_con_reintento()
        api = m.probar_api()
        f = foto(m, salida, "anthropic-probada")
        f["primera_prueba_automatica"] = primera
        ok = res == "llave_invalida" and (api is None or (api.get("code") == "llave_invalida" and api.get("proveedor") in ("anthropic", None)))
        return ok, f"otras={c1!r} radio={c2!r} escribió={e} guardar={g!r} → 1.ª prueba automática={primera} · pantalla={res} · api={api}", {**f, "api": api}

    @paso("paso 3d · con Anthropic y OpenRouter guardadas, la prueba responde (el orden Anthropic → OpenRouter lo fijan cofre.test.ts y proveedor.test.ts)")
    def p3d():
        c = m.clic("Pegar una llave de OpenRouter")
        time.sleep(0.8)
        e = m.escribir(can_o, tipo="password")
        time.sleep(0.5)
        g = m.clic("Guardar")
        primera, res = prueba_con_reintento()
        api = m.probar_api()
        if hasattr(m, "rueda"):
            m.rueda(False, 25)  # las llaves guardadas están arriba
        f = foto(m, salida, "dos-llaves")
        f["primera_prueba_automatica"] = primera
        t = norm(m.texto())
        dos = all(norm(x) in t for x in ("Cuenta de OpenRouter", "API key de Anthropic", "Probar conexión"))
        ok = res == "llave_invalida" and dos and (api is None or api.get("proveedor") == "anthropic")
        return ok, f"radio={c!r} escribió={e} guardar={g!r} → 1.ª prueba automática={primera} · pantalla={res} · api={api} · dos guardadas={dos}", {**f, "api": api}

    @paso("paso 3e · se quita la de Anthropic: la prueba va por OpenRouter")
    def p3e():
        if hasattr(m, "rueda"):
            m.rueda(False, 25)
        q1 = m.clic_en_fila("API key de Anthropic", "Quitar")
        time.sleep(1)
        q2 = m.clic_en_fila("API key de Anthropic", "Quitar")  # confirmación «¿Quitarla del llavero?» en la misma fila
        time.sleep(1)
        quitada = esperar_texto(m, ["Cuenta de OpenRouter"], 20) and "guardada · sk-ant" not in norm(m.texto())
        time.sleep(5)
        m.clic("Probar conexión")
        primera, res = prueba_con_reintento()
        api = m.probar_api()
        f = foto(m, salida, "solo-openrouter")
        ok = res == "llave_invalida" and (api is None or (api.get("proveedor") == "openrouter" and api.get("code") == "llave_invalida"))
        ok = ok and bool(quitada)
        return ok, f"quitar={q1}/{q2} quitada={bool(quitada)} → pantalla={res} · api={api}", {**f, "api": api}

    @paso("paso 3f · login real de OpenRouter", critico=False)
    def p3f():
        if not llave_prueba_or:
            return False, "PENDIENTE: no hay llave de prueba con tope en los secretos del repo (nunca una llave personal)", {"pendiente": True}
        return False, "PENDIENTE: llave de prueba presente pero este recorrido aún no la usa", {"pendiente": True}

    @paso("paso 4 · «Listo» y «Hablar con Levy» abre el chat")
    def p4():
        siguiente = next((b for b in ("Continuar sin crédito", "Continuar sin llave", "Continuar") if m.clic(b)), None)
        vio = esperar_texto(m, ["Todo listo", "Tu avance en el programa"], 30)
        if vio == "Tu avance en el programa":
            m.clic("Continuar")
            vio = esperar_texto(m, ["Todo listo"], 30)
        f1 = foto(m, salida, "listo")
        h = m.clic("Hablar con Levy")
        time.sleep(4)
        if a.motor == "cdp":
            try:
                m.ws.close()
            except Exception:
                pass
            m.conectar(60)
        limite = time.time() + 60
        url, salio = None, False
        while time.time() < limite:
            url = m.url() or ""
            t = norm(m.texto())
            salio = "todo listo" not in t and ("nuevo chat" in t or "mensaje" in t)
            if salio and (a.motor != "cdp" or "/chat" in url):
                break
            time.sleep(1.5)
        time.sleep(3)
        f2 = foto(m, salida, "chat")
        img = f2.get("imagen", {})
        ok = bool(siguiente) and vio == "Todo listo" and bool(h) and salio and (a.motor != "cdp" or "/chat" in (url or "")) and not img.get("negro") and not img.get("plano")
        return ok, f"continuar={siguiente!r} → {vio!r} · hablar={h!r} → url={url} · imagen={img}", {**f2, "captura_listo": f1.get("captura")}

    @paso("paso 5 · un mensaje en el chat con llave inválida da un error claro (no se cuelga)", critico=False)
    def p5():
        if a.motor == "atspi":
            return False, "solo en Windows (uia/cdp)", {}
        antes = norm(m.texto())
        if a.motor == "cdp":
            ok_escribir = m.js("""(() => { const t = [...document.querySelectorAll('textarea')].find(t => t.offsetParent !== null);
                if (!t) return false; t.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'hola, ¿me escuchas?');
                t.dispatchEvent(new Event('input', {bubbles: true}));
                t.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));
                return true; })()""")
        else:
            ok_escribir = m.enviar_chat("hola, me escuchas?")
        # Hasta 4 min: se mide cuánto tarda el chat en decirle a la persona que su llave no sirve (la prueba de
        # «Probar conexión» va sin reintentos; el chat usa los reintentos normales del CLI).
        nuevo, limite, t0 = [], time.time() + 240, time.time()
        # 0.1.1: el aviso nuevo del chat («Tu llave no funcionó: OpenRouter la rechazó…», con «Abrir Ajustes › Llaves»).
        claves = ("no es valida", "error", "no pude", "no pudo", "no funciono", "rechazo", "credito", "saldo", "401",
                  "unauthorized", "invalid", "fallo", "vencio")
        while time.time() < limite:
            nuevo = [norm(l) for l in m.texto().splitlines() if len(norm(l)) > 3 and norm(l) not in antes]
            if any(k in l for l in nuevo for k in claves if "preparandose" not in l):
                break
            time.sleep(3)
        espera = round(time.time() - t0)
        f = foto(m, salida, "chat-mensaje")
        aviso = next((l for l in nuevo if "preparandose" not in l and any(k in l for k in claves)), None)
        return bool(ok_escribir) and bool(aviso), f"escribió={ok_escribir} → a los {espera} s: {aviso or (nuevo[:3] if nuevo else None)!r}", {**f, "segundos_hasta_error": espera if aviso else None}

    for f in (p1, p2, p3a, p3b, p3c, p3d, p3e, p3f, p4, p5):
        f()
    return terminar(salida, a.motor, m)


def terminar(salida, motor, m=None):
    if m:
        m.cerrar()
    malos = [p for p in PASOS if p["critico"] and not p["ok"]]
    res = {"motor": motor, "segundos": round(time.time() - T0, 1), "ok": not malos, "pasos": PASOS}
    (Path(salida) / "recorrido.json").write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    di("\n" + ("RECORRIDO OK" if not malos else "RECORRIDO FALLO: " + "; ".join(p["paso"] for p in malos)))
    return 0 if not malos else 1


if __name__ == "__main__":
    sys.exit(main())
