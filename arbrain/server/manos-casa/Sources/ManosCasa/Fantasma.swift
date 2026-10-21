import AppKit
import QuartzCore
import ManosNucleo

/// Cursor fantasma de la casa: dibuja dónde mira y dónde da clic el agente,
/// encima de todo, sin tocar el cursor real ni robar el foco.
///
/// Diseño «Prisma · Halo» elegido por Daniel: punta morada sólida con volumen y
/// halo, y una onda morada en cada clic. Nunca se espera su animación: la acción
/// no paga ni un milisegundo por él (Cua anima ~2.5 s por clic y por eso lo apagan).
final class Fantasma {
    static let compartido = Fantasma()
    var activo = ProcessInfo.processInfo.environment["MANOS_FANTASMA"] != "0"

    private var panel: NSPanel?
    private var vista: VistaFantasma?
    private var marcoMirada: NSPanel?
    private var apagar: DispatchWorkItem?

    static let morado = NSColor(srgbRed: 0x8C / 255, green: 0x27 / 255, blue: 0xF1 / 255, alpha: 1)
    static let moradoLuz = NSColor(srgbRed: 0xC7 / 255, green: 0x9C / 255, blue: 0xFF / 255, alpha: 1)

    /// Coordenadas AX/Quartz (origen arriba-izquierda del monitor principal) → Cocoa (abajo-izquierda).
    static func aCocoa(_ x: Double, _ y: Double) -> NSPoint {
        let alto = NSScreen.screens.first?.frame.maxY ?? 0
        return NSPoint(x: x, y: alto - y)
    }

    private static func panelBase(_ marco: NSRect) -> NSPanel {
        let p = NSPanel(contentRect: marco, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        p.isOpaque = false
        p.backgroundColor = .clear
        p.hasShadow = false
        p.ignoresMouseEvents = true
        p.level = .normal   // vive en el orden de capas de la ventana que opera (decisión del 11 oct, 11:26)
        p.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        p.hidesOnDeactivate = false
        p.isReleasedWhenClosed = false
        p.sharingType = .readOnly   // aparece en capturas y grabaciones (evidencia, demos)
        return p
    }

    private func asegurar() {
        guard panel == nil else { return }
        let p = Fantasma.panelBase(NSRect(x: 0, y: 0, width: VistaFantasma.lado, height: VistaFantasma.lado))
        let v = VistaFantasma(frame: NSRect(x: 0, y: 0, width: VistaFantasma.lado, height: VistaFantasma.lado))
        p.contentView = v
        panel = p; vista = v
    }

    /// Lleva la punta del puntero a un punto global (AX). Animación corta y sin espera.
    /// Pone un panel justo encima de la ventana objetivo y no más arriba: si otra ventana la tapa, el
    /// fantasma queda tapado igual; si Daniel trae la app al frente, sube con ella. Sin ventana conocida
    /// (demos), flota al frente.
    static func apilar(_ p: NSPanel, sobre ventana: CGWindowID?) {
        if p === compartido.panel { compartido.sobre = ventana; compartido.vigilarCapas() }
        if let ventana, ventana != 0 {
            p.level = .normal
            p.order(.above, relativeTo: Int(ventana))
        } else {
            p.level = .floating
            p.orderFrontRegardless()
        }
    }

    // MARK: - Movimiento humano (Daniel, 2 oct 18:18)
    //
    // La acción real NUNCA espera al fantasma: actuar solo encola un destino y sigue. El fantasma recorre
    // los destinos en orden (sin teletransportarse) con curva Bézier y duración de Fitts (250–600 ms), se posa
    // un instante («hover») antes de soltar la onda del clic y, sin acciones, se queda quieto donde terminó
    // hasta desvanecerse. Si el agente va más rápido que la animación, acorta los tramos para no quedarse atrás.
    // `MANOS_FANTASMA_ESTILO=antes` conserva el comportamiento anterior (para comparar en video).

    struct Destino { var x: Double; var y: Double; var pulso: Bool; var ventana: CGWindowID? }
    private var cola: [Destino] = []
    /// Tramo en curso: un `Movimiento` del modelo publicado (ManosNucleo/Trazado.swift), el mismo que usa la mano real.
    private var tramo: (mov: Movimiento, hasta: Destino, t0: CFTimeInterval, llego: CFTimeInterval?)?
    /// Última posición de la punta (coordenadas AX). Sobrevive al desvanecido: al volver, sale de ahí.
    private(set) var punta: (x: Double, y: Double)?
    private var reloj: Timer?
    /// Ventana sobre la que vive el Halo (nil = flota). Falla del 3 oct, 10:41: en Claude Desktop el Halo «desaparecía»
    /// porque Daniel hacía clic en esa ventana, la ventana subía y lo tapaba. Mientras se ve, se reapila encima de ella.
    fileprivate var sobre: CGWindowID?
    private var capas: Timer?

    fileprivate func vigilarCapas() {
        guard capas == nil else { return }
        let t = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
            guard let self, let p = self.panel, p.isVisible, p.alphaValue > 0.01 else { self?.capas?.invalidate(); self?.capas = nil; return }
            if let w = self.sobre, w != 0, p.level == .normal { p.order(.above, relativeTo: Int(w)) }
        }
        RunLoop.main.add(t, forMode: .common)
        capas = t
    }

