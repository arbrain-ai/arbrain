import AppKit
import ApplicationServices
import ManosNucleo

struct ErrorManos: Error, CustomStringConvertible {
    let description: String
    init(_ d: String) { description = d }
}

typealias JSON = [String: Any]

/// Registro de refs de una ventana: el mismo AXUIElement conserva su ref entre
/// observaciones (llave por CFEqual), así el diff es por identidad y un ref
/// recién leído sigue valiendo tras una acción que no lo destruyó.
final class RegistroVentana {
    var porRef: [String: AXUIElement] = [:]
    var porElemento: [LlaveAX: String] = [:]
    var siguiente = 1
    var ultimos: [Nodo] = []

    func ref(de e: AXUIElement) -> String {
        let k = LlaveAX(e: e)
        if let r = porElemento[k] { return r }
        let r = "e\(siguiente)"; siguiente += 1
        porElemento[k] = r; porRef[r] = e
        return r
    }

    var generacion = 0
    var visto: [String: (gen: Int, t: UInt64)] = [:]

    /// Olvida los elementos que llevan varias lecturas sin aparecer (evita crecer sin límite).
    /// Con gracia: si otro agente observa la misma ventana (otra vista, otra poda), los refs que
    /// el primero acaba de leer siguen valiendo. Falla real del 2 oct: refs que caducaban así.
    func podar(vivos: Set<String>, ahora: UInt64 = DispatchTime.now().uptimeNanoseconds) {
        generacion += 1
        for r in vivos { visto[r] = (generacion, ahora) }
        for (r, e) in porRef where !vivos.contains(r) {
            let v = visto[r] ?? (0, 0)
            if generacion - v.gen >= 3, ahora - v.t >= 60_000_000_000 { porRef[r] = nil; porElemento[LlaveAX(e: e)] = nil; visto[r] = nil }
        }
    }
}

final class Motor {
    static let compartido = Motor()
    let cola = DispatchQueue(label: "manos.motor", qos: .userInteractive)

    private var registros: [String: RegistroVentana] = [:]   // "pid:ventana"
    private var menus: [pid_t: [(char: String, mods: Int, e: AXUIElement, titulo: String)]] = [:]
    var modo: String = ProcessInfo.processInfo.environment["MANOS_MODO"] ?? "estandar"

    // MARK: - Resolver objetivo

    func pid(_ a: JSON) throws -> pid_t {
        if let p = a["pid"] as? Int, p > 0 { return pid_t(p) }
        guard let app = (a["app"] as? String)?.trimmingCharacters(in: .whitespaces), !app.isEmpty else { throw ErrorManos("Falta app o pid.") }
        let q = app.lowercased()
        let corriendo = NSWorkspace.shared.runningApplications
        if let r = corriendo.first(where: { $0.bundleIdentifier?.lowercased() == q }) ?? corriendo.first(where: { $0.localizedName?.lowercased() == q }) {
            return r.processIdentifier
        }
        throw ErrorManos("La app «\(app)» no está corriendo. Ábrela con apps({abrir}).")
    }

    /// La ventana pedida por id, o la de más arriba de la app (AXWindows viene de frente a fondo).
    func ventanaAX(_ pid: pid_t, _ id: Int?) throws -> (AXUIElement, CGWindowID) {
        let app = AX.app(pid)
        var vs = AX.ventanas(app)
        if vs.isEmpty {
            // Recién lanzada: la app tarda en publicar su ventana. Reintento corto, no sleep ciego.
            for _ in 0..<40 { usleep(25_000); vs = AX.ventanas(app); if !vs.isEmpty { break } }
        }
        if let id, id > 0 {
            if let v = vs.first(where: { AX.windowID($0) == CGWindowID(id) }) { return (v, CGWindowID(id)) }
            // La app puede estar ocupada (TextEdit autoguarda y nombra el documento) y devolver la lista a medias:
            // reintento corto antes de declarar la ventana cerrada.
            for _ in 0..<30 {
                usleep(50_000)
                if let v = AX.ventanas(app).first(where: { AX.windowID($0) == CGWindowID(id) }) { return (v, CGWindowID(id)) }
            }
            throw ErrorManos("La ventana \(id) no es de la app (pid \(pid)) o ya se cerró. Usa `ventanas`.")
        }
        let visibles = vs.filter { AX.bool(AX.attr($0, kAXMinimizedAttribute)) != true }
        guard let v = visibles.first ?? vs.first else {
            if Permisos.sesionBloqueada() { throw ErrorManos("La sesión de la Mac está bloqueada: la app no responde por accesibilidad hasta desbloquear.") }
            throw ErrorManos("La app (pid \(pid)) no tiene ventanas abiertas.")
        }
        return (v, AX.windowID(v) ?? 0)
    }

    private func registro(_ pid: pid_t, _ w: CGWindowID) -> RegistroVentana {
        let k = "\(pid):\(w)"
        if let r = registros[k] { return r }
        let r = RegistroVentana(); registros[k] = r; return r
    }

    func elemento(_ pid: pid_t, _ w: CGWindowID?, _ ref: String) throws -> AXUIElement {
        if let w, let e = registros["\(pid):\(w)"]?.porRef[ref] { return e }
        // Sin ventana explícita: el ref puede venir de cualquier ventana observada de esa app.
        for (k, r) in registros where k.hasPrefix("\(pid):") { if let e = r.porRef[ref] { return e } }
        throw ErrorManos("Ref \(ref) desconocido o vencido para esa app: vuelve a observar.")
    }

    // MARK: - Observar

    struct Lectura { var nodos: [Nodo]; var total: Int; var truncado: String?; var ms: Double; var podados: Int = 0 }
    static var loteCorto = ProcessInfo.processInfo.environment["MANOS_CASA_LOTE"] != "completo"
    static var podarFuera = ProcessInfo.processInfo.environment["MANOS_CASA_PODAR"] != "0"

    /// Recorre una ventana en profundidad: UN viaje IPC por nodo (lote de atributos).
    func recorrer(_ raiz: AXUIElement, _ reg: RegistroVentana, max: Int, presupuestoMs: Double, conAcciones: Bool = false, corto: Bool = Motor.loteCorto, podar: Bool = Motor.podarFuera) -> Lectura {
        let t0 = DispatchTime.now().uptimeNanoseconds
        let ms = { Double(DispatchTime.now().uptimeNanoseconds - t0) / 1e6 }
        var nodos: [Nodo] = []
        var pila: [(AXUIElement, Int)] = [(raiz, 0)]
        var visitados = 0, podados = 0
        var marcoRaiz: Marco?
        var truncado: String?
        while let (e, prof) = pila.popLast() {
            if nodos.count >= max { truncado = "max_elementos (\(max))"; break }
            if ms() > presupuestoMs { truncado = "tiempo (\(Int(presupuestoMs)) ms)"; break }
            AXUIElementSetMessagingTimeout(e, AX.timeoutLectura)
            var v = AX.lote(e, corto: corto)
            visitados += 1
            guard let rol = v[Attr.rol] as? String else { continue }
            let titulo = AX.texto(v[Attr.titulo]), desc = AX.texto(v[Attr.descripcion])
            var etiqueta = [titulo, desc].compactMap { $0?.isEmpty == false ? $0 : nil }.first
            if etiqueta == nil, let tu = v[Attr.tituloUI], CFGetTypeID(tu) == AXUIElementGetTypeID() {
                // Controles SwiftUI (interruptores de Configuración): el texto vive en una etiqueta hermana.
                let el = tu as! AXUIElement
                etiqueta = AX.string(el, kAXValueAttribute) ?? AX.string(el, kAXTitleAttribute)
            }
            if corto, etiqueta == nil, Arbol.interactivos.contains(rol) {
                // Solo aquí se paga el segundo viaje: controles sin etiqueta.
                let extra = AX.loteDe(e, [kAXPlaceholderValueAttribute, "AXHelp"])
                v[Attr.placeholder] = extra[0]; v[Attr.ayuda] = extra[1]
            }
            if etiqueta == nil, let ph = AX.texto(v[Attr.placeholder]), !ph.isEmpty { etiqueta = ph }
            if etiqueta == nil, let ay = AX.texto(v[Attr.ayuda]), !ay.isEmpty, Arbol.interactivos.contains(rol) { etiqueta = ay }
            var valor = AX.texto(v[Attr.valor])
            if rol == "AXStaticText", etiqueta == nil, let val = valor { etiqueta = val; valor = nil }
            var marco: Marco?
            if let p = AX.punto(v[Attr.posicion]), let s = AX.tamano(v[Attr.tamano]) { marco = Marco(x: p.x, y: p.y, w: s.width, h: s.height) }
            var n = Nodo(ref: reg.ref(de: e), rol: rol, subrol: AX.texto(v[Attr.subrol]), etiqueta: etiqueta, valor: valor,
                         habilitado: AX.bool(v[Attr.habilitado]), seleccionado: AX.bool(v[Attr.seleccionado]), marco: marco, profundidad: prof)
            if conAcciones, Arbol.interactivos.contains(rol) { n.acciones = AX.acciones(e) }
            let mostrar = Arbol.visible(n)
            if mostrar { nodos.append(n) }
            var hijos = AX.elementos(v[Attr.hijos])
            // Poda: un subárbol cuyo marco no toca la ventana no se ve (filas desplazadas fuera).
            // Para verlo, el modelo hace scroll y vuelve a observar.
            if podar, let m = marco, let vm = marcoRaiz, m.w > 0, m.h > 0, prof > 0,
               m.x > vm.x + vm.w || m.x + m.w < vm.x || m.y > vm.y + vm.h || m.y + m.h < vm.y {
                podados += 1; hijos = []
                if mostrar { nodos.removeLast() }
            }
            if prof == 0, marcoRaiz == nil { marcoRaiz = marco }
            let profHijos = mostrar ? prof + 1 : prof
            for h in hijos.reversed() { pila.append((h, profHijos)) }
        }
        if truncado == nil, !pila.isEmpty { truncado = "incompleto" }
        return Lectura(nodos: nodos, total: visitados + pila.count, truncado: truncado, ms: ms(), podados: podados)
    }

