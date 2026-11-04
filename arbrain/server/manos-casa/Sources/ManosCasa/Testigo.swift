import AppKit
import ApplicationServices

/// Testigo de la batería de UX (docs/builds/manos-ux-2026-11-03). Mide lo que Daniel vería, sin tocar nada:
///   - `front`: app al frente (NSWorkspace) y `foco`: dueño y rol del elemento con el foco de teclado de la sesión (AX);
///   - `arriba`: la ventana normal más alta en pantalla que no es de las manos ni del banco de pruebas;
///   - `raton`: el cursor real (no debe moverse nunca: cada quien su cursor);
///   - `halo`/`borde`: las ventanas del proceso medido (76×76 y nivel de barra de estado) con su marco y alfa reales;
///   - `act`: cada activación de app (didActivateApplication), con la hora exacta.
/// Escribe JSON por líneas: una línea por muestra con cambios y una por activación.
enum Testigo {
    static func correr(_ args: [String]) -> Never {
        func valor(_ k: String) -> String? { args.firstIndex(of: k).flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil } }
        let sut = pid_t(valor("--sut") ?? "") ?? 0
        let salida = valor("--salida") ?? "/tmp/manos-ux-testigo.jsonl"
        let vida = valor("--vida") ?? "\(salida).vivo"
        let maxS = Double(valor("--max-s") ?? "") ?? 3600
        let excluir = Set((valor("--excluir") ?? "").split(separator: ",").compactMap { pid_t($0) } + [sut, getpid()])
        FileManager.default.createFile(atPath: salida, contents: nil)
        FileManager.default.createFile(atPath: vida, contents: Data("\(getpid())\n".utf8))
        guard let h = FileHandle(forWritingAtPath: salida) else { exit(2) }
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let t0 = CACurrentMediaTime()
        func ms() -> Double { (Date().timeIntervalSince1970 * 1000).rounded() }
        func escribir(_ j: [String: Any]) {
            guard var d = try? JSONSerialization.data(withJSONObject: j, options: [.sortedKeys]) else { return }
            d.append(0x0A); h.write(d)
        }
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { n in
            let a = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            escribir(["t": ms(), "act": ["pid": Int(a?.processIdentifier ?? 0), "bundle": a?.bundleIdentifier ?? ""]])
        }
        let sistema = AXUIElementCreateSystemWide()
        var previo = ""
        let reloj = Timer(timeInterval: 0.02, repeats: true) { _ in
            if CACurrentMediaTime() - t0 > maxS || !FileManager.default.fileExists(atPath: vida) { try? h.close(); exit(0) }
            var m: [String: Any] = [:]
            let f = NSWorkspace.shared.frontmostApplication
            m["front"] = ["pid": Int(f?.processIdentifier ?? 0), "bundle": f?.bundleIdentifier ?? ""]
            var e: CFTypeRef?
            if AXUIElementCopyAttributeValue(sistema, kAXFocusedUIElementAttribute as CFString, &e) == .success, let e, CFGetTypeID(e) == AXUIElementGetTypeID() {
                var p: pid_t = 0; AXUIElementGetPid(e as! AXUIElement, &p)
                var rol: CFTypeRef?; AXUIElementCopyAttributeValue(e as! AXUIElement, kAXRoleAttribute as CFString, &rol)
                var w: CFTypeRef?; var wid: CGWindowID = 0
                if AXUIElementCopyAttributeValue(e as! AXUIElement, kAXWindowAttribute as CFString, &w) == .success, let w, CFGetTypeID(w) == AXUIElementGetTypeID() { _ = _AXUIElementGetWindow(w as! AXUIElement, &wid) }
                m["foco"] = ["pid": Int(p), "rol": rol as? String ?? "", "ventana": Int(wid)]
            } else { m["foco"] = ["pid": 0] }
            let raton = CGEvent(source: nil)?.location ?? .zero
            m["raton"] = [(Double(raton.x) * 10).rounded() / 10, (Double(raton.y) * 10).rounded() / 10]
            let lista = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
            var tras: String?   // la siguiente ventana bajo el Halo en el orden de capas
            for w in lista {
                if let k = tras { if var hh = m[k] as? [String: Any] { hh["bajo"] = w[kCGWindowNumber as String] as? Int ?? 0; m[k] = hh }; tras = nil }
                let duenoPid = (w[kCGWindowOwnerPID as String] as? Int).map { pid_t($0) } ?? 0
                let capa = w[kCGWindowLayer as String] as? Int ?? 0
                let b = w[kCGWindowBounds as String] as? [String: Double] ?? [:]
                let id = w[kCGWindowNumber as String] as? Int ?? 0
                let alfa = ((w[kCGWindowAlpha as String] as? Double ?? 1) * 1000).rounded() / 1000
                if duenoPid == sut {
                    let nombre = w[kCGWindowName as String] as? String ?? ""
                    let caja: [String: Any] = ["id": id, "x": b["X"] ?? 0, "y": b["Y"] ?? 0, "w": b["Width"] ?? 0, "h": b["Height"] ?? 0, "alfa": alfa, "capa": capa]
                    if nombre == "manos-halo" || (nombre.isEmpty && b["Width"] == Double(VistaFantasma.lado) && b["Height"] == Double(VistaFantasma.lado)) {
                        var hh = caja; hh["punta"] = [(b["X"] ?? 0) + Double(VistaFantasma.punta.x), (b["Y"] ?? 0) + Double(VistaFantasma.lado - VistaFantasma.punta.y)]
                        m["halo"] = hh; tras = "halo"
                    } else if nombre == "manos-marco" { m["marco"] = caja; tras = "marco" }
                    else if nombre == "manos-franja" { m["franja"] = caja }
                    else if m["otra"] == nil { m["otra"] = caja }
                    continue
                }
                if m["arriba"] == nil, capa == 0, !excluir.contains(duenoPid) {
                    m["arriba"] = ["pid": Int(duenoPid), "id": id]
                }
            }
            if let d = try? JSONSerialization.data(withJSONObject: m, options: [.sortedKeys]), let s = String(data: d, encoding: .utf8), s != previo {
                previo = s
                var j = m; j["t"] = ms()
                escribir(j)
            }
        }
        RunLoop.main.add(reloj, forMode: .common)
        app.run()
        exit(0)
    }
}
