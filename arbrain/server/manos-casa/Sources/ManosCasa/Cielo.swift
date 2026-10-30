import AppKit
import ApplicationServices
import Foundation

/// Entrega de ratón por proceso que SÍ llega a vistas AppKit dibujadas a mano (lienzos), sin mover el cursor real.
///
/// Receta adaptada de Cua Driver (trycua/cua, MIT: `platform-macos/src/input/{mouse,skylight}.rs`),
/// medida contra sfmap el 2 oct 2026. `CGEvent.postToPid` a secas llega a la app, pero AppKit lo descarta:
///   1. Foco sin levantar: registros de 248 bytes por `SLPSPostEventRecordTo` (desenfoca al frente, enfoca la
///      ventana objetivo). La app queda activa para el enrutado de AppKit y su ventana NO sube.
///   2. Cada evento lleva los campos que pone el WindowServer cuando el ratón es real: 1 clickState, 3 botón,
///      7 subtipo, 40 pid, 51 número de ventana, 58 gesto, 91/92 ventana bajo el puntero, y el punto LOCAL de la
///      ventana con `CGEventSetWindowLocation`.
///   3. Un `mouseMoved` cebador antes del `mouseDown` (sin él, AppKit hace hit-test con un estado viejo).
///   4. Se envía por SkyLight (`SLEventPostToPid`) y por la vía pública (`postToPid`): cada una llega donde la otra no.
/// Todo se resuelve con dlsym: si un símbolo falta (otra versión de macOS), se degrada a la vía pública.
enum Cielo {
    private typealias PostToPid = @convention(c) (pid_t, UnsafeMutableRawPointer) -> Void
    private typealias SetIntField = @convention(c) (UnsafeMutableRawPointer, UInt32, Int64) -> Void
    private typealias SetWindowLoc = @convention(c) (UnsafeMutableRawPointer, Double, Double) -> Void
    private typealias PostRecordTo = @convention(c) (UnsafeRawPointer, UnsafePointer<UInt8>) -> Int32
    private typealias GetFront = @convention(c) (UnsafeMutableRawPointer) -> Int32
    private typealias MainCID = @convention(c) () -> UInt32
    private typealias WindowOwner = @convention(c) (UInt32, UInt32, UnsafeMutablePointer<UInt32>) -> Int32
    private typealias ConnPSN = @convention(c) (UInt32, UnsafeMutableRawPointer) -> Int32
    private typealias PSNForPid = @convention(c) (pid_t, UnsafeMutableRawPointer) -> Int32
    private typealias SetFront = @convention(c) (UnsafeRawPointer, UInt32, UInt32) -> Int32

