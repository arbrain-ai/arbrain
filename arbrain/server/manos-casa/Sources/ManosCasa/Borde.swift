import AppKit
import QuartzCore

/// El marco de trabajo y la franja de control (3 nov 2026). La persona, 07:37: «anthropic cuando estás controlando un ordenador
/// pinta todo lo externo como con un margen naranja». A las 07:33 un encargo trabajó en Chrome y él no vio ninguna señal.
///
/// Mientras las manos trabajan en una ventana:
///   - un marco morado de marca la envuelve. Vive en su orden de capas, como el Halo (estudio de Cloudroom, punto 5): si
///     Daniel la tapa, queda tapado; si la sube, sube con ella; si la mueve, la sigue.
///   - pegada al marco, sin tapar la ventana, una franja «Levy está usando TextEdit · Detener · Tomar el control».
///     Los clics pasan a la app de abajo salvo sobre un botón, y un botón solo cuenta si el gesto empezó y terminó en
///     él. Nunca toma el foco de teclado. Se anuncia a VoiceOver.
/// Aparece en ≤ 300 ms desde la primera operación sobre la ventana y se va en ≤ 1 s al terminar. Se apaga solo por cuatro
/// salidas independientes: el fin del encargo (TS), soltar o desconectarse la sesión, el reposo de la app y `vence`
/// (nadie lo sostiene: un encargo lo renueva con un latido; una herramienta suelta, con cada operación).
final class Borde {
    static let compartido = Borde()
    var activo = ProcessInfo.processInfo.environment["MANOS_BORDE"] != "0"
    /// Segundos que una operación suelta (sin encargo) lo mantiene encendido.
    static let ttlS = Double(ProcessInfo.processInfo.environment["MANOS_BORDE_TTL_S"] ?? "") ?? 4
    /// Clics ignorados tras aparecer: la franja puede nacer justo bajo el ratón de Daniel.
    static let graciaS = 0.3

    /// Sesión de la operación en curso (la pone Servidor antes de despachar; la cola del motor es serial).
    var sesionEnCurso: String?

    private var marco: NSPanel?
    private var franja: NSPanel?
    private var vistaMarco: VistaMarco?
    private var vistaFranja: VistaFranja?
    private var ventana: CGWindowID = 0
    private var pidVentana: pid_t = 0
    private var vence: CFTimeInterval = 0
    private var reloj: Timer?
    private var apagando = false
    private var aparecio: CFTimeInterval = 0
    private var ultimoApilado: CFTimeInterval = 0
    private var ultimoMarco: CGRect = .null
    private(set) var dueno: String?
    /// Quién trabaja (el agente o la sesión): «Levy está usando TextEdit». Lo manda el encargo; si no, el de la app.
    private(set) var nombre = ProcessInfo.processInfo.environment["MANOS_NOMBRE_AGENTE"] ?? "Arbrain"
    private(set) var texto = ""
    /// Evidencia: cuándo se encendió y se apagó (ms epoch) y por qué.
    private(set) var encendidoMs: Double = 0
    private(set) var apagadoMs: Double = 0
    private(set) var ultimoApagado = ""
    /// Sesiones que la persona detuvo desde la franja: sus operaciones fallan con un error con nombre hasta soltar.
    private let candado = NSLock()
    private var detenidas: [String: String] = [:]

