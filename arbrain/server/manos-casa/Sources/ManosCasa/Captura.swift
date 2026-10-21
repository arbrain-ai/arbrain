import AppKit
import ScreenCaptureKit
import Vision

/// Ojos de reserva: captura de una ventana con ScreenCaptureKit y OCR con Vision
/// (nada AGPL: es del sistema). Solo cuando el árbol AX no alcanza o se pide.
enum Captura {
    static func imagen(_ wid: CGWindowID) -> CGImage? {
        let listo = DispatchSemaphore(value: 0)
        var resultado: CGImage?
        Task.detached {
            defer { listo.signal() }
            guard let contenido = try? await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false),
                  let ventana = contenido.windows.first(where: { $0.windowID == wid }) else { return }
            let filtro = SCContentFilter(desktopIndependentWindow: ventana)
            let cfg = SCStreamConfiguration()
            let escala = CGFloat(filtro.pointPixelScale)
            cfg.width = Int(filtro.contentRect.width * escala)
            cfg.height = Int(filtro.contentRect.height * escala)
            cfg.showsCursor = false
            resultado = try? await SCScreenshotManager.captureImage(contentFilter: filtro, configuration: cfg)
        }
        _ = listo.wait(timeout: .now() + 5)
        return resultado
    }

    /// Guarda un PNG; devuelve el error en texto o nil.
    static func ventana(_ wid: CGWindowID, _ ruta: String) -> String? {
        guard let img = imagen(wid) else { return "sin captura (¿permiso de Grabación de pantalla?)" }
        let rep = NSBitmapImageRep(cgImage: img)
        guard let png = rep.representation(using: .png, properties: [:]) else { return "no se pudo codificar PNG" }
        do { try png.write(to: URL(fileURLWithPath: ruta)) } catch { return "no se pudo escribir: \(error.localizedDescription)" }
        return nil
    }

    static func ocr(_ wid: CGWindowID) -> String? {
        guard let img = imagen(wid) else { return nil }
        let req = VNRecognizeTextRequest()
        req.recognitionLevel = .accurate
        req.recognitionLanguages = ["es-MX", "en-US"]
        try? VNImageRequestHandler(cgImage: img).perform([req])
        return (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }
}

enum Permisos {
    /// Con la sesión bloqueada casi nada gráfico responde (AX lento o vacío): se dice en vez de fallar raro.
    static func sesionBloqueada() -> Bool {
        guard let d = CGSessionCopyCurrentDictionary() as? [String: Any] else { return false }
        return (d["CGSSessionScreenIsLocked"] as? Bool) == true
    }

    static func estado() -> [String: Any] {
        let ax = AXIsProcessTrusted()
        let pantalla = CGPreflightScreenCaptureAccess()
        return ["accesibilidad": ax, "grabacion_pantalla": pantalla, "ok": ax && pantalla, "sesion_bloqueada": sesionBloqueada(),
                "identidad": Bundle.main.bundleIdentifier ?? "(sin bundle: corre fuera de ArbrainManos.app)",
                "ruta": Bundle.main.bundlePath]
    }

    /// Registra la app en las listas de Privacidad y abre el panel exacto que falta.
    static func pedir() -> [String: Any] {
        var e = estado()
        var abierto: [String] = []
        if e["accesibilidad"] as? Bool != true {
            _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
            NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!)
            abierto.append("Accesibilidad")
        }
        if e["grabacion_pantalla"] as? Bool != true {
            _ = CGRequestScreenCaptureAccess()
            if abierto.isEmpty { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!) }
            abierto.append("Grabación de pantalla")
        }
        e["paneles_abiertos"] = abierto
        return e
    }
}
