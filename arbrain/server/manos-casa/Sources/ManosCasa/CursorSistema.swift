import AppKit
import ManosNucleo

/// Ejecuta `PoliticaFlecha` (ManosNucleo/Flecha.swift): mientras la mano real trabaja, la flecha del sistema se oculta
/// y el Halo es el único cursor. No toca permisos ni la seguridad de macOS: CGDisplayHideCursor es API pública; la
/// propiedad de conexión «SetsCursorInBackground» (SkyLight, privada pero sin privilegios) solo le permite surtir
/// efecto a una app que no está al frente (la mano siempre deja al frente la app de Daniel). Si el símbolo no existe en
/// esta versión de macOS, no se oculta nada y queda el comportamiento anterior (dos flechas), nunca un cursor perdido.
///
/// Se apaga con MANOS_FLECHA_UNICA=0.
enum CursorSistema {
    static let activo = ProcessInfo.processInfo.environment["MANOS_FLECHA_UNICA"] != "0"
    private static var politica = PoliticaFlecha()
    private static var publicados: [CGPoint] = []
    private static var monitor: Any?
    private static var vigia: Timer?
    private static var fondoPermitido: Bool?
    /// Medición para la prueba en vivo: cuántas veces se ocultó / mostró y por qué.
    private(set) static var bitacora: [String] = []

    private typealias FnConexion = @convention(c) () -> Int32
    private typealias FnPropiedad = @convention(c) (Int32, Int32, CFString, CFTypeRef) -> Int32

    /// Resuelve los símbolos sin llamarlos (para el doctor y las pruebas): ¿se puede ocultar desde el fondo?
    static var disponible: Bool {
        let h = dlopen(nil, RTLD_NOW)
        return (dlsym(h, "CGSMainConnectionID") ?? dlsym(h, "SLSMainConnectionID")) != nil
            && (dlsym(h, "CGSSetConnectionProperty") ?? dlsym(h, "SLSSetConnectionProperty")) != nil
    }

    private static func permitirEnFondo() -> Bool {
        if let f = fondoPermitido { return f }
        let h = dlopen(nil, RTLD_NOW)
        guard let c = dlsym(h, "CGSMainConnectionID") ?? dlsym(h, "SLSMainConnectionID"),
              let s = dlsym(h, "CGSSetConnectionProperty") ?? dlsym(h, "SLSSetConnectionProperty") else { fondoPermitido = false; return false }
        let conexion = unsafeBitCast(c, to: FnConexion.self)(), poner = unsafeBitCast(s, to: FnPropiedad.self)
        let ok = poner(conexion, conexion, "SetsCursorInBackground" as CFString, kCFBooleanTrue) == 0
        fondoPermitido = ok
        return ok
    }

    private static func ahora() -> Double { CACurrentMediaTime() }

    private static func aplicar(_ a: PoliticaFlecha.Accion, _ porque: String) {
        switch a {
        case .ninguna: return
        case .ocultar:
            guard permitirEnFondo() else { _ = politica.liberar(); bitacora.append("sin_simbolo"); return }
            CGDisplayHideCursor(CGMainDisplayID())
            escuchar()
        case .mostrar:
            CGDisplayShowCursor(CGMainDisplayID())
            publicados.removeAll()
        }
        bitacora.append("\(a == .ocultar ? "oculta" : "visible"):\(porque)")
        if bitacora.count > 200 { bitacora.removeFirst(100) }
    }

    private static func enPrincipal(_ f: @escaping () -> Void) {
        if Thread.isMainThread { f() } else { DispatchQueue.main.async(execute: f) }
    }

    /// La mano real va a publicar un evento en `p`: oculta la flecha (si no lo estaba) y recuerda el punto.
    static func gesto(en p: CGPoint, nuevo: Bool = false) {
        guard activo else { return }
        enPrincipal {
            publicados.append(p); if publicados.count > 64 { publicados.removeFirst(32) }
            aplicar(politica.gesto(ahora(), nuevo: nuevo), "mano")
        }
    }

    /// La mano se interrumpió o falló, o el Halo se desvaneció: la flecha vuelve.
    static func liberar(_ porque: String) {
        guard activo else { return }
        enPrincipal { aplicar(politica.liberar(), porque) }
    }

    static var oculta: Bool { politica.oculta }

    /// Marca un evento como nuestro antes de publicarlo.
    static func marcar(_ ev: CGEvent) { ev.setIntegerValueField(.eventSourceUserData, value: PoliticaFlecha.marca); Vigia.propio() }

    /// ¿Lo publicó la mano? Por la marca o por caer donde la mano publicó (para el vigía de Daniel).
    static func esPropio(_ ev: CGEvent) -> Bool {
        let ud = ev.getIntegerValueField(.eventSourceUserData)
        if ud == PoliticaFlecha.marca { return true }
        let p = ev.location
        var cerca = false
        let mirar = { cerca = PoliticaFlecha.esPropio(userData: ud, punto: p, publicados: publicados) }
        if Thread.isMainThread { mirar() } else { DispatchQueue.main.sync(execute: mirar) }
        return cerca
    }

    /// Dos detectores independientes de «Daniel tomó el ratón»: el monitor global de eventos y un vigía a 4 Hz que
    /// compara la posición real con lo publicado (por si el monitor no recibe algo). El vigía aplica también el tope.
    private static func escuchar() {
        if monitor == nil {
            monitor = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved, .leftMouseDown, .rightMouseDown, .otherMouseDown,
                                                                   .leftMouseDragged, .rightMouseDragged, .scrollWheel]) { e in
                let ud = e.cgEvent?.getIntegerValueField(.eventSourceUserData) ?? 0
                let p = e.cgEvent?.location ?? .zero
                let propio = PoliticaFlecha.esPropio(userData: ud, punto: p, publicados: publicados)
                aplicar(politica.eventoRaton(ahora(), propio: propio), "persona")
            }
        }
        if vigia == nil {
            let t = Timer(timeInterval: 0.25, repeats: true) { _ in
                guard politica.oculta else { vigia?.invalidate(); vigia = nil; return }
                let real = CGEvent(source: nil)?.location ?? .zero
                if let ultimo = publicados.last, !PoliticaFlecha.esPropio(userData: 0, punto: real, publicados: publicados),
                   hypot(real.x - ultimo.x, real.y - ultimo.y) > 3 {
                    aplicar(politica.eventoRaton(ahora(), propio: false), "vigia_posicion"); return
                }
                aplicar(politica.tic(ahora()), "tope")
            }
            RunLoop.main.add(t, forMode: .common)
            vigia = t
        }
    }

    /// Lectura independiente del WindowServer (CGCursorIsVisible ya no se expone en Swift; se resuelve por símbolo).
    static func cursorVisibleCG() -> Bool? {
        guard let f = dlsym(dlopen(nil, RTLD_NOW), "CGCursorIsVisible") else { return nil }
        return unsafeBitCast(f, to: (@convention(c) () -> Int32).self)() != 0
    }

    /// Para el doctor y la prueba en vivo.
    static func estado() -> [String: Any] {
        ["flecha_unica": activo, "flecha_sistema_oculta": politica.oculta, "ocultable_desde_fondo": disponible,
         "cursor_visible_cg": cursorVisibleCG() as Any, "bitacora": Array(bitacora.suffix(20))]
    }
}