    private static func ahoraMs() -> Double { Date().timeIntervalSince1970 * 1000 }
    static var reducirMovimiento: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }

    /// Pantalla que más cubre `r` (coordenadas globales de Quartz, arriba-izquierda del monitor principal).
    static func pantallaQueMasCubre(_ r: CGRect) -> NSScreen? {
        let alto = NSScreen.screens.first?.frame.maxY ?? 0
        var mejor: (NSScreen, CGFloat)?
        for s in NSScreen.screens {
            let f = s.frame
            let q = CGRect(x: f.minX, y: alto - f.maxY, width: f.width, height: f.height)
            let i = q.intersection(r)
            let area = i.isNull ? 0 : max(i.width * i.height, 1)
            if area > (mejor?.1 ?? 0) { mejor = (s, area) }
        }
        return mejor?.0
    }

    /// El marco de la ventana según el WindowServer (Quartz) y si está en pantalla.
    static func marcoVentana(_ w: CGWindowID) -> (CGRect, Bool, pid_t)? {
        guard w != 0, let info = (CGWindowListCopyWindowInfo([.optionIncludingWindow], w) as? [[String: Any]])?.first,
              let b = info[kCGWindowBounds as String] as? [String: CGFloat] else { return nil }
        let r = CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: b["Width"] ?? 0, height: b["Height"] ?? 0)
        return (r, info[kCGWindowIsOnscreen as String] as? Bool ?? false, pid_t(info[kCGWindowOwnerPID as String] as? Int ?? 0))
    }

    // MARK: - Sesiones detenidas

    func detenida(_ sesion: String) -> String? { candado.lock(); defer { candado.unlock() }; return detenidas[sesion] }
    func olvidarDetencion(_ sesion: String) { candado.lock(); detenidas[sesion] = nil; candado.unlock() }

    /// Texto del error con nombre que recibe el agente tras «Detener» o «Tomar el control».
    static func errorDetenida(_ motivo: String) -> String {
        motivo == "control"
            ? "persona_tiene_el_control: la persona tomó el control de la ventana desde la franja. No se tocó nada más. No reintentes ni busques otra vía: dile en una línea que se la dejaste y espera a que te lo pida."
            : "detenido_por_persona: la persona detuvo el encargo desde la franja. No se tocó nada más. No reintentes: dile en una línea que paraste."
    }

    // MARK: - Encender y apagar

    /// Lo enciende (o lo renueva) para `sesion` sobre `ventana`. `sostenerS`: cuánto vive sin otro latido. `nuevo`: el nombre.
    func encender(sesion: String?, texto nuevo: String?, ventana w: CGWindowID?, sostenerS: Double) {
        guard activo else { return }
        let ir = { [self] in
            if let sesion { dueno = sesion }
            vence = max(vence, CACurrentMediaTime() + sostenerS)
            if let nuevo, !nuevo.isEmpty { nombre = nuevo }
            if let w, w != 0, w != marco?.windowNumber.toWID, w != franja?.windowNumber.toWID, w != ventana {
                ventana = w
                pidVentana = Borde.marcoVentana(w)?.2 ?? 0
            }
            vigilar()
            seguir()
        }
        if Thread.isMainThread { ir() } else { DispatchQueue.main.async(execute: ir) }
    }

    /// Una operación de la sesión en curso sobre `ventana` lo mantiene vivo `ttlS` (sin encargo que lo sostenga).
    func trabajando(en ventana: CGWindowID?) {
        guard let s = sesionEnCurso else { return }
        encender(sesion: s, texto: nil, ventana: ventana, sostenerS: Borde.ttlS)
    }

    func apagar(_ motivo: String) {
        let ir = { [self] in
            reloj?.invalidate(); reloj = nil
            vence = 0
            dueno = nil
            ventana = 0
            guard let m = marco, m.isVisible, !apagando else { franja?.orderOut(nil); return }
            apagando = true
            apagadoMs = Borde.ahoraMs()
            ultimoApagado = motivo
            let f = franja
            NSAnimationContext.runAnimationGroup({ $0.duration = 0.18; m.animator().alphaValue = 0; f?.animator().alphaValue = 0 }, completionHandler: { [weak self] in
                guard let self, self.apagando else { return }
                self.apagando = false
                m.orderOut(nil); f?.orderOut(nil)
                self.vistaMarco?.respirar(false)
            })
        }
        if Thread.isMainThread { ir() } else { DispatchQueue.main.async(execute: ir) }
    }

    /// Se fue (o soltó) la sesión que lo encendió: se apaga con ella y se olvida su detención.
    func soltar(sesiones: Set<String>, motivo: String) {
        candado.lock(); for s in sesiones { detenidas[s] = nil }; candado.unlock()
        DispatchQueue.main.async { [self] in
            guard let d = dueno, sesiones.contains(d) else { return }
            apagar(motivo)
        }
    }

    /// 30 Hz: sigue a la ventana (posición, tamaño, capas), vigila el vencimiento y deja pasar los clics fuera de los botones.
    private func vigilar() {
        guard reloj == nil else { return }
        let t = Timer(timeInterval: 1.0 / 30, repeats: true) { [weak self] _ in
            guard let self else { return }
            if CACurrentMediaTime() > self.vence { self.apagar("vencio"); return }
            self.seguir()
        }
        RunLoop.main.add(t, forMode: .common)
        reloj = t
    }

    private func seguir() {
        guard ventana != 0, let (r, enPantalla, _) = Borde.marcoVentana(ventana), r.width > 40, r.height > 40 else { return }
        let m = marco ?? crearMarco()
        let f = franja ?? crearFranja()
        let alto = NSScreen.screens.first?.frame.maxY ?? 0
        // Quartz → Cocoa, con 4 pt de margen para que la línea quede FUERA del contenido de la ventana.
        let c = NSRect(x: r.minX - VistaMarco.margen, y: alto - r.maxY - VistaMarco.margen, width: r.width + 2 * VistaMarco.margen, height: r.height + 2 * VistaMarco.margen)
        let movida = r != ultimoMarco
        ultimoMarco = r
        if m.frame != c { m.setFrame(c, display: true) }
        let app = NSRunningApplication(processIdentifier: pidVentana)?.localizedName
        texto = app.map { "\(nombre) está usando \($0)" } ?? "\(nombre) está trabajando"
        vistaFranja?.ponerTexto(texto)
        let tf = vistaFranja?.tamano ?? NSSize(width: 300, height: 30)
        f.setFrame(Borde.lugarFranja(ventana: c, tam: tf, pantalla: Borde.pantallaQueMasCubre(r)), display: true)
        let nuevo = !m.isVisible || apagando
        if nuevo {
            apagando = false
            m.alphaValue = 0; f.alphaValue = 0
            aparecio = CACurrentMediaTime()
            encendidoMs = Borde.ahoraMs()
            vistaFranja?.anunciar()
        }
        // En el orden de capas de su ventana, como el Halo: ventana < marco < franja < Halo, y no más arriba. Se reapila
        // al aparecer, si la ventana se movió y cada 250 ms (Daniel pudo subirla): no en cada cuadro, para no parpadear.
        if enPantalla && (nuevo || movida || CACurrentMediaTime() - ultimoApilado > 0.25) {
            ultimoApilado = CACurrentMediaTime()
            m.order(.above, relativeTo: Int(ventana))
            f.order(.above, relativeTo: m.windowNumber)
            Fantasma.compartido.reapilar(sobre: ventana, tope: f.windowNumber)
        }
        if nuevo {
            NSAnimationContext.runAnimationGroup { $0.duration = 0.12; m.animator().alphaValue = 1; f.animator().alphaValue = 1 }
            vistaMarco?.respirar(!Borde.reducirMovimiento)
        }
        // Clics: la franja solo los recibe con el ratón ENCIMA de un botón; el resto del tiempo deja pasar todo.
        let raton = NSEvent.mouseLocation
        f.ignoresMouseEvents = !(vistaFranja?.botonEn(f.convertPoint(fromScreen: raton)) ?? false)
    }

    /// Arriba al centro, fuera de la ventana; si no cabe, abajo; si tampoco, dentro del filo superior.
    static func lugarFranja(ventana c: NSRect, tam: NSSize, pantalla: NSScreen?) -> NSRect {
        let v = pantalla?.visibleFrame ?? NSRect(x: -1e6, y: -1e6, width: 2e6, height: 2e6)
        var x = c.midX - tam.width / 2
        x = min(max(x, v.minX + 4), v.maxX - tam.width - 4)
        if c.maxY + 6 + tam.height <= v.maxY { return NSRect(x: x, y: c.maxY + 6, width: tam.width, height: tam.height) }
        if c.minY - 6 - tam.height >= v.minY { return NSRect(x: x, y: c.minY - 6 - tam.height, width: tam.width, height: tam.height) }
        return NSRect(x: x, y: c.maxY - 34 - tam.height, width: tam.width, height: tam.height)
    }

    /// Un botón de la franja: suelta candados, retira Halo y marco y marca la sesión; «control» además le da la ventana.
    fileprivate func boton(_ motivo: String) {
        guard CACurrentMediaTime() - aparecio >= Borde.graciaS, let s = dueno else { return }
        candado.lock(); detenidas[s] = motivo; candado.unlock()
        Servidor.candados.soltar(sesion: s)
        Fantasma.compartido.ocultarYa(motivo == "control" ? "toma_control" : "detener")
        let w = ventana, pid = pidVentana
        apagar(motivo == "control" ? "toma_control" : "detener")
        guard motivo == "control", pid != 0 else { return }
        // La persona lo pidió con su clic: su ventana al frente y con el foco.
        let app = AXUIElementCreateApplication(pid)
        for v in AX.ventanas(app) where AX.windowID(v) == w { AXUIElementPerformAction(v, kAXRaiseAction as CFString) }
        NSRunningApplication(processIdentifier: pid)?.activate(options: [])
    }

    private func crearMarco() -> NSPanel {
        let p = Borde.panel(titulo: "manos-marco")
        p.ignoresMouseEvents = true
        let v = VistaMarco(frame: .zero); v.autoresizingMask = [.width, .height]
        p.contentView = v
        marco = p; vistaMarco = v
        return p
    }

    private func crearFranja() -> NSPanel {
        let p = PanelSinFoco(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        Borde.preparar(p, titulo: "manos-franja")
        p.ignoresMouseEvents = true
        p.becomesKeyOnlyIfNeeded = true
        let v = VistaFranja(frame: .zero) { [weak self] m in self?.boton(m) }
        v.autoresizingMask = [.width, .height]
        p.contentView = v
        franja = p; vistaFranja = v
        return p
    }

    private static func panel(titulo: String) -> NSPanel {
        let p = PanelSinFoco(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        preparar(p, titulo: titulo)
        return p
    }

    private static func preparar(_ p: NSPanel, titulo: String) {
        p.title = titulo   // la batería de UX distingue Halo, marco y franja por título
        p.isOpaque = false
        p.backgroundColor = .clear
        p.hasShadow = false
        p.level = .normal
        p.collectionBehavior = [.canJoinAllSpaces, .ignoresCycle, .fullScreenAuxiliary]
        p.hidesOnDeactivate = false
        p.isReleasedWhenClosed = false
        p.sharingType = .readOnly   // aparece en capturas y grabaciones, como el Halo
    }

    /// Un encargo lo sostiene ahora (visible y sin vencer). Solo en el hilo principal. El Halo no se desvanece mientras
    /// tanto: el cerebro piensa entre pasos y el Halo se queda respirando donde actuó.
    var sostenido: Bool { (marco?.isVisible ?? false) && !apagando && CACurrentMediaTime() < vence }

    /// La capa más alta del marco sobre `ventana` (la franja), si está a la vista: el Halo va encima de ella.
    func tope(sobre w: CGWindowID?) -> Int? {
        guard let w, w == ventana, let f = franja, f.isVisible, !apagando else { return nil }
        return f.windowNumber
    }

    func estado() -> [String: Any] {
        DispatchQueue.main.sync {
            let visible = (marco?.isVisible ?? false) && (marco?.alphaValue ?? 0) > 0.01 && !apagando
            var r: [String: Any] = ["visible": visible, "alfa": Double(marco?.alphaValue ?? 0), "panel": marco?.windowNumber ?? 0,
                                    "franja": franja?.windowNumber ?? 0, "franja_visible": visible && (franja?.isVisible ?? false),
                                    "ventana": Int(ventana), "texto": texto, "dueno": dueno ?? "", "activo": activo,
                                    "encendido_ms": encendidoMs, "apagado_ms": apagadoMs, "ultimo_apagado": ultimoApagado,
                                    "vence_en_s": max(0, vence - CACurrentMediaTime()), "reducir_movimiento": Borde.reducirMovimiento]
            candado.lock(); r["detenidas"] = detenidas; candado.unlock()
            if let f = marco?.frame { r["marco"] = ["x": f.minX, "y": f.minY, "w": f.width, "h": f.height] }
            if let f = franja?.frame { r["marco_franja"] = ["x": f.minX, "y": f.minY, "w": f.width, "h": f.height] }
            r["botones"] = vistaFranja?.rectBotones(en: franja) ?? []
            r["franja_ignora_clics"] = franja?.ignoresMouseEvents ?? true
            return r
        }
    }

    /// Prueba sin ratón (batería de UX): eventos sintéticos DENTRO de la franja. Devuelve qué gesto contó como botón.
    func probarClics() -> [String: Any] {
        DispatchQueue.main.sync {
            guard let f = franja, let v = vistaFranja else { return ["error": "sin franja"] }
            let r = v.probar(en: f)
            return r
        }
    }
}

private extension Int { var toWID: CGWindowID { CGWindowID(self) } }

/// Panel que nunca se vuelve ventana clave ni principal: ni Enter ni Espacio llegan a sus botones.
final class PanelSinFoco: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class VistaMarco: NSView {
    static let margen: CGFloat = 4
    private let brillo = CAShapeLayer()
    private let linea = CAShapeLayer()

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        for (c, ancho, alfa) in [(brillo, CGFloat(7), Float(0.35)), (linea, 2.5, 0.95)] {
            c.fillColor = nil
            c.strokeColor = Fantasma.morado.cgColor
            c.lineWidth = ancho
            c.opacity = alfa
            c.contentsScale = NSScreen.screens.map(\.backingScaleFactor).max() ?? 2
            layer?.addSublayer(c)
        }
        setAccessibilityElement(false)
    }
    required init?(coder: NSCoder) { fatalError() }

    override func layout() {
        super.layout()
        CATransaction.begin(); CATransaction.setDisableActions(true)
        // La línea va sobre el filo de la ventana (radio de macOS ~10 pt); el resplandor, hacia fuera.
        let r = bounds.insetBy(dx: VistaMarco.margen - 1.25, dy: VistaMarco.margen - 1.25)
        for c in [brillo, linea] { c.frame = bounds; c.path = CGPath(roundedRect: r, cornerWidth: 11, cornerHeight: 11, transform: nil) }
        CATransaction.commit()
    }
    override var isFlipped: Bool { false }
    override func setFrameSize(_ s: NSSize) { super.setFrameSize(s); needsLayout = true }

    func respirar(_ si: Bool) {
        if !si { brillo.removeAnimation(forKey: "respirar"); return }
        guard brillo.animation(forKey: "respirar") == nil else { return }
        let a = CABasicAnimation(keyPath: "opacity"); a.fromValue = 0.35; a.toValue = 0.18
        a.duration = 1.4; a.autoreverses = true; a.repeatCount = .infinity
        a.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        brillo.add(a, forKey: "respirar")
    }
}