    func observar(_ a: JSON) throws -> JSON {
        let pid = try pid(a)
        let web = Web.asegurar(pid)
        // `raiz_app`: apps sin ventanas (el Dock, la barra de menús) se leen desde la raíz de la app.
        let (v, wid) = a["raiz_app"] as? Bool == true ? (AX.app(pid), CGWindowID(0)) : try ventanaAX(pid, a["ventana"] as? Int)
        if web.recien { Web.esperarContenido(v) }
        Asentador.compartido.vigilar(pid)
        let reg = registro(pid, wid)
        let max = (a["max_elementos"] as? Int) ?? 800
        let presupuesto = Double((a["tiempo_max_ms"] as? Int) ?? 4000)
        let previos = reg.ultimos
        let l = recorrer(v, reg, max: max, presupuestoMs: presupuesto, conAcciones: a["acciones"] as? Bool ?? false,
                         corto: (a["lote"] as? String).map { $0 != "completo" } ?? Motor.loteCorto, podar: a["raiz_app"] as? Bool == true ? false : (a["podar"] as? Bool ?? Motor.podarFuera))
        if l.truncado == nil { reg.podar(vivos: Set(l.nodos.map(\.ref))) }
        reg.ultimos = l.nodos
        let consulta = a["consulta"] as? String
        var r: JSON = [
            "app": NSRunningApplication(processIdentifier: pid)?.localizedName ?? "\(pid)", "pid": Int(pid), "ventana": Int(wid),
            "titulo": AX.string(v, kAXTitleAttribute) ?? "", "texto": Arbol.texto(l.nodos, consulta: consulta),
            "elementos": l.nodos.map(aJSON), "total_elementos": l.total, "ms": l.ms, "podados": l.podados,
        ]
        if let t = l.truncado { r["aviso"] = "árbol truncado: \(t)" }
        if web.via != "no-aplica" {
            r["web"] = web.via
            if let area = Web.areaWeb(v), let u = Web.url(area) { r["url"] = u }
        }
        if !previos.isEmpty { r["cambios"] = Arbol.diff(antes: previos, despues: l.nodos).texto }
        if a["captura"] as? Bool == true, let ruta = a["captura_ruta"] as? String {
            if let err = Captura.ventana(wid, ruta) { r["aviso_captura"] = err } else { r["captura"] = ruta }
        }
        if (l.nodos.count < 3 && a["ocr"] as? Bool != false) || a["ocr"] as? Bool == true {
            // Árbol vacío (canvas, juegos, apps sin AX): ojos de reserva con el OCR del sistema.
            if let texto = Captura.ocr(wid), !texto.isEmpty { r["ocr"] = texto; r["texto"] = (r["texto"] as! String) + "\n[ocr]\n" + texto }
        }
        if let c = l.nodos.first?.marco { Fantasma.compartido.mirar(Marco(x: c.x, y: c.y, w: c.w, h: c.h), ventana: wid) }
        return r
    }

    func aJSON(_ n: Nodo) -> JSON {
        var j: JSON = ["ref": n.ref, "rol": n.rol, "profundidad": n.profundidad]
        if let s = n.subrol { j["subrol"] = s }
        if let e = n.etiqueta { j["etiqueta"] = e }
        if let v = n.valor { j["valor"] = v }
        if let h = n.habilitado { j["habilitado"] = h }
        if let s = n.seleccionado { j["seleccionado"] = s }
        if let m = n.marco { j["marco"] = ["x": m.x, "y": m.y, "w": m.w, "h": m.h] }
        if let ac = n.acciones { j["acciones"] = ac }
        return j
    }

    // MARK: - Actuar

    func actuar(_ a: JSON) throws -> JSON {
        let pid = try pid(a)
        let accion = a["accion"] as? String ?? ""
        let wid = (a["ventana"] as? Int).map { CGWindowID($0) }
        let ref = a["ref"] as? String
        Web.asegurar(pid)
        let e = try ref.map { try elemento(pid, wid, $0) }
        let modo = a["modo"] as? String ?? self.modo
        if modo == "acotado", let e, Peligro.esPeligrosa(etiquetaDe(e)) {
            throw ErrorManos("Modo acotado: «\(etiquetaDe(e) ?? "")» parece enviar/borrar/pagar/publicar y requiere confirmación humana.")
        }
        Asentador.compartido.vigilar(pid)
        let frente = NSWorkspace.shared.frontmostApplication?.processIdentifier
        let hid = a["via"] as? String == "hid"
        if !hid, let e, let m = AX.marco(e) {
            let w = wid ?? ventanaDe(pid, e, nil).flatMap(AX.windowID)
            if accion == "escribir" { Fantasma.compartido.posar(m, ventana: w) } else { Fantasma.compartido.clic(m, accion: accion, ventana: w) }
        }
        let marca = Asentador.compartido.marca(pid)
        let t0 = DispatchTime.now().uptimeNanoseconds
        // Último recurso del contrato: traer la ventana un instante (apps que filtran eventos por proceso).
        let primerPlano = a["primer_plano"] as? Bool == true
        if primerPlano, let objetivo = NSRunningApplication(processIdentifier: pid) {
            objetivo.activate(options: [])
            if let (v, _) = try? ventanaAX(pid, wid.map { Int($0) }) { AXUIElementPerformAction(v, kAXRaiseAction as CFString) }
            for _ in 0..<20 where NSWorkspace.shared.frontmostApplication?.processIdentifier != pid { usleep(10_000) }
        }
        defer { if primerPlano, let f = frente, f != pid { NSRunningApplication(processIdentifier: f)?.activate(options: []) } }
        var r: JSON
        if hid {
            // Último recurso (cada quien su cursor): la mano real solo con el permiso de TS y Daniel quieto AHORA.
            try Vigia.autorizar(a)
            r = try actuarConMano(pid, e, accion, a, ventana: wid)
            r["accion_ms"] = Double(DispatchTime.now().uptimeNanoseconds - t0) / 1e6
            r["via"] = "hid"
            return r
        }
        switch accion {
        case "click": guard let e else { throw ErrorManos("click necesita ref (el contrato no expone coordenadas).") }; r = try clic(pid, e)
        case "escribir": r = try escribir(pid, e, a["texto"] as? String ?? "", visible: a["visible"] as? Bool ?? Motor.modoDemo, ventana: wid, portapapeles: a["portapapeles"] as? Bool ?? true)
        case "tecla": r = try tecla(pid, e, a["tecla"] as? String ?? "", a["modificadores"] as? [String] ?? [], ventana: wid)
        case "scroll": r = try desplazar(pid, e, a["direccion"] as? String ?? "abajo", a["cantidad"] as? Int ?? 3)
        case "valor": guard let e else { throw ErrorManos("valor necesita ref.") }; r = try ponerValor(pid, e, a["valor"] as? String ?? "")
        default: throw ErrorManos("Acción desconocida: \(accion)")
        }
        let accionMs = Double(DispatchTime.now().uptimeNanoseconds - t0) / 1e6
        // Asentar por eventos AX (no sleep). `asentar:false` lo salta para el que mide por su cuenta.
        if a["asentar"] as? Bool != false {
            let s = Asentador.compartido.esperar(pid, desde: marca)
            r["asentar_ms"] = s.ms; r["eventos"] = s.eventos
            if s.eventos > 0, (r["detalle"] as? String)?.isEmpty != false { r["detalle"] = "la app reaccionó (\(s.eventos) eventos AX)" }
        }
        r["accion_ms"] = accionMs
        r["frente_restaurado"] = protegerFrente(antes: frente, objetivo: pid)
        return r
    }

