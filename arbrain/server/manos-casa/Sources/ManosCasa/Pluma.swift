import AppKit
import ApplicationServices
import Foundation
import ManosNucleo
import Vision

/// Manos para LIENZOS (2 oct 2026, experimento sfmap): lo que una app de dibujo pide y el árbol AX no da.
///
///   trazo    — arrastre continuo por proceso (mouseDown → mouseDragged… → mouseUp con `postToPid`):
///              el cursor real no se mueve. Movimiento natural: curva suave por los puntos, velocidad
///              que acelera y frena, temblor mínimo de la mano y presión que sube y baja.
///   clic_xy  — clic (o doble) en coordenadas de la ventana, con el elemento AX que hay debajo
///              para que la capa TS pase el freno.
///   ojos     — captura de la ventana + OCR de Vision con cajas en puntos de la ventana:
///              ver lo que una vista dibujada a mano no publica por accesibilidad.
///
/// Coordenadas: SIEMPRE relativas al marco de la ventana (puntos, origen arriba-izquierda),
/// las mismas que se leen en la captura de `ojos` dividiendo los píxeles entre `escala`.
enum Pluma {
    struct Ventana { let id: CGWindowID; let marco: CGRect }

    static func ventana(_ pid: pid_t, _ id: Int?) throws -> Ventana {
        let lista = Motor.compartido.ventanas(pid: pid)
        let elegida = id.flatMap { i in lista.first { ($0["id"] as? Int) == i } }
            ?? lista.filter { $0["en_pantalla"] as? Bool == true }.max { ($0["z"] as? Int ?? 0) < ($1["z"] as? Int ?? 0) }
        guard let v = elegida, let m = v["marco"] as? [String: Double] else { throw ErrorManos("La app (pid \(pid)) no tiene la ventana pedida en pantalla. Usa `ventanas`.") }
        return Ventana(id: CGWindowID(v["id"] as? Int ?? 0), marco: CGRect(x: m["x"] ?? 0, y: m["y"] ?? 0, width: m["w"] ?? 0, height: m["h"] ?? 0))
    }

    static func numero(_ x: Any?) -> Double? { (x as? Double) ?? (x as? Int).map(Double.init) ?? (x as? NSNumber)?.doubleValue }

    static func puntos(_ x: Any?) -> [CGPoint] {
        guard let arr = x as? [Any] else { return [] }
        return arr.compactMap { p in
            if let par = p as? [Any], par.count >= 2, let a = numero(par[0]), let b = numero(par[1]) { return CGPoint(x: a, y: b) }
            if let o = p as? [String: Any], let a = numero(o["x"]), let b = numero(o["y"]) { return CGPoint(x: a, y: b) }
            return nil
        }
    }

    static func banderas(_ mods: [String]) -> CGEventFlags {
        var f: CGEventFlags = []
        for m in mods {
            switch m { case "cmd": f.insert(.maskCommand); case "shift": f.insert(.maskShift); case "option": f.insert(.maskAlternate); case "ctrl": f.insert(.maskControl); default: break }
        }
        return f
    }

    // MARK: - Trazo

    static func curva(_ p: [CGPoint], paso: Double) -> [CGPoint] { Trazado.curva(p, paso: paso) }
    static func cronograma(_ c: [CGPoint], velocidad: Double, presion: Double, natural: Bool, parejo: Bool = false) -> [(CGPoint, Double, Double)] {
        Trazado.cronograma(c, velocidad: velocidad, presion: presion, natural: natural, parejo: parejo)
    }

    // MARK: - Emisor de ratón (una sola puerta para trazo, clics, hover y rueda)

    /// Una sesión de gesto sobre UNA ventana: decide la vía, estampa campos y deja el foco como estaba.
    ///   fondo  (por defecto) — SkyLight + foco sin levantar: la ventana no sube y el cursor real no se mueve.
    ///   frente — la app pasa al frente de verdad durante el gesto y luego se devuelve el frente a quien lo tenía.
    ///   hid    — eventos de hardware: MUEVE EL CURSOR REAL. Último recurso, solo si se pide.
    final class Gesto {
        let pid: pid_t, v: Ventana, via: String, flags: CGEventFlags
        /// false: la app se queda con el foco al terminar (cadenas de gestos: un panel que se cierra al perder el foco).
        var devolver = true
        let fuente = CGEventSource(stateID: .hidSystemState)
        let gesto = Int64(DispatchTime.now().uptimeNanoseconds % 1_000_000_000)
        let frenteAntes = NSWorkspace.shared.frontmostApplication?.processIdentifier
        let cursorAntes = CGEvent(source: nil)?.location ?? .zero
        let inicio = CACurrentMediaTime()
        /// HID propios publicados al empezar (para decir quién movió el cursor: Daniel, la mano o nadie).
        let hidAntes = Vigia.propiosHIDAhora()
        var eventos = 0
        var activado = false

        init(pid: pid_t, v: Ventana, via: String, flags: CGEventFlags) {
            self.pid = pid; self.v = v; self.via = via; self.flags = flags
            switch via {
            case "frente", "hid":
                // Al frente DE VERDAD: SkyLight + activar + subir la ventana por AX (solo SkyLight a veces deja otra encima).
                let vax = try? Motor.compartido.ventanaAX(pid, Int(v.id)).0
                activado = Mano.alFrente(pid: pid, ventana: vax, id: v.id); usleep(80_000)
            default:
                // Fondo: activar sin levantar presta el foco de teclado de la sesión; solo en una pausa del teclado de
                // Daniel (Foco.swift). Si él no para de teclear, el gesto va sin activar (puede no entrar: se reporta).
                activado = Foco.esperarPausa() ? Cielo.activarSinLevantar(pid: pid, ventana: v.id, forzar: true) : false
                usleep(50_000)
            }
        }