/// «Levy está usando TextEdit · Detener · Tomar el control». Sin foco; un botón cuenta solo con mouseDown y mouseUp en él.
final class VistaFranja: NSView {
    private let accion: (String) -> Void
    private let fondo = CALayer()
    private let punto = CALayer()
    private let rotulo = CATextLayer()
    private var botones: [(id: String, texto: String, capa: CATextLayer, fondo: CALayer)] = []
    private var apretado: String?
    private(set) var tamano = NSSize(width: 300, height: 30)
    private static let fuente = NSFont.systemFont(ofSize: 12.5, weight: .medium)

    init(frame: NSRect, accion: @escaping (String) -> Void) {
        self.accion = accion
        super.init(frame: frame)
        wantsLayer = true
        fondo.backgroundColor = CGColor(srgbRed: 0x12 / 255, green: 0x0A / 255, blue: 0x24 / 255, alpha: 0.92)
        fondo.borderColor = Fantasma.morado.cgColor
        fondo.borderWidth = 1
        fondo.cornerRadius = 15
        punto.backgroundColor = Fantasma.moradoLuz.cgColor
        punto.cornerRadius = 4
        for c in [rotulo] { c.font = VistaFranja.fuente; c.fontSize = 12.5; c.foregroundColor = CGColor(gray: 1, alpha: 0.96); c.alignmentMode = .left; c.truncationMode = .end }
        layer?.addSublayer(fondo)
        fondo.addSublayer(punto)
        fondo.addSublayer(rotulo)
        for (id, t) in [("detener", "Detener"), ("control", "Tomar el control")] {
            let b = CALayer(); b.cornerRadius = 10; b.backgroundColor = CGColor(srgbRed: 0x8C / 255, green: 0x27 / 255, blue: 0xF1 / 255, alpha: id == "detener" ? 0.9 : 0.28)
            let c = CATextLayer(); c.string = t; c.font = VistaFranja.fuente; c.fontSize = 12; c.foregroundColor = CGColor(gray: 1, alpha: 1); c.alignmentMode = .center
            b.addSublayer(c); fondo.addSublayer(b)
            botones.append((id, t, c, b))
        }
        let escala = NSScreen.screens.map(\.backingScaleFactor).max() ?? 2
        for c in [fondo, punto, rotulo] + botones.flatMap({ [$0.capa, $0.fondo] }) { c.contentsScale = escala }
        setAccessibilityElement(true)
        setAccessibilityRole(.group)
    }
    required init?(coder: NSCoder) { fatalError() }

