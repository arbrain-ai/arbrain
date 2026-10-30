import AppKit
import ApplicationServices
import ManosNucleo

/// La mano REAL: mueve el cursor de la Mac con el mismo modelo humano que el Halo (`Movimiento` de
/// ManosNucleo/Trazado.swift) y el Halo va pegado a la punta. Solo se usa con `via: hid`, ÚLTIMO RECURSO desde la regla
/// «cada quien su cursor» (3 oct): la capa TS lo autoriza con la cita explícita de Daniel o con él inactivo, y
/// `Vigia.autorizar` lo vuelve a comprobar aquí. «Quiero verte» NO pasa por aquí: es la ventana al frente con el Halo.
///
/// Seguridad: si Daniel agarra el ratón o teclea a mitad del gesto, la mano se detiene y lo reporta; nunca pelea con él.
enum Mano {
    struct Interrumpida: Error, CustomStringConvertible {
        var real = CGPoint.zero, esperado = CGPoint.zero, cuadro = 0
        var description: String { "La persona movió el ratón: la mano real se detuvo para no pelear con él (cursor en \(Int(real.x)),\(Int(real.y)); la mano lo dejó en \(Int(esperado.x)),\(Int(esperado.y)); cuadro \(cuadro))." }
    }

    static var posicion: CGPoint { CGEvent(source: nil)?.location ?? .zero }

    /// Viaja del punto actual a `destino` (global, puntos AX) a 125 Hz. Devuelve los ms que tardó.
    @discardableResult
    static func llevar(a destino: CGPoint, ventana: CGWindowID? = nil, ritmo: Double = 1, boton: CGMouseButton? = nil) throws -> Double {
        let fuente = CGEventSource(stateID: .hidSystemState)
        let desde = posicion
        // El Halo nunca salta: si descansaba en otro lado, primero viaja hasta donde está el cursor real.
        Fantasma.compartido.alcanzar(desde, ventana: ventana)
        var p = ParametrosMovimiento.estandar
        p.ritmo = ritmo
        let m = Movimiento(desde: desde, hasta: destino, parametros: p)
        let t0 = DispatchTime.now().uptimeNanoseconds
        var ultimo = desde
        // Una sola flecha: mientras la mano tiene el ratón, el Halo es el cursor (CursorSistema / PoliticaFlecha).
        CursorSistema.gesto(en: desde, nuevo: true)
        // Historia de lo que se publicó: el WindowServer aplica los eventos con unos cuadros de retraso.
        var publicados: [CGPoint] = [desde]
        var raras = 0
        let tipo: CGEventType = boton == nil ? .mouseMoved : (boton == .right ? .rightMouseDragged : .leftMouseDragged)
        let inicio = CACurrentMediaTime()
        for (q, ms) in m.muestras(hz: 125) {
            if Vigia.personaDesde(inicio) { CursorSistema.liberar("interrumpida"); Fantasma.compartido.ocultarYa("interrumpida"); throw Interrumpida(real: posicion, esperado: ultimo, cuadro: publicados.count) }
            let objetivo = t0 + UInt64(ms * 1e6), ahora = DispatchTime.now().uptimeNanoseconds
            if objetivo > ahora { usleep(UInt32((objetivo - ahora) / 1000)) }
            let real = posicion
            let cerca = publicados.suffix(12).map { hypot(real.x - $0.x, real.y - $0.y) }.min() ?? 0
            // Daniel agarró el ratón: lejos de todo lo publicado en los últimos ~100 ms, dos cuadros seguidos.
            if cerca > 40 { raras += 1; if raras >= 3 { CursorSistema.liberar("interrumpida"); Fantasma.compartido.ocultarYa("interrumpida"); throw Interrumpida(real: real, esperado: ultimo, cuadro: publicados.count) } } else { raras = 0 }
            guard let ev = CGEvent(mouseEventSource: fuente, mouseType: tipo, mouseCursorPosition: q, mouseButton: boton ?? .left) else { continue }
            CursorSistema.marcar(ev)
            CursorSistema.gesto(en: q)
            ev.setIntegerValueField(.mouseEventDeltaX, value: Int64((q.x - ultimo.x).rounded()))
            ev.setIntegerValueField(.mouseEventDeltaY, value: Int64((q.y - ultimo.y).rounded()))
            ev.post(tap: .cghidEventTap)
            Fantasma.compartido.seguir(x: q.x, y: q.y, ventana: ventana)
            ultimo = q
            publicados.append(q)
        }
        return Double(DispatchTime.now().uptimeNanoseconds - t0) / 1e6
    }

    /// Clic real (HID) donde está la mano, con el «press» y la onda del Halo.
    static func clic(en p: CGPoint, veces: Int = 1, boton: CGMouseButton = .left, ventana: CGWindowID? = nil) throws {
        let inicio = CACurrentMediaTime()
        let fuente = CGEventSource(stateID: .hidSystemState)
        let (abajo, arriba): (CGEventType, CGEventType) = boton == .right ? (.rightMouseDown, .rightMouseUp) : (.leftMouseDown, .leftMouseUp)
        Fantasma.compartido.seguir(x: p.x, y: p.y, ventana: ventana, pulso: true)
        CursorSistema.gesto(en: p, nuevo: true)
        usleep(UInt32.random(in: 40_000...90_000))   // la mano se posa antes de apretar
        if Vigia.personaDesde(inicio) || hypot(posicion.x - p.x, posicion.y - p.y) > 40 {
            CursorSistema.liberar("interrumpida"); Fantasma.compartido.ocultarYa("interrumpida"); throw Interrumpida(real: posicion, esperado: p, cuadro: 0)
        }
        for n in 1...max(1, veces) {
            for (tipo, pausa) in [(abajo, UInt32.random(in: 55_000...95_000)), (arriba, 0)] {
                guard let ev = CGEvent(mouseEventSource: fuente, mouseType: tipo, mouseCursorPosition: p, mouseButton: boton) else { continue }
                ev.setIntegerValueField(.mouseEventClickState, value: Int64(n))
                CursorSistema.marcar(ev)
                ev.post(tap: .cghidEventTap)
                if pausa > 0 { usleep(pausa) }
            }
            if n < veces { usleep(70_000) }
        }
    }