        func global(_ l: CGPoint) -> CGPoint { CGPoint(x: v.marco.minX + l.x, y: v.marco.minY + l.y) }

        func raton(_ tipo: CGEventType, local l: CGPoint, boton: CGMouseButton = .left, clicks: Int64 = 1, presion: Double = 0, delta: CGPoint = .zero) {
            // Cada quien su cursor (fallas del 3 oct, 10:38 y 10:46: «cursor real MOVIDO» en Claude Desktop y con
            // via frente): si la app destino es la que está al frente, un evento de ratón por SkyLight con posición
            // global distinta de la del cursor puede llevarse el cursor de Daniel. Por fondo, la posición GLOBAL va
            // donde ya está su cursor y el punto real viaja solo en la posición de ventana (CGEventSetWindowLocation).
            let alFrente = via != "hid" && NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
            let g = alFrente ? (CGEvent(source: nil)?.location ?? global(l)) : global(l)
            guard let ev = CGEvent(mouseEventSource: via == "hid" ? fuente : CGEventSource(stateID: .privateState), mouseType: tipo, mouseCursorPosition: g, mouseButton: boton) else { return }
            ev.flags = flags
            ev.setDoubleValueField(.mouseEventPressure, value: presion)
            ev.setIntegerValueField(.mouseEventDeltaX, value: Int64(delta.x.rounded()))
            ev.setIntegerValueField(.mouseEventDeltaY, value: Int64(delta.y.rounded()))
            let numero: Int64 = boton == .right ? 1 : boton == .center ? 2 : 0
            let movimiento = tipo == .mouseMoved
            if via == "hid" {
                ev.setIntegerValueField(.mouseEventClickState, value: movimiento ? 0 : clicks)
                CursorSistema.marcar(ev)
                CursorSistema.gesto(en: ev.location)
                ev.post(tap: .cghidEventTap)
            } else {
                // Subtipo 3 (toque) para clics y movimientos; 0 (normal) para arrastres, como el WindowServer.
                let arrastre = [.leftMouseDragged, .rightMouseDragged, .otherMouseDragged].contains(tipo)
                Cielo.enviar(ev, pid: pid, ventana: v.id, local: l, clickState: movimiento ? 0 : clicks, boton: numero, subtipo: arrastre ? 0 : 3, gesto: gesto)
            }
            eventos += 1
        }

        func fantasma(_ l: CGPoint, pulso: Bool = false) {
            let g = global(l)
            Fantasma.compartido.mostrar(x: g.x, y: g.y, pulso: pulso, ventana: v.id)
        }

        /// Llegar a un punto: con `hid` la mano REAL viaja con el modelo humano (el Halo pegado a la punta);
        /// en segundo plano solo viaja el Halo.
        func llevar(_ l: CGPoint) throws {
            if via == "hid" {
                try Mano.asegurarArriba(pid: pid, ventana: v.id, punto: global(l))
                try Mano.llevar(a: global(l), ventana: v.id)
            } else { fantasma(l) }
        }

        /// Durante un arrastre el Halo va pegado a la punta (sin cola): nunca se queda atrás ni salta.
        func seguir(_ l: CGPoint) {
            let g = global(l)
            Fantasma.compartido.seguir(x: g.x, y: g.y, ventana: v.id)
        }

        func cerrar() -> JSON {
            if !devolver { return resumen() }
            if via == "frente" || via == "hid", let f = frenteAntes, f != pid { NSRunningApplication(processIdentifier: f)?.activate(options: []) }
            else if via == "fondo", let f = frenteAntes, f != pid { Cielo.devolverFoco(a: f, desde: pid, ventana: v.id) }
            return resumen()
        }

        func resumen() -> JSON {
            let c = CGEvent(source: nil)?.location ?? .zero
            let quien = MovioCursor.clasificar(desplazamientoPt: hypot(c.x - cursorAntes.x, c.y - cursorAntes.y),
                                               hidPropios: Vigia.propiosHIDAhora() - hidAntes, personaToco: Vigia.personaDesde(inicio))
            return ["via": via, "foco_devuelto": devolver, "via_activada": activado, "eventos": eventos, "ventana": Int(v.id),
                    "marco": ["x": v.marco.minX, "y": v.marco.minY, "w": v.marco.width, "h": v.marco.height],
                    // Antes solo comparaba la posición: si Daniel movía SU ratón, salía «MOVIDO» sin culpa de las manos.
                    "cursor_real_movido": quien.culpaDeLasManos, "cursor_movido_por": quien.rawValue]
        }
    }

    static func preparar(_ a: JSON) throws -> Gesto {
        let pid = try Motor.compartido.pid(a)
        let v = try ventana(pid, a["ventana"] as? Int)
        let via = (a["via"] as? String) ?? "fondo"
        guard ["fondo", "frente", "hid"].contains(via) else { throw ErrorManos("via: fondo (por defecto), frente o hid.") }
        if via == "hid" { try Vigia.autorizar(a) }
        Asentador.compartido.vigilar(pid)
        let g = Gesto(pid: pid, v: v, via: via, flags: banderas(a["modificadores"] as? [String] ?? []))
        g.devolver = a["devolver_foco"] as? Bool ?? true
        return g
    }