    func etiquetaDe(_ e: AXUIElement) -> String? {
        let v = AX.lote(e)
        return [AX.texto(v[Attr.titulo]), AX.texto(v[Attr.descripcion]), AX.texto(v[Attr.valor])].compactMap { $0?.isEmpty == false ? $0 : nil }.first
    }

    /// Si la app objetivo se trajo al frente sola (System Settings lo hace al lanzarse), se le devuelve el frente a quien lo tenía.
    @discardableResult
    func protegerFrente(antes: pid_t?, objetivo: pid_t) -> Bool {
        guard let antes, antes != objetivo else { return false }
        guard let ahora = NSWorkspace.shared.frontmostApplication?.processIdentifier, ahora == objetivo else { return false }
        NSRunningApplication(processIdentifier: antes)?.activate(options: [])
        return true
    }

    private func efecto(_ ok: Bool, confirmado: Bool, _ detalle: String) -> JSON {
        ["ok": ok, "efecto": ok ? (confirmado ? "confirmado" : "sin_verificar") : "fallo", "detalle": detalle]
    }

    func clic(_ pid: pid_t, _ e: AXUIElement) throws -> JSON {
        AXUIElementSetMessagingTimeout(e, 0.6)
        let v = AX.lote(e)
        let rol = v[Attr.rol] as? String ?? ""
        if AX.bool(v[Attr.habilitado]) == false { return efecto(false, confirmado: false, "el elemento está inactivo") }
        let valorAntes = AX.texto(v[Attr.valor])
        let acciones = AX.acciones(e)
        var hecho: String?
        if acciones.contains(kAXPressAction as String) {
            let err = AXUIElementPerformAction(e, kAXPressAction as CFString)
            // cannotComplete en un botón que abre un modal: la acción sí ocurrió, la app quedó ocupada.
            if err == .success || err == .cannotComplete { hecho = "AXPress" + (err == .cannotComplete ? " (la app quedó ocupada: ¿modal?)" : "") }
            else if err == .invalidUIElement { throw ErrorManos(AX.nombreError(err)) }
        }
        if hecho == nil, let alt = ["AXConfirm", "AXPick", "AXOpen"].first(where: { acciones.contains($0) }) {
            if AXUIElementPerformAction(e, alt as CFString) == .success { hecho = alt }
        }
        if hecho == nil, ["AXRow", "AXCell", "AXOutlineRow", "AXStaticText", "AXImage"].contains(rol) || rol.hasSuffix("Row") {
            // Filas de listas y barras laterales: seleccionar es su «clic» (mina de Cua: Finder rechaza AXPress).
            var objetivo: AXUIElement? = e
            for _ in 0..<3 {
                guard let o = objetivo else { break }
                var settable = DarwinBoolean(false)
                if AXUIElementIsAttributeSettable(o, kAXSelectedAttribute as CFString, &settable) == .success, settable.boolValue,
                   AXUIElementSetAttributeValue(o, kAXSelectedAttribute as CFString, kCFBooleanTrue) == .success {
                    let leido = AX.bool(AX.attr(o, kAXSelectedAttribute)) == true
                    return efecto(true, confirmado: leido, leido ? "seleccionado (leído de vuelta)" : "seleccionado")
                }
                objetivo = AX.attr(o, kAXParentAttribute).flatMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil }
            }
        }
        if hecho == nil {
            // Ancestro que sí se presiona (etiquetas o imágenes dentro de un botón).
            var p = AX.attr(e, kAXParentAttribute)
            for _ in 0..<3 {
                guard let pv = p, CFGetTypeID(pv) == AXUIElementGetTypeID() else { break }
                let pe = pv as! AXUIElement
                if AX.acciones(pe).contains(kAXPressAction as String), AXUIElementPerformAction(pe, kAXPressAction as CFString) == .success { hecho = "AXPress (ancestro)"; break }
                p = AX.attr(pe, kAXParentAttribute)
            }
        }
        if hecho == nil, ProcessInfo.processInfo.environment["MANOS_CASA_PUNTERO"] == "1", let m = AX.marco(e) {
            // Reserva detrás de interruptor: evento de ratón por proceso (no mueve el cursor real).
            Puntero.clic(pid: pid, en: CGPoint(x: m.x + m.w / 2, y: m.y + m.h / 2))
            hecho = "puntero por proceso"
        }
        guard let hecho else { return efecto(false, confirmado: false, "\(rol) no admite clic por accesibilidad (acciones: \(acciones.joined(separator: ","))). Prueba `valor`, una tecla o primer_plano.") }
        // Lectura de vuelta para casillas e interruptores: el cambio de valor confirma.
        if ["AXCheckBox", "AXRadioButton", "AXSwitch"].contains(rol) || (v[Attr.subrol] as? String) == "AXSwitch" {
            for _ in 0..<30 {
                let ahora = AX.string(e, kAXValueAttribute)
                if ahora != valorAntes { return efecto(true, confirmado: true, "\(hecho): valor \(valorAntes ?? "?") → \(ahora ?? "?")") }
                usleep(5000)
            }
            return efecto(true, confirmado: false, "\(hecho): el valor no cambió aún")
        }
        return efecto(true, confirmado: false, hecho)
    }

    static let rolesTexto: Set<String> = ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"]
    /// Modo de escritura visible por defecto (grabaciones, masterclass). Sin él, el texto entra de golpe.
    static let modoDemo = ProcessInfo.processInfo.environment["MANOS_MODO_DEMO"] == "1"
    static let appsChat: Set<String> = ["net.whatsapp.whatsapp", "com.apple.mobilesms", "com.tinyspeck.slackmacgap", "com.hnc.discord", "ru.keepcoder.telegram"]

    /// Campos que ignoran un valor puesto de golpe: páginas web (React y compañía no ven el cambio), autocompletados
    /// y chats. Ahí se escriben teclas reales aunque no esté el modo demo.
    func pideTeclas(_ pid: pid_t, _ e: AXUIElement, rol: String) -> Bool {
        if rol == "AXComboBox" { return true }
        if Motor.appsChat.contains(NSRunningApplication(processIdentifier: pid)?.bundleIdentifier?.lowercased() ?? "") { return true }
        var p = AX.attr(e, kAXParentAttribute)
        for _ in 0..<20 {
            guard let pv = p, CFGetTypeID(pv) == AXUIElementGetTypeID() else { break }
            let r = AX.string(pv as! AXUIElement, kAXRoleAttribute)
            if r == "AXWebArea" { return true }
            if r == "AXWindow" { break }
            p = AX.attr(pv as! AXUIElement, kAXParentAttribute)
        }
        return false
    }

    /// Teclas reales al proceso, letra por letra (visible) o en trozos (rápido). Enfoca el campo antes.
    func teclear(_ pid: pid_t, _ e: AXUIElement, _ texto: String, visible: Bool) {
        AXUIElementSetAttributeValue(e, kAXFocusedAttribute as CFString, kCFBooleanTrue)
        guard visible else { Teclado.escribir(pid: pid, texto); return }
        for c in texto {
            Teclado.escribir(pid: pid, String(c))
            usleep(useconds_t(Trayectoria.pausaLetraMs(c, azar: Double.random(in: 0...1)) * 1000))
        }
    }

    /// Pone el foco de teclado en el campo y lo CONFIRMA leyendo AXFocused (falla real del 2 oct: el clic en la caja
    /// de WhatsApp no dejaba el foco y el texto se perdía). Si la app está de fondo, activa su ventana sin levantarla.
    @discardableResult
    func enfocar(_ pid: pid_t, _ e: AXUIElement, ventana: CGWindowID?, activar: Bool = true) -> Bool {
        // Manda el elemento enfocado DE LA APP; AXFocused del campo miente en apps Catalyst (WhatsApp lo reporta
        // true con el foco en otro grupo: falla real del 2 oct, 21:29, las teclas se perdían con «foco» confirmado).
        func listo() -> Bool {
            if let f = enfocado(pid) { return CFEqual(f, e) }
            return AX.bool(AX.attr(e, kAXFocusedAttribute)) == true
        }
        if listo() { return true }
        AXUIElementSetAttributeValue(e, kAXFocusedAttribute as CFString, kCFBooleanTrue)
        for _ in 0..<6 { if listo() { return true }; usleep(15_000) }
        // Sin activar: solo el foco AX dentro de la app (no toca el foco de teclado de la sesión, que es de Daniel).
        guard activar else { return false }
        let w = ventana ?? ventanaDe(pid, e, nil).flatMap(AX.windowID)
        if let w, NSWorkspace.shared.frontmostApplication?.processIdentifier != pid { Cielo.activarSinLevantar(pid: pid, ventana: w); usleep(50_000) }
        AXUIElementSetAttributeValue(e, kAXFocusedAttribute as CFString, kCFBooleanTrue)
        for _ in 0..<10 { if listo() { return true }; usleep(20_000) }
        // Último recurso sin mover el cursor real: un clic por SkyLight dentro del campo (como tocarlo con el dedo).
        if let w, let m = AX.marco(e), let v = try? Pluma.ventana(pid, Int(w)) {
            let local = CGPoint(x: m.x + min(m.w / 2, 40) - v.marco.minX, y: m.y + m.h / 2 - v.marco.minY)
            let g = Pluma.Gesto(pid: pid, v: v, via: "fondo", flags: [])
            g.devolver = false
            g.raton(.mouseMoved, local: local)
            usleep(12_000)
            g.raton(.leftMouseDown, local: local, presion: 1)
            usleep(30_000)
            g.raton(.leftMouseUp, local: local)
            for _ in 0..<15 { if listo() { return true }; usleep(20_000) }
        }
        return false
    }

    /// Toque de fondo (SkyLight) dentro de un campo: activa su ventana sin levantarla y lo hace primer respondedor.
    func tocarFondo(_ pid: pid_t, _ e: AXUIElement, ventana w: CGWindowID) {
        guard let m = AX.marco(e), let v = try? Pluma.ventana(pid, Int(w)) else { return }
        let local = CGPoint(x: m.x + min(m.w / 2, 40) - v.marco.minX, y: m.y + m.h / 2 - v.marco.minY)
        let g = Pluma.Gesto(pid: pid, v: v, via: "fondo", flags: [])
        g.raton(.mouseMoved, local: local)
        usleep(12_000)
        g.raton(.leftMouseDown, local: local, presion: 1)
        usleep(30_000)
        g.raton(.leftMouseUp, local: local)
        usleep(60_000)
    }

    /// Escribir que ENTRA a la primera y se comprueba leyendo el valor de vuelta. Cascada, cada vía verificada:
    ///   foco confirmado → teclas (chats, web, autocompletados, o letra por letra en modo visible)
    ///   → AXSelectedText → AXValue → pegar (⌘V por menú, portapapeles de Daniel restaurado).
    /// Si nada entra devuelve `fallo` (nunca `sin_verificar` para seguir como si nada). Si el valor cambió a medias,
    /// se detiene para no duplicar. Solo si el campo no deja leer su valor se reporta `sin_verificar`, con el motivo.
    func escribir(_ pid: pid_t, _ e0: AXUIElement?, _ texto: String, visible: Bool = false, hid: Bool = false, ventana: CGWindowID? = nil, portapapeles: Bool = true) throws -> JSON {
        guard !texto.isEmpty else { throw ErrorManos("escribir necesita texto.") }
        guard let e = e0 ?? enfocado(pid) else {
            if !hid, NSWorkspace.shared.frontmostApplication?.processIdentifier == pid {
                throw ErrorManos("escribir sin ref en la app que la persona tiene al frente iría a SU cursor de texto: pasa la ref del campo.")
            }
            if hid { try Mano.teclear(texto) } else { Teclado.escribir(pid: pid, texto) }
            return efecto(true, confirmado: false, "tecleado sin un campo identificado: no hay valor que leer de vuelta (pasa ref)")
        }
        AXUIElementSetMessagingTimeout(e, 0.8)
        let rol = AX.string(e, kAXRoleAttribute) ?? ""
        let leible = AX.attr(e, kAXValueAttribute) != nil || Motor.rolesTexto.contains(rol)
        let leer = { AX.string(e, kAXValueAttribute) ?? "" }
        let antes = leer()
        var intentos: [String] = []
        // El foco AX de un campo de la app que Daniel tiene al frente es SU cursor de texto: solo en una pausa suya.
        let alFrenteDeLaPersona = NSWorkspace.shared.frontmostApplication?.processIdentifier == pid && !hid
        let foco = alFrenteDeLaPersona && !Foco.esperarPausa() ? false : enfocar(pid, e, ventana: ventana, activar: false)
        func entro(_ espera: Int = 16) -> Bool {
            for _ in 0..<espera { if Escritura.entro(antes: antes, despues: leer(), texto: texto) { return true }; usleep(25_000) }
            return false
        }
        func aMedias() -> Bool { Escritura.normalizar(leer()) != Escritura.normalizar(antes) }
        func listo(_ via: String) -> JSON {
            var r = efecto(true, confirmado: true, "\(via); leído de vuelta" + (intentos.isEmpty ? "" : " (antes falló: \(intentos.joined(separator: ", ")))"))
            r["via_escritura"] = via; r["foco"] = foco
            return r
        }
        func medias() -> JSON {
            ["ok": false, "efecto": "fallo", "foco": foco, "detalle": "el campo cambió pero no quedó el texto pedido (entró a medias); me detengo para no duplicar. Intentos: \(intentos.joined(separator: ", "))"]
        }
        // Un solo foco de teclado por sesión (Foco.swift): las vías que necesitan que la app sea la activa solo se usan
        // con el foco PRESTADO en una pausa del teclado de Daniel, y se devuelve al terminar. Nunca HID sin permiso.
        let w = ventana ?? ventanaDe(pid, e, nil).flatMap(AX.windowID)
        let enFrente = NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
        let quiereTeclas = visible || pideTeclas(pid, e, rol: rol)
        var tecleoPersona = false
        func prestado(_ como: String, _ f: () -> Bool) -> Bool {
            guard let w else { intentos.append("\(como): sin ventana"); return false }
            guard let (ok, tecleo) = Foco.prestado(pid: pid, ventana: w, f) else { intentos.append("\(como): no se prestó el foco (La persona tecleaba)"); return false }
            tecleoPersona = tecleoPersona || tecleo
            return ok
        }
        func listoPrestado(_ via: String) -> JSON {
            var r = listo(via); r["foco_prestado"] = true
            if tecleoPersona { r["aviso"] = "La persona tecleó durante el préstamo del foco: alguna tecla suya pudo ir a esta app." }
            return r
        }
        if hid {
            // 1. La mano real (último recurso, ya autorizado por Vigia.autorizar).
            try Mano.teclear(texto)
            if entro(24) { return listo("tecleado por la mano real (HID)") }
            intentos.append("mano HID"); if aMedias() { return medias() }
        } else if quiereTeclas {
            // 1. Teclas al proceso SIN activar la app, solo con el foco AX del campo confirmado (si no, caerían en otro
            //    campo de la app). Apps nativas y Electron suelen aceptarlas así.
            if foco {
                teclear(pid, e, texto, visible: visible)
                if entro() { return listo(visible ? "tecleado letra por letra por proceso, sin activar la app" : "teclas por proceso, sin activar la app") }
                intentos.append("teclas por proceso sin activar"); if aMedias() { return medias() }
            }
            // 2. Apps que exigen ser la activa (Catalyst como WhatsApp, Chrome): foco prestado sin levantar la ventana.
            if !enFrente {
                let ok = prestado("teclas con foco prestado") {
                    tocarFondo(pid, e, ventana: w!)
                    enfocar(pid, e, ventana: w, activar: false)
                    teclear(pid, e, texto, visible: visible)
                    return entro()
                }
                if ok { return listoPrestado(visible ? "tecleado letra por letra con el foco prestado" : "teclas con el foco prestado (devuelto)") }
                if aMedias() { return medias() }
            }
        }
        // 3. Insertar en la selección: atómico, sin teclas ni foco.
        var settable = DarwinBoolean(false)
        if !hid, AXUIElementIsAttributeSettable(e, kAXSelectedTextAttribute as CFString, &settable) == .success, settable.boolValue {
            if AXUIElementSetAttributeValue(e, kAXSelectedTextAttribute as CFString, texto as CFString) == .success, entro(8) { return listo("insertado por AXSelectedText") }
            intentos.append("AXSelectedText"); if aMedias() { return medias() }
        }
        // 4. Poner el valor completo (campos nativos que no aceptan la selección). Nunca en chats.
        if !hid, Motor.rolesTexto.contains(rol), !Motor.appsChat.contains(NSRunningApplication(processIdentifier: pid)?.bundleIdentifier?.lowercased() ?? ""),
           AXUIElementIsAttributeSettable(e, kAXValueAttribute as CFString, &settable) == .success, settable.boolValue {
            if AXUIElementSetAttributeValue(e, kAXValueAttribute as CFString, (antes + texto) as CFString) == .success, entro(8) { return listo("escrito por AXValue") }
            intentos.append("AXValue"); if aMedias() { return medias() }
        }
        // 5. Pegar: ÚLTIMO recurso (un solo portapapeles por sesión). Apagable con `portapapeles: false`; con el foco
        //    prestado en una pausa de Daniel; se devuelve su contenido salvo que él haya copiado algo después.
        if !hid, portapapeles {
            var pegado = false
            let ok = prestado("pegar") {
                guard (try? Portapapeles.escribir(["texto": texto])) != nil else { return false }
                pegado = true
                enfocar(pid, e, ventana: w, activar: false)
                _ = try? tecla(pid, e, "v", ["cmd"], ventana: w)
                let entroYa = entro(20)
                usleep(250_000)
                _ = Portapapeles.restaurar()
                return entroYa
            }
            if ok { return listoPrestado("pegado (⌘V con el foco prestado; portapapeles de la persona restaurado)") }
            if pegado { intentos.append("pegar") }
        } else if !hid { intentos.append("pegar desactivado (portapapeles: false)") }
        if !leible { return ["ok": true, "efecto": "sin_verificar", "foco": foco, "detalle": "el campo (\(rol)) no publica su valor: se escribió pero no hay lectura de vuelta posible; compruébalo con ojos"] }
        return ["ok": false, "efecto": "fallo", "foco": foco, "detalle": "el texto NO entró (valor leído de vuelta sin cambios). Intentos: \(intentos.joined(separator: ", ")). Por fondo no alcanzó: reintenta cuando la persona haga una pausa, pide «quiero verte» (ventana al frente con el Halo) o, solo con su cita explícita o su inactividad, `via: hid`."]
    }

    /// Un paso con la mano real (HID): la app al frente, el cursor viaja con el modelo humano y aprieta o teclea.
    func actuarConMano(_ pid: pid_t, _ e: AXUIElement?, _ accion: String, _ a: JSON, ventana wid: CGWindowID?) throws -> JSON {
        let vax = ventanaDe(pid, e, wid) ?? (try? ventanaAX(pid, wid.map { Int($0) }))?.0
        let id = wid ?? vax.flatMap(AX.windowID)
        Mano.alFrente(pid: pid, ventana: vax, id: id)
        let centro: CGPoint? = e.flatMap(AX.marco).map { CGPoint(x: $0.x + $0.w / 2, y: $0.y + $0.h / 2) }
        let marca = Asentador.compartido.marca(pid)
        switch accion {
        case "click":
            guard let e, let c = centro else { throw ErrorManos("click necesita ref.") }
            let valorAntes = AX.string(e, kAXValueAttribute)
            if let id { try Mano.asegurarArriba(pid: pid, ventana: id, punto: c) }
            try Mano.llevar(a: c, ventana: id)
            try Mano.clic(en: c, ventana: id)
            let s = Asentador.compartido.esperar(pid, desde: marca)
            let valor = AX.string(e, kAXValueAttribute)
            var r = efecto(true, confirmado: valor != valorAntes && valorAntes != nil, "clic de la mano real (HID) en el centro; \(s.eventos) eventos AX")
            r["eventos"] = s.eventos
            return r
        case "escribir":
            let texto = a["texto"] as? String ?? ""
            if let e, let m = AX.marco(e) {
                // Clic dentro del campo (como una persona), foco confirmado y teclas de la mano real.
                let p = CGPoint(x: m.x + min(m.w / 2, 40), y: m.y + m.h / 2)
                if let id { try Mano.asegurarArriba(pid: pid, ventana: id, punto: p) }
                try Mano.llevar(a: p, ventana: id)
                try Mano.clic(en: p, ventana: id)
                usleep(120_000)
            }
            return try escribir(pid, e, texto, visible: true, hid: true, ventana: id)
        case "tecla":
            let t = (a["tecla"] as? String ?? "").lowercased()
            guard let codigo = Teclas.codigo(t) else { throw ErrorManos("Tecla desconocida: \(t)") }
            if let c = centro { try Mano.llevar(a: c, ventana: id) }
            if let e { enfocar(pid, e, ventana: id) }
            Mano.tecla(codigo, flags: Teclas.flags(a["modificadores"] as? [String] ?? []))
            let s = Asentador.compartido.esperar(pid, desde: marca)
            return efecto(true, confirmado: false, "tecla «\(t)» con el teclado real (HID); \(s.eventos) eventos AX")
        case "scroll":
            let c = centro ?? vax.flatMap(AX.marco).map { CGPoint(x: $0.x + $0.w / 2, y: $0.y + $0.h / 2) } ?? Mano.posicion
            try Mano.llevar(a: c, ventana: id)
            let n = (a["cantidad"] as? Int) ?? 3, dir = a["direccion"] as? String ?? "abajo"
            let px = Int32(n * 120)
            Mano.rueda(dy: dir == "abajo" ? px : dir == "arriba" ? -px : 0, dx: dir == "derecha" ? px : dir == "izquierda" ? -px : 0, pasos: 10)
            return efecto(true, confirmado: false, "rueda de la mano real (HID)")
        case "valor":
            guard let e else { throw ErrorManos("valor necesita ref.") }
            if let c = centro { try Mano.llevar(a: c, ventana: id); Fantasma.compartido.seguir(x: c.x, y: c.y, ventana: id, pulso: true) }
            return try ponerValor(pid, e, a["valor"] as? String ?? "")
        default: throw ErrorManos("Acción desconocida: \(accion)")
        }
    }

    func enfocado(_ pid: pid_t) -> AXUIElement? {
        guard let v = AX.attr(AX.app(pid), kAXFocusedUIElementAttribute), CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }
        return (v as! AXUIElement)
    }

    /// La ventana AX a la que pertenece un elemento, o la pedida por id.
    func ventanaDe(_ pid: pid_t, _ e: AXUIElement?, _ id: CGWindowID?) -> AXUIElement? {
        if let e, let w = AX.attr(e, kAXWindowAttribute), CFGetTypeID(w) == AXUIElementGetTypeID() { return (w as! AXUIElement) }
        if let id, let (v, _) = try? ventanaAX(pid, Int(id)) { return v }
        return nil
    }

    func tecla(_ pid: pid_t, _ e: AXUIElement?, _ tecla: String, _ mods: [String], ventana: CGWindowID? = nil) throws -> JSON {
        guard !tecla.isEmpty else { throw ErrorManos("tecla necesita tecla.") }
        let t = tecla.lowercased()
        let m = Set(mods.map { $0.lowercased() })
        // Atajos de menú: se presiona el ítem del menú por AX. No necesita foco ni frente.
        if m.contains("cmd") || m.contains("command") {
            // ⌘W: el ítem «Cerrar» se desactiva cuando la app no tiene ventana clave (segundo plano).
            // El botón de cierre de la ventana sí se presiona por AX sin foco.
            if t == "w", Teclas.modificadoresMenu(mods) == 0, let v = ventanaDe(pid, e, ventana),
               let b = AX.attr(v, kAXCloseButtonAttribute), CFGetTypeID(b) == AXUIElementGetTypeID(),
               AXUIElementPerformAction(b as! AXUIElement, kAXPressAction as CFString) == .success {
                return efecto(true, confirmado: false, "⌘W → botón de cierre de la ventana por AX")
            }
            if let item = itemMenu(pid, t, Teclas.modificadoresMenu(mods)) {
                if AX.bool(AX.attr(item.e, kAXEnabledAttribute)) == false { return efecto(false, confirmado: false, "el menú «\(item.titulo)» está inactivo") }
                let err = AXUIElementPerformAction(item.e, kAXPressAction as CFString)
                if err == .success || err == .cannotComplete { return efecto(true, confirmado: false, "menú «\(item.titulo)» por AX") }
                menus[pid] = nil
            }
        }
        // Return/Escape sin ref: el botón por defecto o de cancelar de la hoja o ventana al frente de la app.
        if mods.isEmpty, e == nil, ["return", "enter", "escape", "esc"].contains(t) {
            let attr = (t == "return" || t == "enter") ? kAXDefaultButtonAttribute : kAXCancelButtonAttribute
            for v in candidatasBoton(pid) {
                if let b = AX.attr(v, attr as String), CFGetTypeID(b) == AXUIElementGetTypeID() {
                    if AXUIElementPerformAction(b as! AXUIElement, kAXPressAction as CFString) == .success {
                        return efecto(true, confirmado: false, "\(t) → botón «\(AX.string(b as! AXUIElement, kAXTitleAttribute) ?? "")» por AX")
                    }
                }
            }
        }
        guard let codigo = Teclas.codigo(t) else {
            if t.count == 1 { Teclado.escribir(pid: pid, tecla); return efecto(true, confirmado: false, "carácter por proceso") }
            throw ErrorManos("Tecla desconocida: \(tecla)")
        }
        if let e { AXUIElementSetAttributeValue(e, kAXFocusedAttribute as CFString, kCFBooleanTrue) }
        Teclado.tecla(pid: pid, codigo: codigo, flags: Teclas.flags(mods))
        return efecto(true, confirmado: false, "tecla por proceso")
    }

    /// Hojas primero (un diálogo de «guardar» vive como hoja de la ventana), luego ventanas.
    func candidatasBoton(_ pid: pid_t) -> [AXUIElement] {
        let vs = AX.ventanas(AX.app(pid))
        var r: [AXUIElement] = []
        for v in vs { r += AX.elementos(AX.attr(v, kAXChildrenAttribute)).filter { AX.string($0, kAXRoleAttribute) == "AXSheet" } }
        return r + vs
    }

    func itemMenu(_ pid: pid_t, _ char: String, _ mods: Int) -> (e: AXUIElement, titulo: String)? {
        if menus[pid] == nil { menus[pid] = indexarMenu(pid) }
        return menus[pid]?.first(where: { $0.char.lowercased() == char && $0.mods == mods }).map { ($0.e, $0.titulo) }
    }

    /// Índice de atajos del menú de la app: título, carácter y modificadores de cada ítem (lectura en lote).
    func indexarMenu(_ pid: pid_t) -> [(char: String, mods: Int, e: AXUIElement, titulo: String)] {
        guard let barra = AX.attr(AX.app(pid), kAXMenuBarAttribute), CFGetTypeID(barra) == AXUIElementGetTypeID() else { return [] }
        let atributos = [kAXRoleAttribute, kAXTitleAttribute, kAXMenuItemCmdCharAttribute, kAXMenuItemCmdModifiersAttribute, kAXChildrenAttribute] as CFArray
        var r: [(String, Int, AXUIElement, String)] = []
        var pila: [(AXUIElement, Int)] = [(barra as! AXUIElement, 0)]
        while let (e, prof) = pila.popLast(), r.count < 2000 {
            var vals: CFArray?
            guard AXUIElementCopyMultipleAttributeValues(e, atributos, AXCopyMultipleAttributeOptions(rawValue: 0), &vals) == .success, let v = vals as [AnyObject]? else { continue }
            let limpio: (Int) -> AnyObject? = { i in
                let x = v[i]; if CFGetTypeID(x) == AXValueGetTypeID(), AXValueGetType(x as! AXValue) == .axError { return nil }; return x
            }
            if let c = limpio(2) as? String, !c.isEmpty {
                r.append((c, (limpio(3) as? NSNumber)?.intValue ?? 0, e, (limpio(1) as? String) ?? ""))
            }
            if prof < 4 { for h in AX.elementos(limpio(4)) { pila.append((h, prof + 1)) } }
        }
        return r
    }

    func desplazar(_ pid: pid_t, _ e: AXUIElement?, _ dir: String, _ cantidad: Int) throws -> JSON {
        // Primero la barra de desplazamiento por AX: exacto y sin eventos.
        var area = e
        while let a = area, AX.string(a, kAXRoleAttribute) != "AXScrollArea" {
            area = AX.attr(a, kAXParentAttribute).flatMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil }
        }
        let vertical = dir == "arriba" || dir == "abajo"
        if let a = area, let barra = AX.attr(a, vertical ? kAXVerticalScrollBarAttribute : kAXHorizontalScrollBarAttribute), CFGetTypeID(barra) == AXUIElementGetTypeID() {
            let b = barra as! AXUIElement
            let actual = (AX.attr(b, kAXValueAttribute) as? NSNumber)?.doubleValue ?? 0
            let paso = 0.08 * Double(cantidad) * ((dir == "abajo" || dir == "derecha") ? 1 : -1)
            let nuevo = min(1, max(0, actual + paso))
            if AXUIElementSetAttributeValue(b, kAXValueAttribute as CFString, NSNumber(value: nuevo)) == .success {
                return efecto(true, confirmado: true, String(format: "barra %.2f → %.2f", actual, nuevo))
            }
        }
        let punto = e.flatMap(AX.marco).map { CGPoint(x: $0.x + $0.w / 2, y: $0.y + $0.h / 2) }
        Puntero.rueda(pid: pid, en: punto, dy: vertical ? (dir == "abajo" ? -cantidad : cantidad) * 3 : 0, dx: vertical ? 0 : (dir == "derecha" ? -cantidad : cantidad) * 3)
        return efecto(true, confirmado: false, "rueda por proceso")
    }

    func ponerValor(_ pid: pid_t, _ e: AXUIElement, _ valor: String) throws -> JSON {
        let rol = AX.string(e, kAXRoleAttribute) ?? ""
        if rol == "AXPopUpButton" || rol == "AXComboBox" {
            // El ítem existe como hijo aunque el menú esté cerrado: se presiona sin abrirlo (mina de Cua).
            for menu in AX.elementos(AX.attr(e, kAXChildrenAttribute)) {
                for item in AX.elementos(AX.attr(menu, kAXChildrenAttribute)) where AX.string(item, kAXTitleAttribute)?.lowercased() == valor.lowercased() {
                    if AXUIElementPerformAction(item, kAXPressAction as CFString) == .success {
                        let leido = AX.string(e, kAXValueAttribute) ?? AX.string(e, kAXTitleAttribute)
                        return efecto(true, confirmado: leido?.lowercased() == valor.lowercased(), "opción «\(valor)»")
                    }
                }
            }
        }
        if rol == "AXCheckBox" || rol == "AXRadioButton" {
            let actual = AX.string(e, kAXValueAttribute)
            let quiere = ["1", "true", "si", "sí", "on", "activado"].contains(valor.lowercased()) ? "1" : "0"
            if actual == quiere { return efecto(true, confirmado: true, "ya estaba en \(quiere)") }
            return try clic(pid, e)
        }
        let actual = AX.attr(e, kAXValueAttribute)
        let nuevo: CFTypeRef = (actual is NSNumber) ? NSNumber(value: Double(valor) ?? 0) : valor as CFString
        let err = AXUIElementSetAttributeValue(e, kAXValueAttribute as CFString, nuevo)
        if err == .success {
            let leido = AX.string(e, kAXValueAttribute)
            return efecto(true, confirmado: leido == valor || (valor.isEmpty && (leido ?? "").isEmpty) || (Double(leido ?? "") != nil && Double(leido ?? "") == Double(valor)), "valor → \(leido ?? "«»")")
        }
        if rol == "AXSlider", let objetivo = Double(valor) {
            // SwiftUI rechaza escribir AXValue en sliders (-25200): se avanza con incrementos.
            for _ in 0..<100 {
                let v = (AX.attr(e, kAXValueAttribute) as? NSNumber)?.doubleValue ?? objetivo
                if abs(v - objetivo) < 0.5 { return efecto(true, confirmado: true, "deslizador → \(v)") }
                AXUIElementPerformAction(e, (v < objetivo ? kAXIncrementAction : kAXDecrementAction) as CFString)
            }
        }
        return efecto(false, confirmado: false, "no se pudo poner el valor: \(AX.nombreError(err))")
    }

    /// Diagnóstico: todos los atributos de un ref (nombres, valores cortos y cuáles se pueden escribir).
    func inspeccionar(_ a: JSON) throws -> JSON {
        let pid = try pid(a)
        guard let ref = a["ref"] as? String else { throw ErrorManos("inspeccionar necesita ref") }
        let e = try elemento(pid, (a["ventana"] as? Int).map { CGWindowID($0) }, ref)
        var nombres: CFArray?
        AXUIElementCopyAttributeNames(e, &nombres)
        var r: JSON = [:]
        for n in (nombres as? [String]) ?? [] {
            let v = AX.attr(e, n)
            var s = "\(v.map { String(describing: $0) } ?? "nil")"
            if let v, CFGetTypeID(v) == AXUIElementGetTypeID() { s = "elemento: \(AX.string(v as! AXUIElement, kAXRoleAttribute) ?? "?") «\(AX.string(v as! AXUIElement, kAXValueAttribute) ?? AX.string(v as! AXUIElement, kAXTitleAttribute) ?? "")»" }
            if let arr = v as? [AnyObject] { s = "[\(arr.count)]" }
            r[n] = String(s.prefix(120))
        }
        r["_acciones"] = AX.acciones(e)
        return r
    }

    // MARK: - Medios: silenciar y pausar en el mismo paso

    /// Silencia y pausa el reproductor de una página (YouTube y similares) por sus botones AX,
    /// en ese orden y en una sola operación: el audio no debe sonar más que lo que tarda en
    /// aparecer el reproductor. Cada botón se presiona como mucho dos veces y el estado se
    /// confirma leyendo de vuelta la etiqueta («Activar sonido», «Reproducir»), no se supone.
    func medios(_ a: JSON) throws -> JSON {
        let pid = try pid(a)
        Web.asegurar(pid)
        let (v, wid) = try ventanaAX(pid, a["ventana"] as? Int)
        let reg = registro(pid, wid)
        let t0 = DispatchTime.now().uptimeNanoseconds
        let fin = t0 + UInt64((a["tope_ms"] as? Int) ?? 8000) * 1_000_000
        let reSilenciar = "^(silenciar|mute)\\b", reConSonido = "^(activar sonido|unmute|reactivar sonido)\\b"
        let rePausar = "^(pausa|pausar|pause)\\b", reReproducir = "^(reproducir|play)\\b.*\\(k\\)|^(reproducir|play)$"
        var silenciado = false, pausado = false, vioReproductor = false
        var presionados: [String: (veces: Int, en: UInt64)] = [:]
        var hechos: [String] = []
        repeat {
            let l = recorrer(v, reg, max: 9000, presupuestoMs: 2500, podar: false)
            let botones = l.nodos.filter { $0.rol == "AXButton" }
            func hay(_ re: String) -> Nodo? { botones.first { ($0.etiqueta ?? "").range(of: re, options: [.regularExpression, .caseInsensitive]) != nil } }
            let ahora = DispatchTime.now().uptimeNanoseconds
            func presionar(_ n: Nodo, _ nombre: String) {
                let p = presionados[nombre] ?? (0, 0)
                // Tras presionar se espera la lectura de vuelta (1.5 s) antes de volver a intentar: presionar de más alterna.
                guard p.veces < 2, ahora - p.en > 1_500_000_000 || p.veces == 0, let e = reg.porRef[n.ref] else { return }
                if AXUIElementPerformAction(e, kAXPressAction as CFString) == .success { presionados[nombre] = (p.veces + 1, ahora); hechos.append("\(nombre) «\(n.etiqueta ?? "")»") }
            }
            if hay(reConSonido) != nil { silenciado = true; vioReproductor = true } else if let n = hay(reSilenciar) { vioReproductor = true; presionar(n, "silenciar") }
            if hay(reReproducir) != nil && vioReproductor { pausado = true } else if let n = hay(rePausar) { vioReproductor = true; presionar(n, "pausar") }
            if silenciado && pausado { break }
            usleep(120_000)
        } while DispatchTime.now().uptimeNanoseconds < fin
        var r: JSON = ["silenciado": silenciado, "pausado": pausado, "reproductor": vioReproductor, "acciones": hechos,
                       "ms": Double(DispatchTime.now().uptimeNanoseconds - t0) / 1e6, "ventana": Int(wid)]
        if let area = Web.areaWeb(v), let u = Web.url(area) { r["url"] = u }
        return r
    }

    // MARK: - Contexto (para el freno de seguridad)

    /// Lo que el freno necesita para juzgar una acción: el elemento (o el enfocado si no hay ref),
    /// sus ancestros, la ventana y, si hay un diálogo, su texto corto y sus botones por defecto.
    /// No devuelve el valor de los campos (lo que se escribe en un chat no sale de aquí).
    func contexto(_ a: JSON) throws -> JSON {
        let pid = try pid(a)
        Web.asegurar(pid)
        let wid = (a["ventana"] as? Int).map { CGWindowID($0) }
        let e: AXUIElement? = try (a["ref"] as? String).map { try elemento(pid, wid, $0) } ?? enfocado(pid)
        let app = NSRunningApplication(processIdentifier: pid)
        var r: JSON = ["pid": Int(pid), "bundle": app?.bundleIdentifier ?? "", "app": app?.localizedName ?? ""]
        func corto(_ s: String?, _ n: Int = 60) -> String? { s.flatMap { $0.isEmpty ? nil : String($0.prefix(n)) } }
        if let e {
            AXUIElementSetMessagingTimeout(e, 0.6)
            let v = AX.lote(e)
            let extra = AX.loteDe(e, [kAXPlaceholderValueAttribute, "AXHelp", kAXIdentifierAttribute, "AXDOMIdentifier", "AXDOMClassList"])
            var el: JSON = ["rol": v[Attr.rol] as? String ?? ""]
            if let s = AX.texto(v[Attr.subrol]) { el["subrol"] = s }
            if let s = corto(AX.texto(v[Attr.titulo])) { el["titulo"] = s }
            if let s = corto(AX.texto(v[Attr.descripcion])) { el["descripcion"] = s }
            if let s = corto(AX.texto(extra[0])) { el["placeholder"] = s }
            if let s = corto(AX.texto(extra[1])) { el["ayuda"] = s }
            if let s = corto(AX.texto(extra[2])) { el["identificador"] = s }
            if let s = corto(AX.texto(extra[3])) { el["dom_id"] = s }
            if let c = extra[4] as? [String] { el["dom_clases"] = String(c.joined(separator: " ").prefix(120)) }
            if let tu = v[Attr.tituloUI], CFGetTypeID(tu) == AXUIElementGetTypeID() { el["etiqueta_ui"] = corto(AX.string(tu as! AXUIElement, kAXValueAttribute) ?? AX.string(tu as! AXUIElement, kAXTitleAttribute)) }
            // Solo la longitud del valor: el contenido de un compositor de chat es privado.
            if let val = AX.texto(v[Attr.valor]) { el["valor_largo"] = val.count }
            el["acciones"] = AX.acciones(e)
            r["elemento"] = el
            var ancestros: [String] = []
            var dentroDe: [String] = []
            var p = AX.attr(e, kAXParentAttribute)
            for _ in 0..<14 {
                guard let pv = p, CFGetTypeID(pv) == AXUIElementGetTypeID() else { break }
                let pe = pv as! AXUIElement
                let rol = AX.string(pe, kAXRoleAttribute) ?? "?"
                let sub = AX.string(pe, kAXSubroleAttribute)
                let et = corto(AX.string(pe, kAXTitleAttribute) ?? AX.string(pe, kAXDescriptionAttribute), 40)
                ancestros.append(et.map { "\(rol) «\($0)»" } ?? rol)
                if rol == "AXSheet" || sub == "AXDialog" || sub == "AXSystemDialog" { dentroDe.append(rol == "AXSheet" ? "hoja" : "dialogo") }
                if rol == "AXWebArea" { dentroDe.append("web"); if let u = Web.url(pe) { r["url"] = u } }
                if rol == "AXWindow" { r["ventana"] = ["titulo": corto(AX.string(pe, kAXTitleAttribute), 80) ?? "", "subrol": sub ?? ""]; break }
                p = AX.attr(pe, kAXParentAttribute)
            }
            r["ancestros"] = ancestros
            r["dentro_de"] = dentroDe
        }
        // Diálogo abierto en la app (hoja o ventana de diálogo): texto corto y botones por defecto/cancelar.
        for v in candidatasBoton(pid) {
            let rol = AX.string(v, kAXRoleAttribute), sub = AX.string(v, kAXSubroleAttribute)
            guard rol == "AXSheet" || sub == "AXDialog" || sub == "AXSystemDialog" else { continue }
            var textos: [String] = []
            var pila = AX.elementos(AX.attr(v, kAXChildrenAttribute))
            var n = 0
            while let x = pila.popLast(), n < 60 {
                n += 1
                if AX.string(x, kAXRoleAttribute) == "AXStaticText", let t = AX.string(x, kAXValueAttribute), !t.isEmpty { textos.append(String(t.prefix(80))) }
                pila += AX.elementos(AX.attr(x, kAXChildrenAttribute))
            }
            var d: JSON = ["tipo": rol == "AXSheet" ? "hoja" : "dialogo", "texto": String(textos.joined(separator: " · ").prefix(240))]
            if let b = AX.attr(v, kAXDefaultButtonAttribute as String), CFGetTypeID(b) == AXUIElementGetTypeID() { d["boton_defecto"] = AX.string(b as! AXUIElement, kAXTitleAttribute) ?? "" }
            if let b = AX.attr(v, kAXCancelButtonAttribute as String), CFGetTypeID(b) == AXUIElementGetTypeID() { d["boton_cancelar"] = AX.string(b as! AXUIElement, kAXTitleAttribute) ?? "" }
            r["dialogo"] = d
            break
        }
        if r["dialogo"] == nil, let v = AX.ventanas(AX.app(pid)).first,
           let b = AX.attr(v, kAXDefaultButtonAttribute as String), CFGetTypeID(b) == AXUIElementGetTypeID() {
            r["boton_defecto_ventana"] = AX.string(b as! AXUIElement, kAXTitleAttribute) ?? ""
        }
        return r
    }

    // MARK: - Verificar

    func verificar(_ a: JSON) throws -> JSON {
        let pid = try pid(a)
        let (v, wid) = try ventanaAX(pid, a["ventana"] as? Int)
        let reg = registro(pid, wid)
        let l = recorrer(v, reg, max: 3000, presupuestoMs: 5000)
        let esperas = a["espera"] as? [JSON] ?? []
        var fallas: [String] = []
        for (i, x) in esperas.enumerated() {
            let et = (x["etiqueta_contiene"] as? String)?.lowercased()
            let rol = x["rol"] as? String
            let candidatos = l.nodos.filter { n in
                (et == nil || [n.etiqueta, n.valor].compactMap { $0?.lowercased() }.contains { $0.contains(et!) }) &&
                (rol == nil || n.rol == rol || n.rolCorto == rol || n.subrol == rol)
            }
            if candidatos.isEmpty { fallas.append("#\(i + 1): no existe"); continue }
            let ok = candidatos.contains { n in
                if let val = x["valor"] as? String, normal(n.valor) != normal(val) && normal(n.etiqueta) != normal(val) { return false }
                if let s = x["seleccionado"] as? Bool, (n.seleccionado ?? false) != s { return false }
                if let h = x["habilitado"] as? Bool, (n.habilitado ?? true) != h { return false }
                return true
            }
            if !ok { fallas.append("#\(i + 1): existe pero no cumple (\(candidatos.prefix(2).map(\.linea).joined(separator: " | ")))") }
        }
        if l.truncado != nil && !fallas.isEmpty { return ["cumple": "desconocido", "detalle": "árbol incompleto: " + fallas.joined(separator: "; ")] }
        return ["cumple": fallas.isEmpty, "detalle": fallas.isEmpty ? "\(esperas.count) expectativas cumplidas" : fallas.joined(separator: "; ")]
    }

    private func normal(_ s: String?) -> String {
        let x = (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch x { case "true", "on", "activado": return "1"; case "false", "off", "desactivado": return "0"; default: return x }
    }

    // MARK: - Apps, ventanas, cursor

    func apps() -> [JSON] {
        let frente = NSWorkspace.shared.frontmostApplication?.processIdentifier
        return NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular }.map {
            var j: JSON = ["nombre": $0.localizedName ?? "", "pid": Int($0.processIdentifier), "activa": $0.processIdentifier == frente]
            if let b = $0.bundleIdentifier { j["bundle"] = b }
            return j
        }
    }

    func abrir(_ app: String) throws -> JSON {
        let frente = NSWorkspace.shared.frontmostApplication
        let q = app.lowercased()
        if let r = NSWorkspace.shared.runningApplications.first(where: { $0.bundleIdentifier?.lowercased() == q || $0.localizedName?.lowercased() == q }) {
            let pid = r.processIdentifier
            Asentador.compartido.vigilar(pid)
            // Corre pero sin ventanas (se cerró la última): se le pide «reabrir» como un clic en el Dock, sin activarla.
            if AX.ventanas(AX.app(pid)).isEmpty, let url = r.bundleURL {
                let cfg = NSWorkspace.OpenConfiguration(); cfg.activates = false; cfg.addsToRecentItems = false
                NSWorkspace.shared.openApplication(at: url, configuration: cfg) { _, _ in }
                for _ in 0..<150 where AX.ventanas(AX.app(pid)).isEmpty { usleep(20_000) }
                if let f = frente, f.processIdentifier != pid {
                    for _ in 0..<25 { if NSWorkspace.shared.frontmostApplication?.processIdentifier == pid { f.activate(options: []); break }; usleep(20_000) }
                }
            }
            return ["pid": Int(pid), "ventanas": ventanas(pid: pid), "ya_abierta": true]
        }
        let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: app)
            ?? ["/Applications", "/System/Applications", "/System/Applications/Utilities", "\(NSHomeDirectory())/Applications"]
                .map { URL(fileURLWithPath: "\($0)/\(app).app") }.first { FileManager.default.fileExists(atPath: $0.path) }
        guard let url else { throw ErrorManos("No encontré la app «\(app)». Usa su bundle id.") }
        let cfg = NSWorkspace.OpenConfiguration()
        cfg.activates = false
        cfg.addsToRecentItems = false
        let listo = DispatchSemaphore(value: 0)
        var lanzada: NSRunningApplication?
        var fallo: Error?
        NSWorkspace.shared.openApplication(at: url, configuration: cfg) { a, e in lanzada = a; fallo = e; listo.signal() }
        if listo.wait(timeout: .now() + 15) == .timedOut { throw ErrorManos("La app no terminó de abrir en 15 s.") }
        if let fallo { throw ErrorManos("No se pudo abrir: \(fallo.localizedDescription)") }
        guard let a = lanzada else { throw ErrorManos("No se pudo abrir la app.") }
        let pid = a.processIdentifier
        // Mina de Cua: hasta que termina de lanzar, todo AX responde cannotComplete.
        for _ in 0..<200 where !a.isFinishedLaunching { usleep(20_000) }
        Asentador.compartido.vigilar(pid)
        let axApp = AX.app(pid)
        for _ in 0..<150 where AX.ventanas(axApp).isEmpty { usleep(20_000) }
        // Algunas apps se activan solas al lanzar: se devuelve el frente a quien lo tenía.
        if let f = frente, f.processIdentifier != pid {
            for _ in 0..<25 {
                if NSWorkspace.shared.frontmostApplication?.processIdentifier == pid { f.activate(options: []); break }
                usleep(20_000)
            }
        }
        return ["pid": Int(pid), "ventanas": ventanas(pid: pid)]
    }

    func ventanas(pid: pid_t? = nil) -> [JSON] {
        guard let info = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
        var r: [JSON] = []
        let total = info.count
        for (i, w) in info.enumerated() {
            guard (w[kCGWindowLayer as String] as? Int) == 0, let wp = w[kCGWindowOwnerPID as String] as? Int else { continue }
            if let pid, wp != Int(pid) { continue }
            let b = w[kCGWindowBounds as String] as? [String: Double] ?? [:]
            guard (b["Width"] ?? 0) > 1, (b["Height"] ?? 0) > 1 else { continue }
            var j: JSON = [
                "id": w[kCGWindowNumber as String] as? Int ?? 0, "pid": wp, "app": w[kCGWindowOwnerName as String] as? String ?? "",
                "marco": ["x": b["X"] ?? 0, "y": b["Y"] ?? 0, "w": b["Width"] ?? 0, "h": b["Height"] ?? 0],
                "en_pantalla": w[kCGWindowIsOnscreen as String] as? Bool ?? false, "z": total - i,
            ]
            if let t = w[kCGWindowName as String] as? String, !t.isEmpty { j["titulo"] = t }
            r.append(j)
        }
        return r
    }

    func cursor() -> JSON {
        let p = CGEvent(source: nil)?.location ?? .zero
        return (["x": p.x, "y": p.y] as JSON).merging(CursorSistema.estado()) { a, _ in a }
    }

    /// Mueve una ventana (preparación de pruebas: monitor secundario). Por AX, sin traerla al frente.
    func colocar(_ a: JSON) throws -> JSON {
        let pid = try pid(a)
        let (v, wid) = try ventanaAX(pid, a["ventana"] as? Int)
        var p = CGPoint(x: a["x"] as? Double ?? Double(a["x"] as? Int ?? 0), y: a["y"] as? Double ?? Double(a["y"] as? Int ?? 0))
        guard let valor = AXValueCreate(.cgPoint, &p) else { throw ErrorManos("posición inválida") }
        let err = AXUIElementSetAttributeValue(v, kAXPositionAttribute as CFString, valor)
        if err != .success { throw ErrorManos("No se pudo mover la ventana: \(AX.nombreError(err))") }
        return ["ok": true, "ventana": Int(wid), "marco": AX.marco(v).map { ["x": $0.x, "y": $0.y, "w": $0.w, "h": $0.h] } ?? [:]]
    }
}