    private static let cargado: Bool = { dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY) != nil }()
    private static func sim<T>(_ n: String, _: T.Type) -> T? {
        _ = cargado
        guard let p = dlsym(UnsafeMutableRawPointer(bitPattern: -2), n) else { return nil } // RTLD_DEFAULT
        return unsafeBitCast(p, to: T.self)
    }
    private static let postToPid = sim("SLEventPostToPid", PostToPid.self)
    private static let setInt = sim("SLEventSetIntegerValueField", SetIntField.self)
    private static let setLoc = sim("CGEventSetWindowLocation", SetWindowLoc.self)
    private static let postRecord = sim("SLPSPostEventRecordTo", PostRecordTo.self)
    private static let getFront = sim("_SLPSGetFrontProcess", GetFront.self)
    private static let mainCID = sim("CGSMainConnectionID", MainCID.self)
    private static let owner = sim("SLSGetWindowOwner", WindowOwner.self)
    private static let connPSN = sim("SLSGetConnectionPSN", ConnPSN.self)
    private static let psnForPid = sim("GetProcessForPID", PSNForPid.self)
    private static let setFront = sim("SLPSSetFrontProcessWithOptions", SetFront.self)

    static var disponible: [String: Bool] {
        ["SLEventPostToPid": postToPid != nil, "SLEventSetIntegerValueField": setInt != nil, "CGEventSetWindowLocation": setLoc != nil,
         "SLPSPostEventRecordTo": postRecord != nil, "_SLPSGetFrontProcess": getFront != nil]
    }

    private static func psn(ventana: CGWindowID, pid: pid_t) -> [UInt8]? {
        var b = [UInt8](repeating: 0, count: 8)
        if let mainCID, let owner, let connPSN {
            var o: UInt32 = 0
            if owner(mainCID(), ventana, &o) == 0, o != 0, b.withUnsafeMutableBytes({ connPSN(o, $0.baseAddress!) }) == 0 { return b }
        }
        if let psnForPid, b.withUnsafeMutableBytes({ psnForPid(pid, $0.baseAddress!) }) == 0 { return b }
        return nil
    }

    private static func registro(_ wid: CGWindowID, _ direccion: UInt8) -> [UInt8] {
        var r = [UInt8](repeating: 0, count: 0xF8)
        r[0x04] = 0xF8; r[0x08] = 0x0D
        withUnsafeBytes(of: wid.littleEndian) { for i in 0..<4 { r[0x3C + i] = $0[i] } }
        r[0x8A] = direccion
        return r
    }

    /// Hace la app activa para el enrutado de eventos SIN subir su ventana ni cambiar de Space.
    @discardableResult
    /// `forzar`: aunque SkyLight diga que ya es el proceso al frente, vuelve a enfocar la ventana. Tras `devolverFoco`
    /// el proceso sigue «al frente» para SkyLight pero el teclado ya volvió a Daniel (falla real del 2 oct, 21:40:
    /// en WhatsApp entraba una escritura sí y otra no).
    static func activarSinLevantar(pid: pid_t, ventana: CGWindowID, forzar: Bool = false) -> Bool {
        guard let postRecord, let getFront, let destino = psn(ventana: ventana, pid: pid) else { return false }
        var previo = [UInt8](repeating: 0, count: 8)
        guard previo.withUnsafeMutableBytes({ getFront($0.baseAddress!) }) == 0 else { return false }
        if previo == destino {
            guard forzar else { return true }
            let b = registro(ventana, 0x01)
            return destino.withUnsafeBytes { p in b.withUnsafeBufferPointer { postRecord(p.baseAddress!, $0.baseAddress!) } } == 0
        }
        let a = registro(ventana, 0x02), b = registro(ventana, 0x01)
        let ok1 = previo.withUnsafeBytes { p in a.withUnsafeBufferPointer { postRecord(p.baseAddress!, $0.baseAddress!) } } == 0
        let ok2 = destino.withUnsafeBytes { p in b.withUnsafeBufferPointer { postRecord(p.baseAddress!, $0.baseAddress!) } } == 0
        return ok1 && ok2
    }

    /// Devuelve el foco de teclado a la ventana clave de quien estaba al frente (el desenfoque de arriba se lo quitó).
    static func devolverFoco(a previoPid: pid_t, desde pid: pid_t, ventana: CGWindowID) {
        guard let postRecord, previoPid != pid else { return }
        let app = AX.app(previoPid)
        var w: CFTypeRef?
        guard AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &w) == .success, let w,
              let wid = AX.windowID(w as! AXUIElement), let pPrevio = psn(ventana: wid, pid: previoPid), let pObj = psn(ventana: ventana, pid: pid) else { return }
        let a = registro(ventana, 0x02), b = registro(wid, 0x01)
        _ = pObj.withUnsafeBytes { p in a.withUnsafeBufferPointer { postRecord(p.baseAddress!, $0.baseAddress!) } }
        _ = pPrevio.withUnsafeBytes { p in b.withUnsafeBufferPointer { postRecord(p.baseAddress!, $0.baseAddress!) } }
    }

    /// Pone la app al frente de verdad (kCPSUserGenerated): la ruta «primer plano» para lo que no acepta lo anterior.
    @discardableResult
    static func alFrente(pid: pid_t, ventana: CGWindowID) -> Bool {
        guard let setFront, let p = psn(ventana: ventana, pid: pid) else { return false }
        return p.withUnsafeBytes { setFront($0.baseAddress!, ventana, 0x200) } == 0
    }

    /// Tecla por SkyLight al proceso (además de la vía pública): con la ventana activada sin levantar, llega a su
    /// ventana clave aunque la app esté de fondo (Chrome ignora `postToPid` de teclado de fondo).
    static func tecla(pid: pid_t, codigo: UInt16, flags: CGEventFlags = []) {
        let fuente = CGEventSource(stateID: .privateState)
        for abajo in [true, false] {
            guard let ev = CGEvent(keyboardEventSource: fuente, virtualKey: CGKeyCode(codigo), keyDown: abajo) else { continue }
            ev.flags = flags
            let ptr = Unmanaged.passUnretained(ev).toOpaque()
            if let postToPid { postToPid(pid, ptr) } else { ev.postToPid(pid) }
            usleep(abajo ? 25_000 : 10_000)
        }
    }

    /// Estampa los campos de enrutado y lo envía por las dos vías.
    static func enviar(_ ev: CGEvent, pid: pid_t, ventana: CGWindowID, local: CGPoint, clickState: Int64, boton: Int64, subtipo: Int64, gesto: Int64) {
        let ptr = Unmanaged.passUnretained(ev).toOpaque()
        setLoc?(ptr, local.x, local.y)
        if let setInt {
            for (f, v) in [(UInt32(1), clickState), (3, boton), (7, subtipo), (51, Int64(ventana)), (58, gesto), (91, Int64(ventana)), (92, Int64(ventana)), (40, Int64(pid))] { setInt(ptr, f, v) }
        } else {
            ev.setIntegerValueField(.mouseEventClickState, value: clickState)
            ev.setIntegerValueField(.mouseEventButtonNumber, value: boton)
        }
        postToPid?(pid, ptr)
        ev.postToPid(pid)
    }
}
