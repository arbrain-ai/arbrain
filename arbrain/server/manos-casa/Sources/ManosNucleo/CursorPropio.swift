import Foundation

/// Cada quien su cursor (regla firmada por Daniel, 3 oct 2026). El Halo es el cursor de las manos; el ratón real de
/// Daniel (`via: hid`) es el último recurso y solo con permiso: su cita explícita para esa acción o él inactivo.
/// «Quiero verte» NUNCA es permiso de hid: es la ventana al frente con el Halo animado.
public enum CursorPropio {
    public static let umbralPorDefectoS = 60.0

    /// Segundos reales sin que Daniel toque ratón ni teclado.
    /// - sistemaS: lo que dice el WindowServer desde el último evento de entrada (cuenta también los de la mano).
    /// - desdePropioS: desde el último evento que publicó la mano (nil si nunca).
    /// - desdePersonaS: desde el último evento de Daniel que vio el monitor (sin marca de la mano).
    /// Si el último evento del sistema es posterior al último de la mano, es de Daniel y manda el sistema; si no, la
    /// mano lo tapó y vale lo que vio el monitor.
    public static func inactividad(sistemaS: Double, desdePropioS: Double?, desdePersonaS: Double) -> Double {
        let s = max(0, sistemaS), d = max(0, desdePersonaS)
        guard let p = desdePropioS else { return min(s, d) }
        if p > s + 0.25 { return min(s, d) }
        return d
    }

    /// ¿Puede la mano mover el cursor real ahora? `permiso` lo pone la capa TS (explicito | inactivo); aquí se vuelve a
    /// medir la inactividad justo antes de mover (Daniel pudo tocar el ratón entre que TS preguntó y el gesto).
    public static func permite(permiso: String?, inactividadS: Double, umbralS: Double = umbralPorDefectoS) -> Bool {
        switch permiso {
        case "explicito": return true
        case "inactivo": return inactividadS >= umbralS
        default: return false
        }
    }

    public static func motivo(permiso: String?, inactividadS: Double, umbralS: Double) -> String {
        if permiso == nil { return "FRENO (cursor_de_daniel): via=hid sin permiso. El Halo es el cursor de las manos; el ratón de la persona solo con su pedido explícito o con él inactivo." }
        return String(format: "FRENO (cursor_de_daniel): la persona tocó el ratón o el teclado hace %.0f s (hacen falta %.0f s de inactividad). La mano real no se mueve.", inactividadS, umbralS)
    }
}

/// Quién movió el cursor real durante un gesto de las manos. Falla real del 3 oct, 10:38: `clic_xy` por defecto en
/// Claude Desktop dijo «cursor real MOVIDO» porque solo comparaba la posición antes y después, y Daniel mueve SU ratón.
public enum MovioCursor: String {
    /// El cursor no se movió.
    case nadie
    /// Daniel tocó su ratón durante el gesto: es suyo, no un fallo de las manos.
    case persona
    /// Las manos publicaron eventos HID (solo pasa con `via: hid` autorizado).
    case manosHid = "manos_hid"
    /// Se movió sin eventos de hardware ni HID propios: la app o el sistema lo movió (warp). Hay que reportarlo.
    case sinEvento = "sin_evento"

    public static func clasificar(desplazamientoPt: Double, hidPropios: Int, personaToco: Bool) -> MovioCursor {
        if hidPropios > 0 { return .manosHid }
        if desplazamientoPt <= 0.5 { return .nadie }
        return personaToco ? .persona : .sinEvento
    }

    /// ¿Debe reportarse como «las manos movieron el cursor de Daniel»?
    public var culpaDeLasManos: Bool { self == .manosHid || self == .sinEvento }
}

/// ¿El gesto de fondo no alcanzó? Un control estándar SIEMPRE publica eventos AX al presionarse; si no hubo ninguno,
/// el clic no llegó (la app ignora el clic sintético de fondo). En vistas sin accesibilidad (lienzos, AXGroup web) no se
/// puede saber: queda sin verificar.
public enum FondoAlcanzo {
    public static let controles: Set<String> = ["AXButton", "AXCheckBox", "AXRadioButton", "AXPopUpButton", "AXMenuButton",
                                                "AXLink", "AXMenuItem", "AXComboBox", "AXTextField", "AXTextArea", "AXSlider",
                                                "AXDisclosureTriangle", "AXIncrementor", "AXTab", "AXSwitch"]
    public static func noAlcanzo(rol: String?, eventosAX: Int) -> Bool { eventosAX == 0 && controles.contains(rol ?? "") }
}

/// Préstamo del foco de teclado (un solo foco por sesión de macOS): las manos solo lo toman en una pausa del teclado de
/// Daniel, lo devuelven en cuanto terminan y reportan si él tecleó durante el préstamo.
public enum PrestamoFoco {
    /// Segundos sin teclas de Daniel para considerar que está en pausa.
    public static let pausaS = 1.5
    public static func puedeTomar(tecladoInactivoS: Double, pausa: Double = pausaS) -> Bool { tecladoInactivoS >= pausa }
}
