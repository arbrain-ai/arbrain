import Foundation

/// Un nodo del árbol de accesibilidad ya leído, sin referencias vivas a AX.
/// El motor guarda aparte el `AXUIElement` de cada ref; aquí solo hay datos.
public struct Nodo: Equatable {
    public var ref: String
    public var rol: String
    public var subrol: String?
    public var etiqueta: String?
    public var valor: String?
    public var habilitado: Bool?
    public var seleccionado: Bool?
    public var marco: Marco?
    public var profundidad: Int
    public var acciones: [String]?

    public init(ref: String, rol: String, subrol: String? = nil, etiqueta: String? = nil, valor: String? = nil,
                habilitado: Bool? = nil, seleccionado: Bool? = nil, marco: Marco? = nil, profundidad: Int = 0, acciones: [String]? = nil) {
        self.ref = ref; self.rol = rol; self.subrol = subrol; self.etiqueta = etiqueta; self.valor = valor
        self.habilitado = habilitado; self.seleccionado = seleccionado; self.marco = marco; self.profundidad = profundidad; self.acciones = acciones
    }

    /// Una línea para el modelo. Corta y estable: el diff compara estas líneas.
    public var linea: String {
        var s = "\(String(repeating: "  ", count: max(0, profundidad)))[\(ref)] \(rolCorto)"
        if let e = etiqueta, !e.isEmpty { s += " «\(Arbol.recortar(e, 120))»" }
        if let v = valor, !v.isEmpty { s += " = \(Arbol.recortar(v, 160))" }
        if habilitado == false { s += " (inactivo)" }
        if seleccionado == true { s += " (seleccionado)" }
        return s
    }

    /// `AXButton` → `boton`… El modelo ve menos ruido y menos tokens.
    public var rolCorto: String {
        let base = Arbol.rolesCortos[rol] ?? rol.replacingOccurrences(of: "AX", with: "").lowercased()
        if let s = subrol, s == "AXSwitch" { return "interruptor" }
        if let s = subrol, s == "AXSearchField" { return "busqueda" }
        return base
    }

    public var centro: (x: Double, y: Double)? {
        guard let m = marco, m.w > 0, m.h > 0 else { return nil }
        return (m.x + m.w / 2, m.y + m.h / 2)
    }
}

public struct Marco: Equatable {
    public var x: Double, y: Double, w: Double, h: Double
    public init(x: Double, y: Double, w: Double, h: Double) { self.x = x; self.y = y; self.w = w; self.h = h }
}

public enum Arbol {
    public static let rolesCortos: [String: String] = [
        "AXButton": "boton", "AXCheckBox": "casilla", "AXRadioButton": "radio", "AXPopUpButton": "desplegable",
        "AXMenuButton": "boton_menu", "AXTextField": "campo", "AXTextArea": "texto", "AXStaticText": "etiqueta",
        "AXRow": "fila", "AXCell": "celda", "AXOutline": "lista_arbol", "AXTable": "tabla", "AXList": "lista",
        "AXGroup": "grupo", "AXScrollArea": "desplazable", "AXWindow": "ventana", "AXSheet": "hoja",
        "AXToolbar": "barra", "AXTabGroup": "pestanas", "AXSlider": "deslizador", "AXImage": "imagen",
        "AXLink": "enlace", "AXMenuItem": "item_menu", "AXMenu": "menu", "AXMenuBarItem": "menu_barra",
        "AXComboBox": "combo", "AXDisclosureTriangle": "desplegar", "AXHeading": "titulo", "AXSplitGroup": "division",
        "AXIncrementor": "incrementador", "AXColorWell": "color", "AXWebArea": "web", "AXDialog": "dialogo",
        "AXSegmentedControl": "segmentos", "AXValueIndicator": "indicador",
    ]

    /// Roles que solo agrupan: si no tienen etiqueta ni valor, no se imprimen
    /// (sus hijos suben un nivel). Recorta el árbol que lee el modelo a la mitad
    /// sin perder nada que se pueda tocar.
    public static let contenedores: Set<String> = [
        "AXGroup", "AXScrollArea", "AXSplitGroup", "AXLayoutArea", "AXLayoutItem", "AXUnknown",
        "AXSplitter", "AXMatte", "AXGrowArea", "AXRuler", "AXColumn",
    ]