    /// Teclea como una persona en la app al frente (HID): 45–110 ms por letra, más tras espacios y signos.
    static func teclear(_ texto: String) throws {
        let fuente = CGEventSource(stateID: .hidSystemState)
        let inicio = CACurrentMediaTime()
        for c in texto {
            if Vigia.personaDesde(inicio) { Fantasma.compartido.ocultarYa("interrumpida"); throw Interrumpida(real: posicion, esperado: posicion, cuadro: 0) }
            let u = Array(String(c).utf16)
            for abajo in [true, false] {
                guard let ev = CGEvent(keyboardEventSource: fuente, virtualKey: 0, keyDown: abajo) else { continue }
                ev.flags = []
                ev.keyboardSetUnicodeString(stringLength: u.count, unicodeString: u)
                CursorSistema.marcar(ev)
                ev.post(tap: .cghidEventTap)
                if abajo { usleep(UInt32.random(in: 12_000...28_000)) }
            }
            usleep(UInt32(Trayectoria.pausaLetraMs(c, azar: Double.random(in: 0...1)) * 1000) + UInt32.random(in: 10_000...30_000))
        }
    }

    /// Una tecla con modificadores por HID (Return para enviar, ⌘A, etc.) a la app al frente.
    static func tecla(_ codigo: UInt16, flags: UInt64) {
        let fuente = CGEventSource(stateID: .hidSystemState)
        for abajo in [true, false] {
            guard let ev = CGEvent(keyboardEventSource: fuente, virtualKey: CGKeyCode(codigo), keyDown: abajo) else { continue }
            ev.flags = CGEventFlags(rawValue: flags)
            CursorSistema.marcar(ev)
            ev.post(tap: .cghidEventTap)
            if abajo { usleep(30_000) }
        }
    }

    /// Rueda real (HID) donde está la mano: en píxeles, repartida como un gesto de trackpad.
    static func rueda(dy: Int32, dx: Int32, pasos: Int, flags: CGEventFlags = []) {
        let fuente = CGEventSource(stateID: .hidSystemState)
        let n = Int32(max(1, pasos))
        for i in 0..<n {
            let py = dy / n + (i == n - 1 ? dy % n : 0), px = dx / n + (i == n - 1 ? dx % n : 0)
            guard let ev = CGEvent(scrollWheelEvent2Source: fuente, units: .pixel, wheelCount: 2, wheel1: py, wheel2: px, wheel3: 0) else { continue }
            ev.flags = flags
            CursorSistema.marcar(ev)
            ev.post(tap: .cghidEventTap)
            usleep(16_000)
        }
    }

    /// La ventana que de verdad recibe el ratón en un punto: la primera de capa 0 en pantalla que lo contiene
    /// (las capas de arriba son paneles que no reciben clics, como el Halo).
    static func ventanaEn(_ p: CGPoint) -> (pid: pid_t, id: CGWindowID)? {
        guard let l = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
        for w in l where (w[kCGWindowLayer as String] as? Int) == 0 {
            guard let b = w[kCGWindowBounds as String] as? [String: Double], let pid = w[kCGWindowOwnerPID as String] as? Int else { continue }
            if pid == Int(getpid()) { continue }
            let r = CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: b["Width"] ?? 0, height: b["Height"] ?? 0)
            if r.contains(p) { return (pid_t(pid), CGWindowID(w[kCGWindowNumber as String] as? Int ?? 0)) }
        }
        return nil
    }

    struct Tapada: Error, CustomStringConvertible {
        let quien: String
        var description: String { "Otra ventana (\(quien)) tapa el punto: la mano real no actúa ahí para no tocar algo de la persona." }
    }

    /// Antes de que la mano REAL actúe: la ventana objetivo debe ser la que recibe el ratón en ese punto.
    /// Si no, se sube otra vez; si sigue tapada, se detiene (nunca hace scroll ni clic en una ventana de Daniel).
    static func asegurarArriba(pid: pid_t, ventana id: CGWindowID, punto p: CGPoint) throws {
        if let w = ventanaEn(p), w.pid == pid, w.id == id { return }
        let vax = try? Motor.compartido.ventanaAX(pid, Int(id)).0
        alFrente(pid: pid, ventana: vax, id: id)
        for _ in 0..<30 {
            if let w = ventanaEn(p), w.pid == pid, w.id == id { return }
            usleep(20_000)
        }
        let w = ventanaEn(p)
        throw Tapada(quien: w.flatMap { NSRunningApplication(processIdentifier: $0.pid)?.localizedName } ?? "desconocida")
    }

    /// Pone la app y su ventana al frente de verdad (necesario para que el teclado HID entre ahí) y espera a que lo esté.
    @discardableResult
    static func alFrente(pid: pid_t, ventana: AXUIElement?, id: CGWindowID?) -> Bool {
        if let id { Cielo.alFrente(pid: pid, ventana: id) }
        NSRunningApplication(processIdentifier: pid)?.activate(options: [])
        if let ventana { AXUIElementPerformAction(ventana, kAXRaiseAction as CFString) }
        for _ in 0..<40 where NSWorkspace.shared.frontmostApplication?.processIdentifier != pid { usleep(10_000) }
        return NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
    }
}