    static func dentro(_ p: CGPoint, _ v: Ventana) throws {
        guard p.x >= 0, p.y >= 0, p.x <= v.marco.width, p.y <= v.marco.height else {
            throw ErrorManos("El punto (\(Int(p.x)),\(Int(p.y))) cae fuera de la ventana \(Int(v.marco.width))×\(Int(v.marco.height)). Coordenadas relativas a la ventana, en puntos (px de `ojos` ÷ escala).")
        }
    }

    static func botonDe(_ a: JSON) -> (CGMouseButton, CGEventType, CGEventType, CGEventType) {
        switch a["boton"] as? String ?? "izquierdo" {
        case "derecho": return (.right, .rightMouseDown, .rightMouseDragged, .rightMouseUp)
        case "medio": return (.center, .otherMouseDown, .otherMouseDragged, .otherMouseUp)
        default: return (.left, .leftMouseDown, .leftMouseDragged, .leftMouseUp)
        }
    }

    // MARK: - Trazo / arrastre

    /// Uno o varios trazos con el botón apretado. `trazos` = [[[x,y]…]…] o `puntos` = [[x,y]…], relativos a la ventana.
    /// Sirve para dibujar con lápiz, arrastrar un elemento a otro sitio y seleccionar por recuadro.
    static func trazo(_ a: JSON) throws -> JSON {
        var lista = (a["trazos"] as? [Any])?.map { puntos($0) } ?? []
        if lista.isEmpty { lista = [puntos(a["puntos"])] }
        lista = lista.filter { !$0.isEmpty }
        guard !lista.isEmpty else { throw ErrorManos("trazo necesita `puntos` [[x,y]…] o `trazos` [[[x,y]…]…], relativos a la ventana.") }
        let g = try preparar(a)
        for s in lista { for p in s { try dentro(p, g.v) } }
        let velocidad = numero(a["velocidad"]) ?? 700, presion = numero(a["presion"]) ?? 0.7
        let natural = a["natural"] as? Bool ?? true, fantasma = a["fantasma"] as? Bool ?? true
        let parejo = a["parejo"] as? Bool ?? false
        let (boton, abajo, arrastre, arriba) = botonDe(a)
        let pausaSoltar = numero(a["pausa_soltar_ms"]) ?? 12
        // Entre trazos: la mano se posa (70–160 ms) salvo que se pida otra cosa (rellenos: 10–20 ms).
        let pausaEntre = numero(a["pausa_ms"])
        let t0 = DispatchTime.now().uptimeNanoseconds
        for (n, s) in lista.enumerated() {
            let plan = cronograma(curva(s, paso: 2), velocidad: velocidad, presion: presion, natural: natural, parejo: parejo)
            // Llegar: un mouseMoved donde empieza (cebador del hit-test) y la pausa de una mano que se posa.
            if g.via == "hid" { try Mano.llevar(a: g.global(plan[0].0), ventana: g.v.id) }
            g.raton(.mouseMoved, local: plan[0].0, boton: boton)
            if fantasma { g.via == "hid" ? g.seguir(plan[0].0) : g.fantasma(plan[0].0) }
            usleep(n == 0 ? 60_000 : UInt32(pausaEntre.map { $0 * 1000 } ?? (natural ? Double.random(in: 70_000...160_000) : 30_000)))
            g.raton(abajo, local: plan[0].0, boton: boton, presion: plan[0].2)
            usleep(16_000)
            let inicio = DispatchTime.now().uptimeNanoseconds
            var previo = plan[0].0, ultimoEnvio = 0.0, ultimoFantasma = 0.0
            for (i, (p, ms, pr)) in plan.enumerated() where i > 0 {
                // Fusionar muestras más densas que la cadencia de 8 ms (120 Hz, lo que ve la pantalla).
                if ms - ultimoEnvio < 8 && i < plan.count - 1 { continue }
                let objetivo = inicio + UInt64(ms * 1e6), ahora = DispatchTime.now().uptimeNanoseconds
                if objetivo > ahora { usleep(UInt32((objetivo - ahora) / 1000)) }
                if g.via == "hid", Vigia.personaDesde(g.inicio) {
                    // Daniel tomó el ratón: se suelta el botón donde iba y la mano se detiene (nunca pelea con él).
                    g.raton(arriba, local: previo, boton: boton)
                    _ = g.cerrar()
                    CursorSistema.liberar("interrumpida")
                    Fantasma.compartido.ocultarYa("interrumpida")
                    throw Mano.Interrumpida(real: Mano.posicion, esperado: g.global(previo), cuadro: i)
                }
                g.raton(arrastre, local: p, boton: boton, presion: pr, delta: CGPoint(x: p.x - previo.x, y: p.y - previo.y))
                // El fantasma (Fantasma.swift, de 100017) anima cada destino 125–600 ms: se le da uno cada ~220 ms
                // para que siga la punta sin acumular cola. Pendiente: `seguir(x:y:)` instantáneo (INTEGRACION.md).
                if fantasma && ms - ultimoFantasma >= 8 { g.seguir(p); ultimoFantasma = ms }
                previo = p; ultimoEnvio = ms
            }
            usleep(UInt32(pausaSoltar * 1000))
            g.raton(arriba, local: previo, boton: boton)
        }
        usleep(60_000)
        var r = g.cerrar()
        r["trazos"] = lista.count
        r["ms"] = Double(DispatchTime.now().uptimeNanoseconds - t0) / 1e6
        r["efecto"] = "sin_verificar"; r["detalle"] = "Mira el resultado con `ojos` (o `pixel` en puntos concretos)."
        return r
    }