    private static func ancho(_ t: String, _ tam: CGFloat = 12.5) -> CGFloat { ceil((t as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: tam, weight: .medium)]).width) }

    func ponerTexto(_ t: String) {
        guard rotulo.string as? String != t || bounds.width != tamano.width else { return }
        CATransaction.begin(); CATransaction.setDisableActions(true)
        rotulo.string = t
        setAccessibilityLabel(t)
        let alto: CGFloat = 30
        let wt = min(320, VistaFranja.ancho(t))
        var x: CGFloat = 12
        punto.frame = CGRect(x: x, y: (alto - 8) / 2, width: 8, height: 8); x += 16
        rotulo.frame = CGRect(x: x, y: (alto - 16) / 2 - 1, width: wt, height: 17); x += wt + 10
        for b in botones {
            let w = VistaFranja.ancho(b.texto, 12) + 20
            b.fondo.frame = CGRect(x: x, y: 5, width: w, height: alto - 10)
            b.capa.frame = CGRect(x: 0, y: 3, width: w, height: 15)
            x += w + 6
        }
        tamano = NSSize(width: x + 4, height: alto)
        fondo.frame = CGRect(origin: .zero, size: tamano)
        CATransaction.commit()
    }

    /// VoiceOver: se anuncia como estado al aparecer.
    func anunciar() {
        NSAccessibility.post(element: self, notification: .announcementRequested, userInfo: [.announcement: (rotulo.string as? String) ?? "", .priority: NSAccessibilityPriorityLevel.medium.rawValue])
    }

    private func boton(en p: NSPoint) -> String? { botones.first { $0.fondo.frame.contains(p) }?.id }
    func botonEn(_ p: NSPoint) -> Bool { boton(en: convert(p, from: nil)) != nil }

    func rectBotones(en w: NSWindow?) -> [[String: Any]] {
        guard let w else { return [] }
        return botones.map { b in let r = w.convertToScreen(convert(b.fondo.frame, to: nil)); return ["id": b.id, "x": r.minX, "y": r.minY, "w": r.width, "h": r.height] }
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override var acceptsFirstResponder: Bool { false }
    override func mouseDown(with e: NSEvent) { apretado = boton(en: convert(e.locationInWindow, from: nil)) }
    override func mouseUp(with e: NSEvent) {
        defer { apretado = nil }
        guard let a = apretado, boton(en: convert(e.locationInWindow, from: nil)) == a else { return }
        accion(a)
    }

    /// VoiceOver puede pulsar «Detener» (gesto deliberado); el teclado no llega (sin foco).
    override func accessibilityChildren() -> [Any]? {
        botones.map { b in
            let e = NSAccessibilityElement.electronicBoton(b.texto, padre: self, marco: convert(b.fondo.frame, to: nil)) { [weak self] in self?.accion(b.id) }
            return e
        }
    }

    /// Eventos sintéticos dentro de la franja (sin el ratón real): qué gesto cuenta como botón.
    func probar(en w: NSWindow) -> [String: Any] {
        var disparados: [String] = []
        let real = accion
        let medir = VistaFranja(frame: NSRect(origin: .zero, size: tamano)) { disparados.append($0) }
        medir.ponerTexto(rotulo.string as? String ?? "")
        _ = real
        guard let det = medir.botones.first(where: { $0.id == "detener" })?.fondo.frame else { return [:] }
        func ev(_ t: NSEvent.EventType, _ p: NSPoint) -> NSEvent { NSEvent.mouseEvent(with: t, location: p, modifierFlags: [], timestamp: 0, windowNumber: 0, context: nil, eventNumber: 0, clickCount: 1, pressure: 1)! }
        let dentro = NSPoint(x: det.midX, y: det.midY), fuera = NSPoint(x: 4, y: 4)
        medir.mouseUp(with: ev(.leftMouseUp, dentro));                                   let soloUp = disparados.count
        medir.mouseDown(with: ev(.leftMouseDown, dentro)); medir.mouseUp(with: ev(.leftMouseUp, fuera)); let abajoFuera = disparados.count - soloUp
        medir.mouseDown(with: ev(.leftMouseDown, fuera)); medir.mouseUp(with: ev(.leftMouseUp, dentro)); let arribaDentro = disparados.count - soloUp - abajoFuera
        medir.mouseDown(with: ev(.leftMouseDown, dentro)); medir.mouseUp(with: ev(.leftMouseUp, dentro)); let completo = disparados.count - soloUp - abajoFuera - arribaDentro
        return ["solo_mouseup": soloUp, "down_dentro_up_fuera": abajoFuera, "down_fuera_up_dentro": arribaDentro, "clic_completo": completo,
                "acepta_primer_responder": medir.acceptsFirstResponder, "puede_ser_clave": w.canBecomeKey, "puede_ser_principal": w.canBecomeMain]
    }
}

private extension NSAccessibilityElement {
    static func electronicBoton(_ titulo: String, padre: NSView, marco: NSRect, pulsar: @escaping () -> Void) -> NSAccessibilityElement {
        let e = BotonAccesible(pulsar)
        e.setAccessibilityRole(.button)
        e.setAccessibilityLabel(titulo)
        e.setAccessibilityParent(padre)
        e.setAccessibilityFrameInParentSpace(marco)
        return e
    }
}

private final class BotonAccesible: NSAccessibilityElement {
    private let pulsar: () -> Void
    init(_ pulsar: @escaping () -> Void) { self.pulsar = pulsar; super.init() }
    override func accessibilityPerformPress() -> Bool { pulsar(); return true }
}