    /// Para el doctor y la evidencia: dónde está el Halo y si está justo encima de su ventana en el orden de capas.
    func estado() -> [String: Any] {
        DispatchQueue.main.sync {
            var r: [String: Any] = ["visible": (panel?.isVisible ?? false) && (panel?.alphaValue ?? 0) > 0.01, "alfa": Double(panel?.alphaValue ?? 0),
                                    "sobre": Int(sobre ?? 0), "panel": panel?.windowNumber ?? 0,
                                    "dueno": dueno ?? "", "ultimo_apagado": ultimoApagado, "tope_s": Fantasma.topeS, "perro": perro != nil]
            if let p = punta { r["x"] = p.x; r["y"] = p.y }
            if let panel, let f = panel.screen { r["pantalla"] = ["x": f.frame.minX, "ancho": f.frame.width, "nombre": f.localizedName] }
            if let n = panel?.windowNumber, let l = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] {
                let ids = l.compactMap { $0[kCGWindowNumber as String] as? Int }
                if let i = ids.firstIndex(of: n) { r["justo_encima_de"] = i + 1 < ids.count ? ids[i + 1] : 0 }
            }
            return r
        }
    }
    var estilo = ProcessInfo.processInfo.environment["MANOS_FANTASMA_ESTILO"] ?? "humano"
    /// Segundos que el Halo se queda visible (respirando) sin acciones antes de desvanecerse. Antes eran 4 s y por eso
    /// «desaparecía y reaparecía» entre pasos de un agente que piensa (falla real del 2 oct).
    static let reposoS = Double(ProcessInfo.processInfo.environment["MANOS_FANTASMA_REPOSO_S"] ?? "") ?? 45
    /// Traza para evidencia: (t, x, y, alfa, pulso) cada cuadro, solo si se pidió.
    var traza: [[Double]]? = nil
    private let t0Traza = CACurrentMediaTime()

    private func colocar(_ x: Double, _ y: Double) {
        guard let panel else { return }
        let c = Fantasma.aCocoa(x, y)
        panel.setFrameOrigin(NSPoint(x: c.x - VistaFantasma.punta.x, y: c.y - VistaFantasma.punta.y))
        punta = (x, y)
    }

    private func anotar(_ pulso: Bool) {
        guard traza != nil, let p = punta else { return }
        traza!.append([CACurrentMediaTime() - t0Traza, p.x, p.y, Double(panel?.alphaValue ?? 0), pulso ? 1 : 0])
        if traza!.count > 40_000 { traza!.removeFirst(5_000) }
    }

    // MARK: - Apagado garantizado (falla del 6 oct, 19:43: Daniel detuvo un encargo y el Halo se quedó encima horas)
    //
    // El reposo de arriba es una sola tarea programada: si algo la cancela sin reprogramarla, nada más apaga el Halo.
    // Ahora hay tres salidas independientes: 1) `ocultarYa` al cancelar, terminar o desconectarse quien lo movía;
    // 2) un perro guardián en el hilo principal que lo oculta sí o sí tras `topeS` sin acciones; 3) un vigía fuera del
    // hilo principal: si el principal se congela con el Halo a la vista, la app sale (el proceso muerto se lleva
    // sus ventanas y el cliente la vuelve a abrir en la siguiente llamada).

    /// Segundos sin acciones tras los cuales el perro oculta el Halo pase lo que pase (por defecto, reposo + 15 s).
    static let topeS = Double(ProcessInfo.processInfo.environment["MANOS_FANTASMA_TOPE_S"] ?? "") ?? (reposoS + 15)
    /// Sesión (agente) que movió el Halo por última vez: si se desconecta o suelta, el Halo se va con ella.
    var dueno: String? { get { candado.lock(); defer { candado.unlock() }; return _dueno } set { candado.lock(); _dueno = newValue; candado.unlock() } }
    private var _dueno: String?
    private let candado = NSLock()
    /// Última acción (CACurrentMediaTime), escrita desde cualquier hilo.
    private var ultimaAccion: Double { get { candado.lock(); defer { candado.unlock() }; return _ultima } set { candado.lock(); _ultima = newValue; candado.unlock() } }
    private var _ultima = CACurrentMediaTime()
    private var perro: Timer?
    /// Latido del hilo principal (lo escribe el perro; lo lee el vigía de fuera).
    private var latido: Double { get { candado.lock(); defer { candado.unlock() }; return _latido } set { candado.lock(); _latido = newValue; candado.unlock() } }
    private var _latido = CACurrentMediaTime()
    private var visibleParaVigia: Bool { get { candado.lock(); defer { candado.unlock() }; return _visible } set { candado.lock(); _visible = newValue; candado.unlock() } }
    private var _visible = false
    /// Por qué se ocultó la última vez (evidencia para la prueba y el doctor).
    private(set) var ultimoApagado = ""

    /// Una acción movió el Halo: el perro cuenta desde aquí.
    private func latir() { ultimaAccion = CACurrentMediaTime(); visibleParaVigia = true; vigilarPerro() }

    private func vigilarPerro() {
        let iniciar = { [self] in
            guard perro == nil else { return }
            let t = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
                guard let self else { return }
                self.latido = CACurrentMediaTime()
                let visible = (self.panel?.isVisible ?? false) || (self.marcoMirada?.isVisible ?? false)
                if !visible { self.visibleParaVigia = false; self.perro?.invalidate(); self.perro = nil; return }
                if CACurrentMediaTime() - self.ultimaAccion > Fantasma.topeS { self.ocultarYa("perro") }
            }
            RunLoop.main.add(t, forMode: .common)
            perro = t
        }
        if Thread.isMainThread { iniciar() } else { DispatchQueue.main.async(execute: iniciar) }
    }

    /// Vigía fuera del hilo principal (una vez por proceso).
    static func iniciarVigia(congeladoS: Double = Double(ProcessInfo.processInfo.environment["MANOS_FANTASMA_CONGELADO_S"] ?? "") ?? 30) {
        let h = Thread {
            while true {
                sleep(2)
                let f = Fantasma.compartido
                guard f.visibleParaVigia else { continue }
                let quieto = CACurrentMediaTime() - f.latido
                if quieto > congeladoS {
                    FileHandle.standardError.write("manos: hilo principal congelado \(Int(quieto)) s con el Halo a la vista; salgo para que desaparezca\n".data(using: .utf8)!)
                    unlink(Servidor.ruta)
                    exit(3)
                }
            }
        }
        h.name = "manos.vigia-halo"
        h.qualityOfService = .utility
        h.start()
    }

    /// Oculta el Halo y el contorno YA, sin animación ni espera, y deja todo en reposo (cola, relojes, respiración).
    func ocultarYa(_ motivo: String) {
        let ir = { [self] in
            apagar?.cancel(); apagar = nil
            reposoSeguir?.cancel(); reposoSeguir = nil
            reloj?.invalidate(); reloj = nil
            capas?.invalidate(); capas = nil
            perro?.invalidate(); perro = nil
            cola.removeAll(); tramo = nil
            vista?.respirar(false)
            if let panel { panel.alphaValue = 0; panel.orderOut(nil) }
            marcoMirada?.orderOut(nil)
            visibleParaVigia = false
            dueno = nil
            ultimoApagado = motivo
            CursorSistema.liberar("halo_\(motivo)")
        }
        if Thread.isMainThread { ir() } else { DispatchQueue.main.async(execute: ir) }
    }

    /// Se fue (o soltó) la sesión que movía el Halo: se apaga con ella. Otra sesión no apaga el Halo ajeno.
    func soltar(sesiones: Set<String>, motivo: String) {
        guard let d = dueno, sesiones.contains(d) else { return }
        ocultarYa(motivo)
    }

    /// Solo para la prueba de regresión: pierde el reposo programado, como en la falla del 6 oct.
    func sabotearReposo() { DispatchQueue.main.sync { apagar?.cancel(); apagar = nil; reposoSeguir?.cancel() } }

    private func aparecer(sobre ventana: CGWindowID?) {
        latir()
        asegurar()
        guard let panel else { return }
        if NSApp.isHidden { NSApp.unhideWithoutActivation() }
        Fantasma.apilar(panel, sobre: ventana)
        if panel.alphaValue < 1 { NSAnimationContext.runAnimationGroup { $0.duration = 0.18; panel.animator().alphaValue = 1 } }
        apagar?.cancel()
        vista?.respirar(false)
    }

    /// Encola un destino (hilo principal). Si ya está en esa zona y no hay nada pendiente, solo pulsa.
    private func encolar(_ d: Destino) {
        if estilo == "antes" { irAntes(a: d.x, d.y, sobre: d.ventana); if d.pulso { vista?.pulso() }; return }
        aparecer(sobre: d.ventana)
        latir()
        if punta == nil {
            // Primera aparición: entra desde un poco abajo a la derecha, como una mano que llega.
            colocar(d.x + 90, d.y + 70)
        }
        cola.append(d)
        arrancarReloj()
    }

    private func arrancarReloj() {
        if reloj == nil {
            let r = Timer(timeInterval: 1.0 / 120.0, repeats: true) { [weak self] _ in self?.cuadro() }
            RunLoop.main.add(r, forMode: .common)
            reloj = r
        }
    }

    private func cuadro() {
        let ahora = CACurrentMediaTime()
        if tramo == nil {
            guard !cola.isEmpty, let desde = punta else { detener(); return }
            let d = cola.removeFirst()
            var p = ParametrosMovimiento.estandar
            if cola.count >= 2 { p.ritmo = 0.5 }   // el agente va adelante: acortar, nunca saltar
            let mov = Movimiento(desde: CGPoint(x: desde.x, y: desde.y), hasta: CGPoint(x: d.x, y: d.y), parametros: p)
            if let panel, let v = d.ventana { Fantasma.apilar(panel, sobre: v) }
            tramo = (mov, d, ahora, mov.duracionMs == 0 ? ahora : nil)
        }
        guard var tr = tramo else { return }
        if tr.llego == nil {
            let q = tr.mov.punto(enMs: (ahora - tr.t0) * 1000)
            colocar(q.x, q.y)
            if (ahora - tr.t0) * 1000 >= tr.mov.duracionMs { tr.llego = ahora; tramo = tr }
            anotar(false)
            return
        }
        // Hover: un instante posado antes del clic (y la onda al llegar), luego el siguiente destino.
        let hover = tr.hasta.pulso ? (cola.count >= 2 ? 0.04 : 0.09) : 0.0
        if ahora - tr.llego! >= hover {
            if tr.hasta.pulso { vista?.pulso() }
            anotar(tr.hasta.pulso)
            tramo = nil
            if cola.isEmpty { detener() }
        } else { anotar(false) }
    }

    /// Sin acciones: se queda donde actuó, respirando (se nota que piensa), y solo se desvanece tras un reposo largo.
    private func detener() {
        reloj?.invalidate(); reloj = nil
        vista?.respirar(true)
        programarApagado()
        if traza != nil { anotarReposo() }
    }

    /// En reposo la traza sigue anotando a 30 Hz (para probar que no desaparece entre pasos).
    private func anotarReposo() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0 / 30) { [weak self] in
            guard let self, self.traza != nil, self.reloj == nil, (self.panel?.alphaValue ?? 0) > 0.01 else { return }
            self.anotar(false); self.anotarReposo()
        }
    }

    private var reposoSeguir: DispatchWorkItem?

    /// La mano real (HID) o un arrastre se mueven por su cuenta: el Halo va pegado a la punta, sin cola ni animación.
    /// Al quedarse quieta ~250 ms (teclea, piensa) el Halo pasa a reposo: respira y la traza sigue anotando.
    func seguir(x: Double, y: Double, ventana: CGWindowID? = nil, pulso: Bool = false) {
        guard activo else { return }
        let ir = { [self] in
            if panel == nil || (panel?.alphaValue ?? 0) < 1 || !(panel?.isVisible ?? false) { aparecer(sobre: nil) }
            // La mano real trabaja al frente y a la vista de Daniel: el Halo flota encima de todo (si se apilara sobre la
            // ventana objetivo quedaría DEBAJO de ella al subirla: medido en video, 22:58).
            if let panel, panel.level != .floating { Fantasma.apilar(panel, sobre: nil) }
            latir()
            cola.removeAll(); tramo = nil
            reloj?.invalidate(); reloj = nil
            vista?.respirar(false)
            colocar(x, y)
            anotar(pulso)
            if pulso { vista?.pulso() }
            programarApagado()
            reposoSeguir?.cancel()
            let w = DispatchWorkItem { [weak self] in
                guard let self, self.reloj == nil else { return }
                self.vista?.respirar(true)
                if self.traza != nil { self.anotarReposo() }
            }
            reposoSeguir = w
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: w)
        }
        if Thread.isMainThread { ir() } else { DispatchQueue.main.async(execute: ir) }
    }

    /// Antes de que la mano real arranque: si el Halo está visible lejos del cursor real, viaja hasta él (sin saltar).
    func alcanzar(_ destino: CGPoint, ventana: CGWindowID?) {
        var desde: (x: Double, y: Double)?
        DispatchQueue.main.sync { desde = (panel?.alphaValue ?? 0) > 0.05 && (panel?.isVisible ?? false) ? punta : nil }
        guard activo, let d = desde, hypot(d.x - destino.x, d.y - destino.y) > 12 else { return }
        var p = ParametrosMovimiento.estandar; p.ritmo = 0.55
        let m = Movimiento(desde: CGPoint(x: d.x, y: d.y), hasta: destino, parametros: p)
        for (q, ms) in m.muestras(hz: 120) {
            seguir(x: q.x, y: q.y, ventana: ventana)
            _ = ms; usleep(8_333)
        }
    }

    /// El comportamiento anterior (antes del 2 oct 18:18): salto lineal de 0.16 s a cada destino.
    private func irAntes(a x: Double, _ y: Double, sobre ventana: CGWindowID? = nil) {
        asegurar()
        guard let panel else { return }
        if NSApp.isHidden { NSApp.unhideWithoutActivation() }
        let c = Fantasma.aCocoa(x, y)
        let destino = NSRect(x: c.x - VistaFantasma.punta.x, y: c.y - VistaFantasma.punta.y, width: VistaFantasma.lado, height: VistaFantasma.lado)
        if !panel.isVisible {
            panel.setFrame(destino, display: true); panel.alphaValue = 0
            Fantasma.apilar(panel, sobre: ventana)
            NSAnimationContext.runAnimationGroup { $0.duration = 0.12; panel.animator().alphaValue = 1 }
        } else {
            panel.alphaValue = 1
            NSAnimationContext.runAnimationGroup { ctx in ctx.duration = 0.16; ctx.timingFunction = CAMediaTimingFunction(name: .easeOut); panel.animator().setFrame(destino, display: true) }
            Fantasma.apilar(panel, sobre: ventana)
        }
        punta = (x, y)
        // Traza del estilo anterior: muestreo del marco animado.
        if traza != nil { for k in 0...24 { DispatchQueue.main.asyncAfter(deadline: .now() + Double(k) / 120) { [weak self] in
            guard let self, let f = self.panel?.frame, let alto = NSScreen.screens.first?.frame.maxY else { return }
            self.punta = (Double(f.minX + VistaFantasma.punta.x), Double(alto - (f.minY + VistaFantasma.punta.y))); self.anotar(k == 24) } } }
        programarApagado()
    }

    private func programarApagado() {
        latir()
        apagar?.cancel()
        let w = DispatchWorkItem { [weak self] in
            CursorSistema.liberar("halo_reposo")   // el Halo se va: la flecha del sistema vuelve antes
            guard let p = self?.panel else { return }
            self?.vista?.respirar(false)
            NSAnimationContext.runAnimationGroup({ $0.duration = 0.6; p.animator().alphaValue = 0 }, completionHandler: { p.orderOut(nil) })
            if let m = self?.marcoMirada { m.orderOut(nil) }
        }
        apagar = w
        DispatchQueue.main.asyncAfter(deadline: .now() + (estilo == "antes" ? 4 : Fantasma.reposoS), execute: w)
    }

    /// Observar: un contorno tenue recorre la ventana. El fantasma NO se mueve al leer (antes saltaba a la ventana en cada lectura).
    func mirar(_ m: Marco, ventana: CGWindowID? = nil) {
        guard activo else { return }
        DispatchQueue.main.async { [self] in
            if estilo == "antes" { irAntes(a: m.x + min(m.w * 0.5, 160), m.y + 18, sobre: ventana) }
            let c = Fantasma.aCocoa(m.x, m.y + m.h)
            let marco = NSRect(x: c.x - 3, y: c.y - 3, width: m.w + 6, height: m.h + 6)
            let p = marcoMirada ?? Fantasma.panelBase(marco)
            if marcoMirada == nil {
                let v = VistaContorno(frame: NSRect(origin: .zero, size: marco.size))
                p.contentView = v
                marcoMirada = p
            }
            p.setFrame(marco, display: false)
            p.contentView?.frame = NSRect(origin: .zero, size: marco.size)
            p.contentView?.needsDisplay = true
            p.alphaValue = 0
            Fantasma.apilar(p, sobre: ventana)
            latir()
            NSAnimationContext.runAnimationGroup({ $0.duration = 0.15; p.animator().alphaValue = 1 }, completionHandler: {
                NSAnimationContext.runAnimationGroup({ $0.duration = 0.6; p.animator().alphaValue = 0 }, completionHandler: { p.orderOut(nil) })
            })
        }
    }

    /// Actuar: encola el centro del elemento; al llegar, hover y onda morada. La acción ya ocurrió.
    func clic(_ m: Marco, accion: String, ventana: CGWindowID? = nil) {
        guard activo else { return }
        let pulso = accion == "click" || accion == "valor" || accion == "tecla"
        DispatchQueue.main.async { [self] in encolar(Destino(x: m.x + m.w / 2, y: m.y + m.h / 2, pulso: pulso, ventana: ventana)) }
    }

    /// Escritura: el fantasma se posa en el campo (al inicio del texto) sin onda.
    func posar(_ m: Marco, ventana: CGWindowID? = nil) {
        guard activo else { return }
        DispatchQueue.main.async { [self] in encolar(Destino(x: m.x + min(24, m.w / 2), y: m.y + m.h / 2, pulso: false, ventana: ventana)) }
    }

    /// Para demos y evidencia: pone el fantasma en un punto y lo deja ver.
    func mostrar(x: Double, y: Double, pulso: Bool, ventana: CGWindowID? = nil) {
        DispatchQueue.main.async { [self] in encolar(Destino(x: x, y: y, pulso: pulso, ventana: ventana)) }
    }
}

