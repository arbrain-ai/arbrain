import ApplicationServices
import Foundation

/// Espera inteligente: la UI se dio por asentada cuando la app deja de emitir
/// notificaciones de accesibilidad, no cuando pasa un `sleep` fijo.
///
/// Cua sondea `CGWindowList` cada 50 ms hasta 1 s tras cada clic (su piso de
/// ~1.1 s por acción). Aquí un `AXObserver` por app cuenta eventos en un hilo con
/// run loop propio, y la espera sale en cuanto hay silencio.
final class Asentador {
    static let compartido = Asentador()

    private let candado = NSLock()
    private var observadores: [pid_t: AXObserver] = [:]
    private var contador: [pid_t: Int] = [:]
    private var ultimo: [pid_t: UInt64] = [:]
    private var runLoop: CFRunLoop?
    private let listo = DispatchSemaphore(value: 0)

    static let notificaciones: [String] = [
        kAXValueChangedNotification, kAXUIElementDestroyedNotification, kAXCreatedNotification,
        kAXFocusedUIElementChangedNotification, kAXFocusedWindowChangedNotification, kAXMainWindowChangedNotification,
        kAXWindowCreatedNotification, kAXTitleChangedNotification, kAXSelectedChildrenChangedNotification,
        kAXSelectedRowsChangedNotification, kAXLayoutChangedNotification, kAXRowCountChangedNotification,
        kAXMenuOpenedNotification, kAXMenuClosedNotification, "AXSheetCreated", kAXSelectedTextChangedNotification,
    ]

    private init() {
        let hilo = Thread { [weak self] in
            self?.runLoop = CFRunLoopGetCurrent()
            // Una fuente vacía mantiene vivo el run loop aunque aún no haya observadores.
            var ctx = CFRunLoopSourceContext()
            let fuente = CFRunLoopSourceCreate(nil, 0, &ctx)
            CFRunLoopAddSource(CFRunLoopGetCurrent(), fuente, .defaultMode)
            self?.listo.signal()
            CFRunLoopRun()
        }
        hilo.name = "manos.asentador"
        hilo.qualityOfService = .userInteractive
        hilo.start()
        listo.wait()
    }

    fileprivate func registrar(_ pid: pid_t) {
        candado.lock()
        contador[pid, default: 0] += 1
        ultimo[pid] = DispatchTime.now().uptimeNanoseconds
        candado.unlock()
    }

    /// Engancha la app (una vez por pid). Barato: ~1 ms la primera vez.
    func vigilar(_ pid: pid_t) {
        candado.lock(); let ya = observadores[pid] != nil; candado.unlock()
        if ya { return }
        var obs: AXObserver?
        let cb: AXObserverCallback = { _, _, _, refcon in
            guard let refcon else { return }
            let pid = pid_t(Int(bitPattern: refcon))
            Asentador.compartido.registrar(pid)
        }
        guard AXObserverCreate(pid, cb, &obs) == .success, let obs else { return }
        let app = AX.app(pid)
        let refcon = UnsafeMutableRawPointer(bitPattern: Int(pid))
        for n in Asentador.notificaciones { AXObserverAddNotification(obs, app, n as CFString, refcon) }
        if let rl = runLoop { CFRunLoopAddSource(rl, AXObserverGetRunLoopSource(obs), .defaultMode); CFRunLoopWakeUp(rl) }
        candado.lock(); observadores[pid] = obs; candado.unlock()
    }

    func marca(_ pid: pid_t) -> Int { candado.lock(); defer { candado.unlock() }; return contador[pid] ?? 0 }

    /// Espera a que la app se asiente después de `desde` (una marca previa a la acción).
    /// - primerEvento: si en este tiempo no llegó nada, la acción no produjo cambios visibles (o no los notifica).
    /// - quieto: silencio que define «asentado».
    /// - maximo: tope duro; nunca se espera más.
    func esperar(_ pid: pid_t, desde: Int, primerEvento: Double = 0.12, quieto: Double = 0.05, maximo: Double = 1.2) -> (eventos: Int, ms: Double) {
        let t0 = DispatchTime.now().uptimeNanoseconds
        let ms = { Double(DispatchTime.now().uptimeNanoseconds - t0) / 1e6 }
        while true {
            candado.lock()
            let n = (contador[pid] ?? 0) - desde
            let u = ultimo[pid] ?? 0
            candado.unlock()
            let t = ms()
            if n == 0 && t >= primerEvento * 1000 { return (0, t) }
            if n > 0 {
                let silencio = Double(DispatchTime.now().uptimeNanoseconds - max(u, t0)) / 1e6
                if silencio >= quieto * 1000 { return (n, t) }
            }
            if t >= maximo * 1000 { return (n, t) }
            usleep(3000)
        }
    }

    func olvidar(_ pid: pid_t) {
        candado.lock()
        if let o = observadores.removeValue(forKey: pid), let rl = runLoop { CFRunLoopRemoveSource(rl, AXObserverGetRunLoopSource(o), .defaultMode) }
        contador[pid] = nil; ultimo[pid] = nil
        candado.unlock()
    }
}
