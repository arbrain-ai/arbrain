import ApplicationServices
import AppKit
import ManosNucleo

/// SPI de HIServices estable desde 10.x (la usan yabai, Hammerspoon y Cua):
/// el CGWindowID de un AXWindow. Sin ella no hay puente AX ↔ CGWindowList.
@_silgen_name("_AXUIElementGetWindow")
func _AXUIElementGetWindow(_ element: AXUIElement, _ id: UnsafeMutablePointer<CGWindowID>) -> AXError

/// Atributos que se leen en UN viaje IPC por nodo (`AXUIElementCopyMultipleAttributeValues`).
/// Cua hace 8–14 viajes por nodo; esta es la mayor fuente de velocidad al observar.
enum Attr {
    static let lote: [String] = [
        kAXRoleAttribute, kAXSubroleAttribute, kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute,
        kAXEnabledAttribute, kAXSelectedAttribute, kAXPositionAttribute, kAXSizeAttribute, kAXChildrenAttribute,
        kAXPlaceholderValueAttribute, kAXIdentifierAttribute, "AXHelp", kAXTitleUIElementAttribute,
    ]
    /// Lote corto: lo que casi todo nodo necesita. Placeholder, identificador y ayuda se piden aparte
    /// solo para controles interactivos que quedaron sin etiqueta.
    static let corto: [String] = [
        kAXRoleAttribute, kAXSubroleAttribute, kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute,
        kAXEnabledAttribute, kAXSelectedAttribute, kAXPositionAttribute, kAXSizeAttribute, kAXChildrenAttribute,
        kAXTitleUIElementAttribute,
    ]
    static let rol = 0, subrol = 1, titulo = 2, descripcion = 3, valor = 4, habilitado = 5, seleccionado = 6
    static let posicion = 7, tamano = 8, hijos = 9, placeholder = 10, identificador = 11, ayuda = 12, tituloUI = 13
}

enum AX {
    /// Tiempo máximo por llamada IPC a una app. Una app colgada no cuelga a las manos.
    static var timeoutLectura: Float = 0.8

    static func app(_ pid: pid_t) -> AXUIElement {
        let a = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(a, timeoutLectura)
        return a
    }

    static func attr(_ e: AXUIElement, _ nombre: String) -> AnyObject? {
        var v: CFTypeRef?
        return AXUIElementCopyAttributeValue(e, nombre as CFString, &v) == .success ? v : nil
    }

    static func string(_ e: AXUIElement, _ nombre: String) -> String? { texto(attr(e, nombre)) }

    /// Lectura en lote. Con `corto`, devuelve el mismo orden de `Attr.lote` con nil en los que no pidió.
    static func lote(_ e: AXUIElement, corto: Bool = false) -> [AnyObject?] {
        if corto {
            let c = loteDe(e, Attr.corto)
            // corto = lote[0..<10] + tituloUI(13): se reacomoda a los índices de `Attr`.
            return Array(c[0..<10]) + [nil, nil, nil, c[10]]
        }
        return loteDe(e, Attr.lote)
    }

    static func loteDe(_ e: AXUIElement, _ nombres: [String]) -> [AnyObject?] {
        var valores: CFArray?
        let err = AXUIElementCopyMultipleAttributeValues(e, nombres as CFArray, AXCopyMultipleAttributeOptions(rawValue: 0), &valores)
        guard err == .success, let arr = valores as [AnyObject]? else { return Array(repeating: nil, count: nombres.count) }
        return arr.map { v in
            // Los atributos que faltan llegan como AXValue de tipo error: se vuelven nil.
            if CFGetTypeID(v) == AXValueGetTypeID(), AXValueGetType(v as! AXValue) == .axError { return nil }
            if v is NSNull { return nil }
            return v
        }
    }

    static func texto(_ v: AnyObject?) -> String? {
        guard let v else { return nil }
        if let s = v as? String { return s }
        if let n = v as? NSNumber { return n.stringValue }
        if let a = v as? NSAttributedString { return a.string }
        if CFGetTypeID(v) == AXUIElementGetTypeID() { return nil }
        return nil
    }

    static func bool(_ v: AnyObject?) -> Bool? { (v as? NSNumber)?.boolValue }

    static func punto(_ v: AnyObject?) -> CGPoint? {
        guard let v, CFGetTypeID(v) == AXValueGetTypeID() else { return nil }
        var p = CGPoint.zero
        return AXValueGetValue(v as! AXValue, .cgPoint, &p) ? p : nil
    }

    static func tamano(_ v: AnyObject?) -> CGSize? {
        guard let v, CFGetTypeID(v) == AXValueGetTypeID() else { return nil }
        var s = CGSize.zero
        return AXValueGetValue(v as! AXValue, .cgSize, &s) ? s : nil
    }

    static func elementos(_ v: AnyObject?) -> [AXUIElement] {
        guard let arr = v as? [AnyObject] else { return [] }
        return arr.compactMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil }
    }

    static func windowID(_ ventana: AXUIElement) -> CGWindowID? {
        var id: CGWindowID = 0
        return _AXUIElementGetWindow(ventana, &id) == .success && id != 0 ? id : nil
    }

    static func acciones(_ e: AXUIElement) -> [String] {
        var nombres: CFArray?
        guard AXUIElementCopyActionNames(e, &nombres) == .success, let n = nombres as? [String] else { return [] }
        return n
    }

    static func marco(_ e: AXUIElement) -> Marco? {
        guard let p = punto(attr(e, kAXPositionAttribute)), let s = tamano(attr(e, kAXSizeAttribute)) else { return nil }
        return Marco(x: p.x, y: p.y, w: s.width, h: s.height)
    }

    /// Ventanas AX de la app. `AXChildren` omite ventanas de apps en segundo plano: se une con `AXWindows` (mina de Cua).
    static func ventanas(_ app: AXUIElement) -> [AXUIElement] {
        var vistas: [AXUIElement] = []
        for e in elementos(attr(app, kAXWindowsAttribute)) + elementos(attr(app, kAXChildrenAttribute)) {
            let rol = string(e, kAXRoleAttribute)
            if rol == kAXWindowRole as String, !vistas.contains(where: { CFEqual($0, e) }) { vistas.append(e) }
        }
        return vistas
    }

    static func nombreError(_ e: AXError) -> String {
        switch e {
        case .success: return "ok"
        case .apiDisabled: return "sin permiso de Accesibilidad (ArbrainManos.app)"
        case .actionUnsupported: return "el elemento no admite esa acción"
        case .attributeUnsupported: return "el elemento no tiene ese atributo"
        case .cannotComplete: return "la app no respondió a tiempo (ocupada, modal abierto o cargando)"
        case .invalidUIElement: return "el elemento ya no existe: vuelve a observar"
        case .illegalArgument: return "argumento inválido"
        case .notImplemented: return "la app no implementa esa parte de accesibilidad"
        case .noValue: return "sin valor"
        case .failure: return "falló la llamada de accesibilidad"
        default: return "error AX \(e.rawValue)"
        }
    }
}

/// Envoltorio Hashable para usar AXUIElement como llave (CFEqual/CFHash):
/// así un elemento conserva su ref entre observaciones y el diff es por identidad.
struct LlaveAX: Hashable {
    let e: AXUIElement
    static func == (a: LlaveAX, b: LlaveAX) -> Bool { CFEqual(a.e, b.e) }
    func hash(into h: inout Hasher) { h.combine(CFHash(e)) }
}