    // MARK: - Clic, hover y rueda por coordenadas

    /// Lo que hay debajo de un punto según AX (para el freno). nil si la app no publica nada ahí.
    static func elementoEn(_ pid: pid_t, _ p: CGPoint) -> JSON? {
        var e: AXUIElement?
        guard AXUIElementCopyElementAtPosition(AX.app(pid), Float(p.x), Float(p.y), &e) == .success, let e else { return nil }
        var r: JSON = [:]
        for (k, attr) in [("rol", kAXRoleAttribute), ("titulo", kAXTitleAttribute), ("descripcion", kAXDescriptionAttribute), ("valor", kAXValueAttribute), ("ayuda", kAXHelpAttribute)] {
            if let s = AX.string(e, attr), !s.isEmpty { r[k] = String(s.prefix(120)) }
        }
        return r
    }

    /// Clic izquierdo/derecho/medio, simple, doble o triple. `solo_mirar` devuelve qué hay debajo sin tocar.
    static func clicXY(_ a: JSON) throws -> JSON {
        let pid = try Motor.compartido.pid(a)
        let v = try ventana(pid, a["ventana"] as? Int)
        guard let x = numero(a["x"]), let y = numero(a["y"]) else { throw ErrorManos("clic_xy necesita x e y relativos a la ventana.") }
        let l = CGPoint(x: x, y: y)
        try dentro(l, v)
        let gl = CGPoint(x: v.marco.minX + x, y: v.marco.minY + y)
        let debajo = elementoEn(pid, gl) ?? [:]
        if a["solo_mirar"] as? Bool == true { return ["debajo": debajo, "global": ["x": gl.x, "y": gl.y]] }
        let g = try preparar(a)
        let veces = max(1, min(3, (a["veces"] as? Int) ?? (a["doble"] as? Bool == true ? 2 : 1)))
        let (boton, abajo, _, arriba) = botonDe(a)
        let marca = Asentador.compartido.marca(pid)
        if g.via == "hid" {
            // Último recurso (cada quien su cursor): la mano real viaja y aprieta (el Halo va encima).
            try g.llevar(l)
            try Mano.clic(en: gl, veces: veces, boton: boton, ventana: v.id)
            let s = Asentador.compartido.esperar(pid, desde: marca)
            var r = g.cerrar()
            r["debajo"] = debajo; r["eventos_ax"] = s.eventos; r["asentar_ms"] = s.ms; r["efecto"] = "sin_verificar"
            r["global"] = ["x": gl.x, "y": gl.y]
            return r
        }
        g.fantasma(l, pulso: true)
        g.raton(.mouseMoved, local: l, boton: boton)
        usleep(12_000)
        for n in 1...veces {
            g.raton(abajo, local: l, boton: boton, clicks: Int64(n), presion: 1)
            usleep(28_000)
            g.raton(arriba, local: l, boton: boton, clicks: Int64(n))
            if n < veces { usleep(80_000) }
        }
        let s = Asentador.compartido.esperar(pid, desde: marca)
        var r = g.cerrar()
        r["debajo"] = debajo; r["eventos_ax"] = s.eventos; r["asentar_ms"] = s.ms; r["efecto"] = "sin_verificar"
        r["global"] = ["x": gl.x, "y": gl.y]
        if FondoAlcanzo.noAlcanzo(rol: debajo["rol"] as? String, eventosAX: s.eventos) {
            // El fondo no alcanzó: fallo con la sugerencia. Nunca se escala solo a la mano real.
            r["efecto"] = "fallo"
            r["detalle"] = "el clic de fondo no llegó (\(debajo["rol"] as? String ?? "control") sin eventos AX). Usa actuar por ref (AX), «quiero verte» (via frente, se ve el Halo) o, solo con la cita explícita de la persona o su inactividad, via hid."
        }
        return r
    }

    /// Pasar por encima: el puntero viaja (curva natural) y se queda `quedarse_ms` para que aparezcan tooltips o menús de hover.
    static func hover(_ a: JSON) throws -> JSON {
        var ps = puntos(a["puntos"])
        if ps.isEmpty, let x = numero(a["x"]), let y = numero(a["y"]) { ps = [CGPoint(x: x, y: y)] }
        guard !ps.isEmpty else { throw ErrorManos("hover necesita x,y o puntos.") }
        let g = try preparar(a)
        for p in ps { try dentro(p, g.v) }
        if g.via == "hid" {
            for p in ps { try g.llevar(p) }
            usleep(UInt32((numero(a["quedarse_ms"]) ?? 600) * 1000))
            return g.cerrar()
        }
        let plan = ps.count > 1 ? cronograma(curva(ps, paso: 3), velocidad: numero(a["velocidad"]) ?? 900, presion: 0, natural: true) : [(ps[0], 0, 0)]
        let inicio = DispatchTime.now().uptimeNanoseconds
        for (p, ms, _) in plan {
            let objetivo = inicio + UInt64(ms * 1e6), ahora = DispatchTime.now().uptimeNanoseconds
            if objetivo > ahora { usleep(UInt32((objetivo - ahora) / 1000)) }
            g.raton(.mouseMoved, local: p)
        }
        g.fantasma(plan.last!.0)
        usleep(UInt32((numero(a["quedarse_ms"]) ?? 600) * 1000))
        return g.cerrar()
    }