    /// Roles sobre los que se puede actuar: los únicos que piden `acciones`.
    public static let interactivos: Set<String> = [
        "AXButton", "AXCheckBox", "AXRadioButton", "AXPopUpButton", "AXMenuButton", "AXTextField", "AXTextArea",
        "AXRow", "AXCell", "AXSlider", "AXLink", "AXMenuItem", "AXMenuBarItem", "AXComboBox", "AXDisclosureTriangle",
        "AXIncrementor", "AXSegmentedControl", "AXTab", "AXColorWell",
    ]

    public static func recortar(_ s: String, _ n: Int) -> String {
        let limpio = s.replacingOccurrences(of: "\n", with: "⏎ ")
        return limpio.count <= n ? limpio : String(limpio.prefix(n)) + "…"
    }

    /// ¿Se imprime este nodo? Los contenedores mudos no.
    public static func visible(_ n: Nodo) -> Bool {
        if contenedores.contains(n.rol) && (n.etiqueta ?? "").isEmpty && (n.valor ?? "").isEmpty { return false }
        return true
    }

    /// Marcas invisibles de dirección (WhatsApp pone U+200E al inicio de sus etiquetas: «‎Escribir mensaje»).
    static let invisibles: Set<Unicode.Scalar> = Set([0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
                                                     0x2066, 0x2067, 0x2068, 0x2069, 0xFEFF].compactMap(Unicode.Scalar.init))

    /// Forma para comparar una consulta: sin marcas invisibles, minúsculas y NFC.
    public static func comparable(_ s: String) -> String {
        var u = String.UnicodeScalarView()
        u.append(contentsOf: s.precomposedStringWithCanonicalMapping.unicodeScalars.filter { !invisibles.contains($0) })
        return String(u).lowercased()
    }

    /// Texto del árbol. Con `consulta`, solo las líneas que la contienen y sus ancestros.
    public static func texto(_ nodos: [Nodo], consulta: String? = nil) -> String {
        guard let q0 = consulta, !Arbol.comparable(q0).isEmpty else { return nodos.map(\.linea).joined(separator: "\n") }
        let q = Arbol.comparable(q0)
        var conservar = Set<Int>()
        // Pila de ancestros por profundidad: al encontrar una coincidencia, se conservan.
        var pila: [Int] = []
        for (i, n) in nodos.enumerated() {
            while let ult = pila.last, nodos[ult].profundidad >= n.profundidad { pila.removeLast() }
            let hay = [n.etiqueta, n.valor, n.rol].compactMap { $0.map(Arbol.comparable) }.contains { $0.contains(q) }
            if hay { conservar.insert(i); pila.forEach { conservar.insert($0) } }
            pila.append(i)
        }
        return nodos.enumerated().filter { conservar.contains($0.offset) }.map(\.element.linea).joined(separator: "\n")
    }

    /// Diff por ref entre dos observaciones de la misma ventana. Los refs son
    /// estables mientras el elemento viva, así que un cambio de valor se ve como
    /// `~` y no como quitar/poner.
    public static func diff(antes: [Nodo], despues: [Nodo]) -> Diff {
        let a = Dictionary(antes.map { ($0.ref, $0) }, uniquingKeysWith: { x, _ in x })
        let b = Dictionary(despues.map { ($0.ref, $0) }, uniquingKeysWith: { x, _ in x })
        let nuevos = despues.filter { a[$0.ref] == nil }
        let idos = antes.filter { b[$0.ref] == nil }
        let cambiados = despues.filter { n in
            guard let v = a[n.ref] else { return false }
            return v.etiqueta != n.etiqueta || v.valor != n.valor || v.seleccionado != n.seleccionado || v.habilitado != n.habilitado
        }
        return Diff(nuevos: nuevos, idos: idos, cambiados: cambiados)
    }
}

public struct Diff: Equatable {
    public var nuevos: [Nodo]
    public var idos: [Nodo]
    public var cambiados: [Nodo]
    public var vacio: Bool { nuevos.isEmpty && idos.isEmpty && cambiados.isEmpty }
    public var texto: String {
        if vacio { return "(sin cambios)" }
        var l: [String] = []
        l += cambiados.map { "~ " + $0.linea.trimmingCharacters(in: .whitespaces) }
        l += nuevos.map { "+ " + $0.linea.trimmingCharacters(in: .whitespaces) }
        l += idos.map { "- [\($0.ref)] \($0.rolCorto)\(($0.etiqueta ?? "").isEmpty ? "" : " «\(Arbol.recortar($0.etiqueta!, 60))»")" }
        return l.joined(separator: "\n")
    }
}