final class VistaFantasma: NSView {
    static let lado: CGFloat = 76
    /// Escala del diseño (u → pt) y punta del cursor dentro de la vista (coordenadas Cocoa de la vista).
    static let escala: CGFloat = 0.75
    /// Antes (22, 18): el trazo redondo de 2.4 u asoma ~0.9 pt más allá del vértice, así que la punta VISIBLE quedaba
    /// arriba-izquierda del punto real (medido en el sprite a 2×, nodo A3). Ahora la punta visible cae en el punto exacto.
    static let punta = NSPoint(x: 21.5, y: lado - 17.2)

    private let cuerpo = CALayer()
    static let imagen: NSImage = dibujar()

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.masksToBounds = false
        let t = VistaFantasma.punta
        cuerpo.frame = bounds
        cuerpo.contents = VistaFantasma.imagen
        cuerpo.contentsScale = NSScreen.main?.backingScaleFactor ?? 2
        // Ancla en la punta: el «press» del clic se encoge hacia donde apunta.
        cuerpo.anchorPoint = CGPoint(x: t.x / bounds.width, y: t.y / bounds.height)
        cuerpo.position = t
        layer?.addSublayer(cuerpo)
    }
    required init?(coder: NSCoder) { fatalError() }

    /// Path del diseño: `M8 6 L13 45 L21 32 L40 28 Z` (y hacia abajo, como en SVG).
    private static func forma(_ dx: CGFloat = 0, _ dy: CGFloat = 0) -> CGPath {
        let p = CGMutablePath()
        p.move(to: CGPoint(x: 8 + dx, y: 6 + dy)); p.addLine(to: CGPoint(x: 13 + dx, y: 45 + dy))
        p.addLine(to: CGPoint(x: 21 + dx, y: 32 + dy)); p.addLine(to: CGPoint(x: 40 + dx, y: 28 + dy)); p.closeSubpath()
        return p
    }

    private static func color(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
        CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: a)
    }

    /// Relleno + trazo redondeado de 2.4 u con un gradiente lineal sobre la caja de la forma.
    private static func pintar(_ ctx: CGContext, _ p: CGPath, _ colores: [CGColor], _ pos: [CGFloat], desde: CGPoint, hasta: CGPoint) {
        ctx.saveGState()
        ctx.addPath(p)
        ctx.addPath(p.copy(strokingWithWidth: 2.4, lineCap: .round, lineJoin: .round, miterLimit: 10))
        ctx.clip(using: .winding)
        let g = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: colores as CFArray, locations: pos)!
        ctx.drawLinearGradient(g, start: desde, end: hasta, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        ctx.restoreGState()
    }

    private static func dibujar() -> NSImage {
        NSImage(size: NSSize(width: lado, height: lado), flipped: true) { _ in
            guard let ctx = NSGraphicsContext.current?.cgContext else { return false }
            let s = escala
            // Punta (8,6) del diseño → (22,18) de la vista (y hacia abajo).
            ctx.translateBy(x: 22 - 8 * s, y: 18 - 6 * s)
            ctx.scaleBy(x: s, y: s)
            // Caja de la forma con su trazo: los gradientes del SVG van en objectBoundingBox.
            let (x0, y0, x1, y1): (CGFloat, CGFloat, CGFloat, CGFloat) = (6.8, 4.8, 42.7, 47.7)
            // Sombra (2,5 · σ3 · #2a0060 50 %) y halo (0,0 · σ13 · #A35BFF 85 %). En un contexto
            // volteado la y de la sombra va al revés; el blur de CG ≈ 2σ, escalado como el diseño.
            // Dos pasadas: una ancha y una cercana, para el resplandor denso del preview.
            for (blur, alfa) in [(40 * s, 1.0), (20 * s, 1.0), (8 * s, 0.85)] as [(CGFloat, CGFloat)] {
                ctx.saveGState()
                ctx.setShadow(offset: CGSize(width: 0, height: 0), blur: blur, color: color(0xA35BFF, alfa))
                ctx.addPath(forma()); ctx.setFillColor(color(0xA35BFF, 0.85)); ctx.fillPath()
                ctx.restoreGState()
            }
            ctx.saveGState()
            ctx.setShadow(offset: CGSize(width: 2 * s, height: -5 * s), blur: 6 * s, color: color(0x2a0060, 0.5))
            ctx.addPath(forma(1.5, 1.5)); ctx.setFillColor(color(0x2E0866)); ctx.fillPath()
            ctx.restoreGState()
            // Canto 3D: la forma desplazada (+1.5, +1.5) con #7B1FE0 → #2E0866 (de arriba-derecha a abajo-izquierda).
            pintar(ctx, forma(1.5, 1.5), [color(0x7B1FE0), color(0x2E0866)], [0, 1], desde: CGPoint(x: x1, y: y0), hasta: CGPoint(x: x0, y: y1))
            // Cuerpo: #E4CCFF → #A35BFF → #5B12B8 en diagonal.
            pintar(ctx, forma(), [color(0xE4CCFF), color(0xA35BFF), color(0x5B12B8)], [0, 0.45, 1], desde: CGPoint(x: x0, y: y0), hasta: CGPoint(x: x1, y: y1))
            // Facetas: cara de luz (blanco 30 %) y cara de sombra (#2a0866 al 20 %).
            let luz = CGMutablePath(); luz.move(to: CGPoint(x: 8, y: 6)); luz.addLine(to: CGPoint(x: 13, y: 45)); luz.addLine(to: CGPoint(x: 21, y: 32)); luz.closeSubpath()
            ctx.addPath(luz); ctx.setFillColor(color(0xffffff, 0.3)); ctx.fillPath()
            let sombra = CGMutablePath(); sombra.move(to: CGPoint(x: 8, y: 6)); sombra.addLine(to: CGPoint(x: 40, y: 28)); sombra.addLine(to: CGPoint(x: 21, y: 32)); sombra.closeSubpath()
            ctx.addPath(sombra); ctx.setFillColor(color(0x2a0866, 0.2)); ctx.fillPath()
            // Punto de luz en la punta: r 1.6 u, blanco 95 %.
            ctx.setFillColor(color(0xffffff, 0.95))
            ctx.fillEllipse(in: CGRect(x: 8 - 1.6, y: 6 - 1.6, width: 3.2, height: 3.2))
            return true
        }
    }

    /// Reposo: el Halo «respira» (brillo y escala muy leves, ~0.45 Hz) mientras el agente piensa entre pasos.
    func respirar(_ si: Bool) {
        if !si { cuerpo.removeAnimation(forKey: "respirar"); return }
        guard cuerpo.animation(forKey: "respirar") == nil else { return }
        let a = CABasicAnimation(keyPath: "opacity"); a.fromValue = 1; a.toValue = 0.72
        let e = CABasicAnimation(keyPath: "transform.scale"); e.fromValue = 1; e.toValue = 0.94
        let g = CAAnimationGroup(); g.animations = [a, e]; g.duration = 1.1; g.autoreverses = true; g.repeatCount = .infinity
        g.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        cuerpo.add(g, forKey: "respirar")
    }

    /// Clic: onda morada de dos anillos (2 px y 1 px) que crece de 0.2× a 1.6× en 0.45 s, y el cursor se
    /// «presiona» a 0.86×. Solo morado.
    func pulso() {
        guard let capa = layer else { return }
        let t = VistaFantasma.punta
        let diametro: CGFloat = 24   // 40 px del diseño × 0.6
        for (i, ancho) in [CGFloat(2), 1].enumerated() {
            let a = CAShapeLayer()
            a.bounds = CGRect(x: 0, y: 0, width: diametro, height: diametro)
            a.position = t
            a.path = CGPath(ellipseIn: a.bounds.insetBy(dx: ancho / 2, dy: ancho / 2), transform: nil)
            a.fillColor = nil
            a.strokeColor = Fantasma.morado.cgColor
            a.lineWidth = ancho
            a.opacity = 0
            capa.insertSublayer(a, below: cuerpo)
            let escala = CABasicAnimation(keyPath: "transform.scale"); escala.fromValue = 0.2; escala.toValue = 1.6
            let alfa = CABasicAnimation(keyPath: "opacity"); alfa.fromValue = 0.95; alfa.toValue = 0
            let g = CAAnimationGroup(); g.animations = [escala, alfa]; g.duration = 0.45
            g.beginTime = CACurrentMediaTime() + Double(i) * 0.08
            g.timingFunction = CAMediaTimingFunction(name: .easeOut)
            g.fillMode = .backwards
            a.add(g, forKey: "onda")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { a.removeFromSuperlayer() }
        }
        let press = CAKeyframeAnimation(keyPath: "transform.scale")
        press.values = [1, 0.86, 1]; press.keyTimes = [0, 0.35, 1]; press.duration = 0.2
        cuerpo.add(press, forKey: "press")
    }
}

final class VistaContorno: NSView {
    override func draw(_ dirty: NSRect) {
        let r = bounds.insetBy(dx: 2, dy: 2)
        let p = NSBezierPath(roundedRect: r, xRadius: 11, yRadius: 11)
        p.lineWidth = 2
        NSGraphicsContext.current?.cgContext.setShadow(offset: .zero, blur: 10, color: Fantasma.morado.cgColor)
        Fantasma.morado.withAlphaComponent(0.85).setStroke()
        p.stroke()
    }
}