    /// Rueda en un punto que SÍ desplaza y lo comprueba (falla real del 2 oct: x.com/i/bookmarks no bajaba).
    /// `dy`/`dx` en PÍXELES (o líneas). Sin x,y apunta al centro del contenido (el área web en navegadores).
    /// Cascada, cada paso verificado comparando la firma visual de la zona antes y después:
    ///   1. rueda por SkyLight a la ventana (fondo; con `hid`, la mano real viaja y gira la rueda de verdad);
    ///   2. teclas Re Pág / Av Pág al proceso con el foco en el contenido (listas virtuales de X, YouTube);
    ///   3. AXScrollToVisible sobre el primer elemento fuera de la vista en esa dirección.
    /// Con cmd/option (zoom de lienzos) o `verificar:false` solo se hace el paso 1, como antes.
    static func rueda(_ a: JSON) throws -> JSON {
        let pid = try Motor.compartido.pid(a)
        let v0 = try ventana(pid, a["ventana"] as? Int)
        let area = Web.esNavegador(pid) ? (try? Motor.compartido.ventanaAX(pid, Int(v0.id))).flatMap { Web.areaWeb($0.0) }.flatMap(AX.marco) : nil
        var l: CGPoint
        if let x = numero(a["x"]), let y = numero(a["y"]) { l = CGPoint(x: x, y: y) }
        else if let m = area { l = CGPoint(x: m.x + m.w / 2 - v0.marco.minX, y: m.y + m.h / 2 - v0.marco.minY) }
        else { l = CGPoint(x: v0.marco.width / 2, y: v0.marco.height / 2) }
        // Punto fuera de la ventana (falla real: 724×396): se lleva al centro del contenido en vez de fallar.
        if l.x < 0 || l.y < 0 || l.x > v0.marco.width || l.y > v0.marco.height { l = CGPoint(x: v0.marco.width / 2, y: v0.marco.height / 2) }
        let g = try preparar(a)
        let dy = Int32(numero(a["dy"]) ?? 0), dx = Int32(numero(a["dx"]) ?? 0)
        let pixeles = a["lineas"] as? Bool != true
        let pasos = max(1, min(60, (a["pasos"] as? Int) ?? 8))
        let verificar = a["verificar"] as? Bool ?? (g.flags.isEmpty)
        // Zona a comparar: el contenido (área web) o la ventana, en píxeles de la captura.
        var zonaPt = CGRect(x: 0, y: 0, width: v0.marco.width, height: v0.marco.height)
        if let m = area { zonaPt = CGRect(x: m.x - v0.marco.minX, y: m.y - v0.marco.minY, width: m.w, height: m.h) }
        // Vertical: se MIDE el desplazamiento en una franja de la columna del punto (un video o un panel que cambia en su
        // sitio no cuenta: falso positivo real en X, 22:04). Horizontal o zoom: firma global contra su ruido.
        func firma() -> [UInt8]? {
            guard let img = Captura.imagen(g.v.id) else { return nil }
            let k = Double(img.width) / max(1, g.v.marco.width)
            if dy != 0 {
                let ancho = max(60, zonaPt.width * 0.28)
                let x0 = min(max(zonaPt.minX, l.x - ancho / 2), zonaPt.maxX - ancho)
                return Firma.franja(img, zona: CGRect(x: x0 * k, y: zonaPt.minY * k, width: ancho * k, height: zonaPt.height * k))
            }
            return Firma.de(img, zona: CGRect(x: zonaPt.minX * k, y: zonaPt.minY * k, width: zonaPt.width * k, height: zonaPt.height * k))
        }
        // Navegadores: Chrome deja de pintar las ventanas tapadas (la captura queda vieja: medido el 2 oct, 22:19). Ahí la
        // verdad es el DISEÑO: la y de los mismos elementos AX de la columna antes y después.
        let regMedida = RegistroVentana()
        func posiciones() -> [String: Double]? {
            guard area != nil, let (vax, _) = try? Motor.compartido.ventanaAX(pid, Int(g.v.id)), let web = Web.areaWeb(vax) else { return nil }
            let lect = Motor.compartido.recorrer(web, regMedida, max: 3000, presupuestoMs: 1500, podar: false)
            let gx = Double(g.v.marco.minX + l.x), ancho = Double(zonaPt.width)
            let arriba = Double(g.v.marco.minY + zonaPt.minY), abajo = Double(g.v.marco.minY + zonaPt.maxY)
            var r: [String: Double] = [:]
            for n in lect.nodos {
                guard let m = n.marco, m.h > 2, m.y > arriba + 2, m.y + m.h < abajo - 2, m.x <= gx + ancho * 0.3, m.x + m.w >= gx - ancho * 0.3 else { continue }
                r[n.ref] = m.y
            }
            return r
        }
        var posAntes = verificar && dy != 0 ? posiciones() : nil
        func medirAX() -> Double? {
            guard let a0 = posAntes, !a0.isEmpty, let a1 = posiciones() else { return nil }
            let comunes = a0.keys.filter { a1[$0] != nil }
            // Los fijos (cabeceras pegajosas, filtros) no se mueven: cuentan solo los que sí.
            let saltos = comunes.map { a0[$0]! - a1[$0]! }.filter { abs($0) >= 8 }.sorted()
            let nuevos = Set(a1.keys).subtracting(a0.keys).count
            posAntes = a1
            if saltos.count >= 2 { return saltos[saltos.count / 2] }
            // Lista virtual que reemplazó lo visible: también es moverse (en la dirección pedida).
            return nuevos >= 3 ? Double(dy) : 0
        }
        var antes: [UInt8]? = nil, ruido = 0.0
        if verificar, posAntes == nil, let f1 = firma() { usleep(90_000); if let f2 = firma() { ruido = Firma.diferencia(f1, f2); antes = f2 } }
        var intentos: [String] = []
        var filasMovidas = 0
        func movio() -> (Bool, Double) {
            if posAntes != nil {
                usleep(220_000)
                let d = medirAX() ?? 0
                let ok = abs(d) >= 8 && (d > 0) == (dy > 0)
                if ok { filasMovidas += Int((d * 320 / Double(zonaPt.height)).rounded()) }
                return (ok, d)
            }
            guard let a0 = antes else { return (true, -1) }
            usleep(260_000)
            guard let d = firma() else { return (true, -1) }
            if dy != 0 {
                let desp = Firma.desplazamiento(antes: a0, despues: d) ?? 0
                let ok = desp != 0 && (desp > 0) == (dy > 0)
                if ok { filasMovidas += desp; antes = d }
                return (ok, Double(desp) * zonaPt.height / 320)
            }
            let ok = Firma.cambio(antes: a0, despues: d, ruido: ruido)
            if ok { antes = d }
            return (ok, Firma.diferencia(a0, d))
        }
        // Navegadores: el foco dentro de la ventana debe estar en la PÁGINA (no en la barra de direcciones) para que
        // Chrome entregue la rueda al contenido. Falla real del 2 oct, 22:08: una bajada sí y otra no.
        if area != nil, let (vax, _) = try? Motor.compartido.ventanaAX(pid, Int(g.v.id)), let web = Web.areaWeb(vax) {
            AXUIElementSetAttributeValue(web, kAXFocusedAttribute as CFString, kCFBooleanTrue)
            usleep(40_000)
        }
        // 1. Rueda.
        if g.via == "hid" {
            try g.llevar(l)
            Mano.rueda(dy: dy, dx: dx, pasos: pasos, flags: g.flags)
            g.eventos += pasos
        } else {
            g.fantasma(l)
            g.raton(.mouseMoved, local: l)
            usleep(12_000)
            for i in 0..<pasos {
                let py = dy / Int32(pasos) + (i == pasos - 1 ? dy % Int32(pasos) : 0), px = dx / Int32(pasos) + (i == pasos - 1 ? dx % Int32(pasos) : 0)
                guard let ev = CGEvent(scrollWheelEvent2Source: g.fuente, units: pixeles ? .pixel : .line, wheelCount: 2, wheel1: py, wheel2: px, wheel3: 0) else { continue }
                ev.location = g.global(l)
                ev.flags = g.flags
                Cielo.enviar(ev, pid: g.pid, ventana: g.v.id, local: l, clickState: 0, boton: 0, subtipo: 0, gesto: g.gesto)
                g.eventos += 1
                usleep(16_000)
            }
        }
        func ruedaFondo() {
            g.raton(.mouseMoved, local: l)
            usleep(12_000)
            for i in 0..<pasos {
                let py = dy / Int32(pasos) + (i == pasos - 1 ? dy % Int32(pasos) : 0), px = dx / Int32(pasos) + (i == pasos - 1 ? dx % Int32(pasos) : 0)
                guard let ev = CGEvent(scrollWheelEvent2Source: g.fuente, units: pixeles ? .pixel : .line, wheelCount: 2, wheel1: py, wheel2: px, wheel3: 0) else { continue }
                ev.location = g.global(l)
                ev.flags = g.flags
                Cielo.enviar(ev, pid: g.pid, ventana: g.v.id, local: l, clickState: 0, boton: 0, subtipo: 0, gesto: g.gesto)
                g.eventos += 1
                usleep(16_000)
            }
        }
        var (ok, cambio) = verificar ? movio() : (true, -1)
        intentos.append("rueda \(g.via)\(ok ? " ✓" : " ✗")")
        if !ok, g.via == "hid", dy != 0 {
            // Un widget bajo el punto (reproductor, panel de una extensión) puede tragarse la rueda: otro punto de la columna.
            let otro = CGPoint(x: zonaPt.minX + zonaPt.width * 0.38, y: zonaPt.minY + zonaPt.height * 0.8)
            try g.llevar(otro)
            Mano.rueda(dy: dy, dx: dx, pasos: pasos, flags: g.flags)
            (ok, cambio) = movio()
            intentos.append("rueda hid en otro punto\(ok ? " ✓" : " ✗")")
            if ok { l = otro }
        }
        var via = "rueda"
        // 2. Teclas de página (con el contenido enfocado). Solo vertical.
        if !ok, dy != 0 {
            if let (vax, _) = try? Motor.compartido.ventanaAX(pid, Int(g.v.id)), let web = Web.areaWeb(vax) {
                AXUIElementSetAttributeValue(web, kAXFocusedAttribute as CFString, kCFBooleanTrue)
            }
            let alto = max(200, zonaPt.height * 0.85)
            let veces = max(1, min(8, Int((Double(abs(dy)) / alto).rounded(.up))))
            for _ in 0..<veces {
                // Av Pág / Re Pág llevan la marca de tecla de función, como las del teclado real.
                if g.via == "hid" { Mano.tecla(dy > 0 ? 121 : 116, flags: 0x800000) } else { Cielo.tecla(pid: pid, codigo: dy > 0 ? 121 : 116, flags: .maskSecondaryFn) }
                usleep(60_000)
            }
            (ok, cambio) = movio()
            intentos.append("teclas \(dy > 0 ? "AvPág" : "RePág")×\(veces)\(ok ? " ✓" : " ✗")")
            if ok { via = "teclas" }
        }
        // 3. AXScrollToVisible (sin foco ni teclas: lo que mejor funciona en Chrome de fondo) sobre el primer elemento fuera de la vista.
        if !ok, dy != 0, let (vax, _) = try? Motor.compartido.ventanaAX(pid, Int(g.v.id)) {
            let raiz = Web.areaWeb(vax) ?? vax
            // Borde visible del contenido. Chrome RECORTA al viewport el marco de lo que está fuera de vista: un
            // elemento «pegado» al borde (o más allá) está fuera. Solo la columna del punto (la barra lateral de
            // YouTube se desplaza aparte). Se repite hasta cubrir ~lo pedido: cada salto trae a la vista el elemento
            // renderizado más lejano (listas virtuales: X, YouTube renderizan pocos por delante).
            let borde = dy > 0 ? Double(zonaPt.maxY + g.v.marco.minY) : Double(zonaPt.minY + g.v.marco.minY)
            let gx = Double(g.v.marco.minX + l.x)
            var acumulado = 0.0, saltos = 0, ultimo = "", esperoCarga = false
            while saltos < 6, acumulado < Double(abs(dy)) * 0.75 {
                let reg = RegistroVentana()
                let lect = Motor.compartido.recorrer(raiz, reg, max: 4000, presupuestoMs: 2000, podar: false)
                let fueraTodos = lect.nodos.filter { n in
                    guard let m = n.marco, n.etiqueta?.isEmpty == false, ["AXLink", "AXGroup", "AXHeading", "AXStaticText", "AXButton", "AXRow", "AXCell"].contains(n.rol) else { return false }
                    // La columna del punto: su ancho cruza la vertical del punto (el pie de la barra lateral de X, no).
                    guard m.x <= gx + 40, m.x + m.w >= gx - 40 else { return false }
                    return dy > 0 ? m.y >= borde - 2 : m.y + m.h <= borde + 2
                }
                let ordenados = dy > 0 ? fueraTodos : fueraTodos.reversed()
                guard !ordenados.isEmpty else { break }
                let falta = Double(abs(dy)) - acumulado
                let k = falta > 400 ? ordenados.count - 1 : min(ordenados.count - 1, max(0, Int(falta / 160) - 1))
                let n = ordenados[k]
                guard let e = reg.porRef[n.ref] else { break }
                AXUIElementPerformAction(e, "AXScrollToVisible" as CFString)
                let (paso, d) = movio()
                saltos += 1; ultimo = n.etiqueta ?? n.rol
                if !paso {
                    // Fin de lo cargado (YouTube, X cargan más al llegar abajo): se espera la carga una vez.
                    if esperoCarga { break }
                    esperoCarga = true; usleep(900_000); continue
                }
                acumulado += abs(d)
            }
            ok = acumulado >= 8
            intentos.append(saltos == 0 ? "AXScrollToVisible: nada fuera de vista" : "AXScrollToVisible ×\(saltos) (último «\(ultimo.prefix(30))», \(Int(acumulado)) pt)\(ok ? " ✓" : " ✗")")
            if ok { via = "ax" }
        }
        var r = g.cerrar()
        r["via_scroll"] = via; r["intentos"] = intentos; r["desplazado"] = ok
        if dy != 0, verificar { r["desplazado_pt"] = (Double(filasMovidas) * zonaPt.height / 320).rounded() }
        else if cambio >= 0 { r["cambio_visual"] = (cambio * 1000).rounded() / 1000; r["ruido_visual"] = (ruido * 1000).rounded() / 1000 }
        r["efecto"] = !verificar ? "sin_verificar" : ok ? "confirmado" : "fallo"
        r["punto"] = ["x": l.x, "y": l.y]
        return r
    }


