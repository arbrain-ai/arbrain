import AVFoundation
import AppKit
import ScreenCaptureKit

/// Grabar una ventana a video (b-roll de Daniel), con ScreenCaptureKit → MP4 (H.264), sin tocar la ventana.
///
///   grabar {accion: iniciar, app, ventana?, ruta?, fps?, fantasma?}  → id de la grabación
///   grabar {accion: parar, grabacion?}   (no `id`: ese campo es el del pedido del socket)                                     → ruta, segundos y tamaño
///   grabar {accion: estado}
///
/// `fantasma: true` (por defecto) graba la ZONA de la pantalla donde está la ventana, para que se vea el
/// cursor fantasma de las manos; `false` graba solo la ventana aunque esté tapada.
/// La grabación vive en ArbrainManos: si la app se cierra, el archivo se cierra con ella.
@available(macOS 15.0, *)
final class Grabadora: NSObject, SCStreamDelegate, SCRecordingOutputDelegate {
    nonisolated(unsafe) static var activas: [String: Grabadora] = [:]
    let id: String, ruta: URL, inicio = Date()
    var stream: SCStream?
    var salida: SCRecordingOutput?
    var error: String?

    init(id: String, ruta: URL) { self.id = id; self.ruta = ruta }

    static func esperar<T>(_ f: @escaping () async throws -> T) throws -> T {
        let listo = DispatchSemaphore(value: 0)
        var r: Result<T, Error> = .failure(ErrorManos("sin respuesta"))
        Task.detached { do { r = .success(try await f()) } catch { r = .failure(error) }; listo.signal() }
        if listo.wait(timeout: .now() + 10) == .timedOut { throw ErrorManos("ScreenCaptureKit no respondió en 10 s") }
        return try r.get()
    }

    func iniciar(ventana wid: CGWindowID, fps: Int, fantasma: Bool) throws {
        let contenido = try Grabadora.esperar { try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false) }
        guard let w = contenido.windows.first(where: { $0.windowID == wid }) else { throw ErrorManos("La ventana \(wid) no está para grabarse.") }
        let filtro: SCContentFilter
        let cfg = SCStreamConfiguration()
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(max(1, min(60, fps))))
        cfg.showsCursor = false
        cfg.capturesAudio = false
        if fantasma, let pantalla = contenido.displays.first(where: { $0.frame.intersects(w.frame) }) {
            // La zona de la ventana dentro de su pantalla (incluye el fantasma, que es otra ventana encima).
            filtro = SCContentFilter(display: pantalla, excludingWindows: [])
            let r = w.frame.offsetBy(dx: -pantalla.frame.minX, dy: -pantalla.frame.minY).intersection(CGRect(origin: .zero, size: pantalla.frame.size))
            cfg.sourceRect = r
            let escala = CGFloat(filtro.pointPixelScale)
            cfg.width = Int(r.width * escala) & ~1; cfg.height = Int(r.height * escala) & ~1
        } else {
            filtro = SCContentFilter(desktopIndependentWindow: w)
            let escala = CGFloat(filtro.pointPixelScale)
            cfg.width = Int(filtro.contentRect.width * escala) & ~1; cfg.height = Int(filtro.contentRect.height * escala) & ~1
        }
        let s = SCStream(filter: filtro, configuration: cfg, delegate: self)
        let rc = SCRecordingOutputConfiguration()
        rc.outputURL = ruta
        rc.outputFileType = .mp4
        rc.videoCodecType = .h264
        let o = SCRecordingOutput(configuration: rc, delegate: self)
        try s.addRecordingOutput(o)
        stream = s; salida = o
        try Grabadora.esperar { try await s.startCapture() }
    }

    func parar() throws -> JSON {
        if let s = stream { try Grabadora.esperar { try await s.stopCapture() } }
        stream = nil
        usleep(300_000) // el MP4 se cierra al soltar la salida
        let tam = (try? FileManager.default.attributesOfItem(atPath: ruta.path)[.size] as? Int) ?? 0
        return ["ruta": ruta.path, "segundos": Date().timeIntervalSince(inicio), "bytes": tam, "error": error ?? NSNull()]
    }

    func stream(_ stream: SCStream, didStopWithError e: Error) { error = "\(e)" }
    func recordingOutput(_ o: SCRecordingOutput, didFailWithError e: Error) { error = "\(e)" }

    static func despachar(_ a: JSON) throws -> Any {
        switch a["accion"] as? String ?? "estado" {
        case "iniciar":
            let pid = try Motor.compartido.pid(a)
            let v = try Pluma.ventana(pid, a["ventana"] as? Int)
            let id = (a["grabacion"] as? String) ?? "g\(Int(Date().timeIntervalSince1970))"
            if activas[id] != nil { throw ErrorManos("Ya hay una grabación «\(id)».") }
            let crudo = (a["ruta"] as? String) ?? "\(NSTemporaryDirectory())manos-\(id).mp4"
            let ruta = URL(fileURLWithPath: (crudo as NSString).expandingTildeInPath)
            try? FileManager.default.removeItem(at: ruta)
            let g = Grabadora(id: id, ruta: ruta)
            try g.iniciar(ventana: v.id, fps: (a["fps"] as? Int) ?? 30, fantasma: a["fantasma"] as? Bool ?? true)
            activas[id] = g
            return ["id": id, "ruta": ruta.path, "ventana": Int(v.id)]
        case "parar":
            let id = (a["grabacion"] as? String) ?? activas.keys.sorted().last ?? ""
            guard let g = activas.removeValue(forKey: id) else { throw ErrorManos("No hay grabación «\(id)» activa.") }
            return try g.parar()
        default:
            return ["activas": activas.map { ["id": $0.key, "ruta": $0.value.ruta.path, "segundos": Date().timeIntervalSince($0.value.inicio)] as JSON }]
        }
    }
}
