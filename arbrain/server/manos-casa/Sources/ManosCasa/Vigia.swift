import AppKit
import ManosNucleo

/// Vigía de Daniel: cuándo tocó por última vez el ratón o el teclado, sin contar lo que publicó la mano.
/// Sirve a la regla «cada quien su cursor» (ManosNucleo/CursorPropio.swift): `via: hid` solo con Daniel inactivo o
/// con su pedido explícito, y la mano se detiene en cuanto él se mueve.
enum Vigia {
    private static let candado = NSLock()
    private static var ultimoPersona = CACurrentMediaTime() - segundosSistema()
    private static var ultimoPropio: Double?
    private static var ultimoTecladoPersona = CACurrentMediaTime() - segundosSistema()
    /// Último clic, rueda o tecla de Daniel (no mover el ratón): «tomó la ventana» (1 nov 2026, opción 2).
    private static var ultimoTomaPersona = CACurrentMediaTime() - segundosSistema()
    /// Eventos HID que publicó la mano desde que arrancó la app (para decir quién movió el cursor en un gesto).
    private(set) static var propiosHID = 0
    private static var monitor: Any?

    private static func segundosSistema() -> Double {
        CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: CGEventType(rawValue: ~0)!)
    }

    /// Arranca el monitor global (hilo principal, una vez; también al despertar del reposo).
    static func iniciar() {
        DispatchQueue.main.async {
            guard monitor == nil else { return }
            // Al despertar, lo que pasó mientras no escuchaba lo dice el sistema (cuenta también eventos de la mano).
            let base = CACurrentMediaTime() - segundosSistema()
            candado.lock(); ultimoPersona = max(ultimoPersona, base); candado.unlock()
            monitor = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved, .leftMouseDown, .rightMouseDown, .otherMouseDown,
                                                                   .leftMouseDragged, .rightMouseDragged, .scrollWheel, .keyDown, .flagsChanged]) { e in
                guard let cg = e.cgEvent else { return }
                if CursorSistema.esPropio(cg) { return }
                let ahora = CACurrentMediaTime()
                candado.lock(); defer { candado.unlock() }
                // Teclas de la mano sin marca (si el campo no sobrevive): las que llegan justo tras publicar una.
                let tecla = [.keyDown, .flagsChanged].contains(e.type)
                if tecla, let p = ultimoPropio, ahora - p < 0.15 { return }
                ultimoPersona = ahora
                if tecla { ultimoTecladoPersona = ahora }
                if tecla || e.type == .scrollWheel || [.leftMouseDown, .rightMouseDown, .otherMouseDown, .leftMouseDragged, .rightMouseDragged].contains(e.type) { ultimoTomaPersona = ahora }
            }
        }
    }

    /// Reposo (Salida): deja de escuchar ratón y teclado. `iniciar()` lo vuelve a encender.
    static func detener() {
        DispatchQueue.main.async {
            if let m = monitor { NSEvent.removeMonitor(m); monitor = nil }
        }
    }

    /// Segundos desde el último clic, rueda o tecla de Daniel. Lo que vio el monitor y, por si estaba en reposo o el
    /// pedido lo acaba de despertar, lo que dice el sistema por tipo de evento (si no fue la mano la que publicó después).
    static func tomaS() -> Double {
        let ahora = CACurrentMediaTime()
        let sistema = [CGEventType.leftMouseDown, .rightMouseDown, .otherMouseDown, .keyDown, .scrollWheel]
            .map { CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: $0) }.min() ?? .greatestFiniteMagnitude
        candado.lock(); defer { candado.unlock() }
        let monitor = ahora - ultimoTomaPersona
        if let p = ultimoPropio, ahora - p <= sistema + 0.25 { return monitor }  // lo último del sistema pudo ser la mano
        return min(monitor, sistema)
    }

    /// La mano va a publicar (o acaba de publicar) un evento HID.
    static func propio() { candado.lock(); ultimoPropio = CACurrentMediaTime(); propiosHID += 1; candado.unlock() }

    /// Segundos desde la última tecla de Daniel (para prestarle el foco de teclado a las manos solo en una pausa).
    static func tecladoInactivoS() -> Double { candado.lock(); defer { candado.unlock() }; return CACurrentMediaTime() - ultimoTecladoPersona }
    static func tecladoDesde(_ t: Double) -> Bool { candado.lock(); defer { candado.unlock() }; return ultimoTecladoPersona > t }
    static func propiosHIDAhora() -> Int { candado.lock(); defer { candado.unlock() }; return propiosHID }

    static func inactividadS() -> Double {
        let ahora = CACurrentMediaTime()
        candado.lock(); defer { candado.unlock() }
        return CursorPropio.inactividad(sistemaS: segundosSistema(), desdePropioS: ultimoPropio.map { ahora - $0 }, desdePersonaS: ahora - ultimoPersona)
    }

    /// ¿Daniel tocó algo desde `t` (CACurrentMediaTime)? Para detener la mano a mitad de un gesto.
    static func personaDesde(_ t: Double) -> Bool { candado.lock(); defer { candado.unlock() }; return ultimoPersona > t }

    /// Candado de ArbrainManos antes de mover el ratón real: el permiso de TS y la inactividad medida AHORA.
    static func autorizar(_ a: JSON) throws {
        // Edición cliente (red team 3 M-10): un cliente del socket no puede declararse `permiso_hid`.
        if Edicion.cliente { throw ErrorManos(Edicion.mensajeSinHid) }
        let permiso = a["permiso_hid"] as? String
        let umbral = (a["hid_inactivo_s"] as? Double) ?? (a["hid_inactivo_s"] as? Int).map(Double.init) ?? CursorPropio.umbralPorDefectoS
        let ina = inactividadS()
        guard CursorPropio.permite(permiso: permiso, inactividadS: ina, umbralS: umbral) else {
            throw ErrorManos(CursorPropio.motivo(permiso: permiso, inactividadS: ina, umbralS: umbral))
        }
    }
}