    // MARK: - Ojos

    /// Captura + OCR con cajas. Devuelve la ruta del PNG (lo mira el cerebro), el marco, la escala px/pt
    /// y cada texto con su caja en puntos de la ventana (y su centro, listo para `clic_xy`).
    static func ojos(_ a: JSON) throws -> JSON {
        let pid = try Motor.compartido.pid(a)
        let v = try ventana(pid, a["ventana"] as? Int)
        guard let img = Captura.imagen(v.id) else { throw ErrorManos("sin captura de la ventana \(v.id) (¿permiso de Grabación de pantalla?)") }
        let ruta = (a["ruta"] as? String) ?? "\(NSTemporaryDirectory())manos-ojos-\(v.id)-\(Int(Date().timeIntervalSince1970 * 1000)).png"
        let rep = NSBitmapImageRep(cgImage: img)
        try rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: ruta))
        let escala = Double(img.width) / max(1, v.marco.width)
        var r: JSON = ["ruta": ruta, "ventana": Int(v.id), "marco": ["x": v.marco.minX, "y": v.marco.minY, "w": v.marco.width, "h": v.marco.height],
                       "escala": escala, "px": ["w": img.width, "h": img.height]]
        if a["ocr"] as? Bool != false {
            let req = VNRecognizeTextRequest()
            req.recognitionLevel = .accurate
            req.recognitionLanguages = ["es-MX", "en-US"]
            try? VNImageRequestHandler(cgImage: img).perform([req])
            let filtro = (a["buscar"] as? String)?.lowercased()
            let W = v.marco.width, H = v.marco.height
            r["textos"] = (req.results ?? []).compactMap { o -> JSON? in
                guard let c = o.topCandidates(1).first else { return nil }
                if let filtro, !c.string.lowercased().contains(filtro) { return nil }
                let b = o.boundingBox // normalizado, origen abajo-izquierda
                let x = b.minX * W, y = (1 - b.maxY) * H, w = b.width * W, h = b.height * H
                return ["texto": c.string, "x": (x * 10).rounded() / 10, "y": (y * 10).rounded() / 10, "w": (w * 10).rounded() / 10, "h": (h * 10).rounded() / 10,
                        "centro": [((x + w / 2) * 10).rounded() / 10, ((y + h / 2) * 10).rounded() / 10], "confianza": Double(c.confidence)]
            }
        }
        return r
    }

    /// Color del píxel en un punto de la ventana (para verificar que un trazo quedó pintado sin un modelo).
    static func pixel(_ a: JSON) throws -> JSON {
        let pid = try Motor.compartido.pid(a)
        let v = try ventana(pid, a["ventana"] as? Int)
        guard let img = Captura.imagen(v.id) else { throw ErrorManos("sin captura") }
        let rep = NSBitmapImageRep(cgImage: img)
        let escala = Double(img.width) / max(1, v.marco.width)
        let pts = puntos(a["puntos"])
        return ["colores": pts.map { p -> JSON in
            let c = rep.colorAt(x: Int(p.x * escala), y: Int(p.y * escala))?.usingColorSpace(.sRGB)
            let hex = c.map { String(format: "#%02X%02X%02X", Int($0.redComponent * 255), Int($0.greenComponent * 255), Int($0.blueComponent * 255)) } ?? ""
            return ["x": p.x, "y": p.y, "hex": hex]
        }]
    }
}

