import AppKit
import ApplicationServices

/// Contenido web en el árbol de accesibilidad.
///
/// Chrome, los navegadores Chromium y las apps Electron solo publican la página
/// cuando un lector de pantalla lo pide. Sin esto, `observar` ve la barra y las
/// pestañas pero la página es una caja vacía (falla real del 2 oct, 17:15).
///
///   - `AXManualAccessibility = true`: la vía de Electron y de Chromium moderno; no
///     toca el comportamiento de ventanas.
///   - `AXEnhancedUserInterface = true`: la vía de VoiceOver. Solo si la primera
///     no la acepta la app: algunos gestores de ventanas animan raro con ella.
///
/// Se activa una vez por proceso y se recuerda; si la app se reinicia, el pid cambia
/// y se vuelve a activar sola en la siguiente lectura.
enum Web {
    static let navegadores: Set<String> = [
        "com.google.chrome", "com.google.chrome.beta", "com.google.chrome.dev", "com.google.chrome.canary",
        "org.chromium.chromium", "com.brave.browser", "com.microsoft.edgemac", "company.thebrowser.browser",
        "com.vivaldi.vivaldi", "com.operasoftware.opera",
    ]

    /// pid → vía activada («manual», «enhanced» o «no-aplica»). Solo se toca desde la cola del motor.
    private static var estado: [pid_t: String] = [:]
    static var ultimoDiagnostico: [String: Int] = [:]
    static func olvidar(_ pid: pid_t) { estado[pid] = nil }

    static func esElectron(_ app: NSRunningApplication) -> Bool {
        guard let url = app.bundleURL else { return false }
        return FileManager.default.fileExists(atPath: url.appendingPathComponent("Contents/Frameworks/Electron Framework.framework").path)
    }

    static func esNavegador(_ pid: pid_t) -> Bool {
        guard let b = NSRunningApplication(processIdentifier: pid)?.bundleIdentifier?.lowercased() else { return false }
        return navegadores.contains(b)
    }

    /// Activa el árbol web si la app lo necesita. Devuelve la vía y si se acaba de activar.
    @discardableResult
    static func asegurar(_ pid: pid_t) -> (via: String, recien: Bool) {
        if let v = estado[pid] { return (v, false) }
        guard let app = NSRunningApplication(processIdentifier: pid) else { return ("no-aplica", false) }
        let navegador = navegadores.contains(app.bundleIdentifier?.lowercased() ?? "")
        guard navegador || esElectron(app) else { estado[pid] = "no-aplica"; return ("no-aplica", false) }
        let ax = AX.app(pid)
        let manual = AXUIElementSetAttributeValue(ax, "AXManualAccessibility" as CFString, kCFBooleanTrue)
        ultimoDiagnostico = ["manual": Int(manual.rawValue)]
        var via = "manual"
        if manual != .success {
            // Chrome acepta el atributo pero puede responder «no soportado»: se pide también la vía de VoiceOver.
            let enh = AXUIElementSetAttributeValue(ax, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
            ultimoDiagnostico["enhanced"] = Int(enh.rawValue)
            via = enh == .success ? "enhanced" : "intentado"
        }
        estado[pid] = via
        return (via, true)
    }

    /// Primera área web de una ventana (búsqueda en anchura, poco profunda: la página vive cerca de la raíz).
    static func areaWeb(_ ventana: AXUIElement, profundidad: Int = 12) -> AXUIElement? {
        var cola: [(AXUIElement, Int)] = [(ventana, 0)]
        var i = 0
        while i < cola.count, i < 400 {
            let (e, p) = cola[i]; i += 1
            if AX.string(e, kAXRoleAttribute) == "AXWebArea" { return e }
            if p < profundidad { for h in AX.elementos(AX.attr(e, kAXChildrenAttribute)) { cola.append((h, p + 1)) } }
        }
        return nil
    }

    static func url(_ area: AXUIElement) -> String? {
        guard let v = AX.attr(area, "AXURL") else { return nil }
        if let u = v as? URL { return u.absoluteString }
        if let s = v as? String { return s }
        return nil
    }

    /// Recién activado, Chrome arma el árbol de la página de forma asíncrona: se espera
    /// (tope corto) a que el área web tenga hijos, sin dormir a ciegas.
    static func esperarContenido(_ ventana: AXUIElement, topeMs: Int = 2500) {
        let fin = DispatchTime.now().uptimeNanoseconds + UInt64(topeMs) * 1_000_000
        while DispatchTime.now().uptimeNanoseconds < fin {
            if let a = areaWeb(ventana), !AX.elementos(AX.attr(a, kAXChildrenAttribute)).isEmpty { return }
            usleep(50_000)
        }
    }
}