extension Pluma {
    /// Lo que la app tiene seleccionado y el menú contextual que tenga abierto, leído por AX (sin portapapeles).
    static func seleccion(_ a: JSON) throws -> JSON {
        let pid = try Motor.compartido.pid(a)
        let app = AX.app(pid)
        var r: JSON = [:]
        var f: CFTypeRef?
        // Con ventana: el campo de texto de ESA ventana (el foco de la app puede estar en otra, p. ej. otro documento).
        if let w = a["ventana"] as? Int, let (v, _) = try? Motor.compartido.ventanaAX(pid, w), let campo = campoDeTexto(v) {
            r["rol"] = AX.string(campo, kAXRoleAttribute) ?? ""
            r["seleccion"] = AX.string(campo, kAXSelectedTextAttribute) ?? ""
        } else if AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute as CFString, &f) == .success, let f {
            let e = f as! AXUIElement
            r["rol"] = AX.string(e, kAXRoleAttribute) ?? ""
            r["seleccion"] = AX.string(e, kAXSelectedTextAttribute) ?? ""
        }
        // Menús abiertos: hijos AXMenu de la app (contextuales) con sus opciones.
        var hijos: CFTypeRef?
        var menus: [[String]] = []
        if AXUIElementCopyAttributeValue(app, kAXChildrenAttribute as CFString, &hijos) == .success, let hs = hijos as? [AXUIElement] {
            for h in hs where AX.string(h, kAXRoleAttribute) == "AXMenu" {
                var items: CFTypeRef?
                AXUIElementCopyAttributeValue(h, kAXChildrenAttribute as CFString, &items)
                menus.append(((items as? [AXUIElement]) ?? []).compactMap { AX.string($0, kAXTitleAttribute) }.filter { !$0.isEmpty })
            }
        }
        r["menus"] = menus
        return r
    }

    /// Primer AXTextArea/AXTextField dentro de una ventana (búsqueda en anchura, acotada).
    static func campoDeTexto(_ raiz: AXUIElement) -> AXUIElement? {
        var cola = [raiz], vistos = 0
        while !cola.isEmpty && vistos < 400 {
            let e = cola.removeFirst(); vistos += 1
            if let r = AX.string(e, kAXRoleAttribute), r == "AXTextArea" || r == "AXTextField" { return e }
            var h: CFTypeRef?
            if AXUIElementCopyAttributeValue(e, kAXChildrenAttribute as CFString, &h) == .success, let hs = h as? [AXUIElement] { cola.append(contentsOf: hs) }
        }
        return nil
    }
}
