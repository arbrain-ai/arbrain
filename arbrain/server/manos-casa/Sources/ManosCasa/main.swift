import AppKit
import Foundation
import ManosNucleo

// ArbrainManos: las manos y ojos propios de Arbrain sobre la Mac.
//
//   (sin argumentos, lanzada por LaunchServices)  → sirve en ~/.config/arbrain/manos.sock
//   ArbrainManos doctor [--pedir]                  → estado de permisos de la app que sirve
//   ArbrainManos llamar '<json>'                   → un pedido crudo al servidor
//
// Los permisos de Accesibilidad y Grabación de pantalla pertenecen a ESTA app
// firmada (ai.arbrain.manos), no a la terminal ni al motor que la llama: por eso
// el cliente nunca ejecuta AX en su propio proceso; siempre le pide a la app.

let argumentos = Array(CommandLine.arguments.dropFirst()).filter { !$0.hasPrefix("-psn_") }
let verbo = argumentos.first ?? ""

func imprimir(_ j: Any) {
    if let d = try? JSONSerialization.data(withJSONObject: j, options: [.prettyPrinted, .sortedKeys]), let s = String(data: d, encoding: .utf8) { print(s) }
}

/// Conecta con la app que sirve; si no corre, la abre por LaunchServices (en segundo plano) y espera su socket.
func conectarOAbrir() -> Int32? {
    if let fd = Cliente.conectar(Servidor.ruta) { return fd }
    // Edición cliente: la copia que viaja dentro de la app (la propia, la que corre este binario).
    let app = ProcessInfo.processInfo.environment["MANOS_CASA_APP"] ?? (Edicion.cliente ? Bundle.main.bundlePath : "\(NSHomeDirectory())/Applications/ArbrainManos.app")
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    p.arguments = ["-g", app]
    try? p.run(); p.waitUntilExit()
    for _ in 0..<100 { usleep(50_000); if let fd = Cliente.conectar(Servidor.ruta) { return fd } }
    return nil
}

switch verbo {
case "doctor":
    guard let fd = conectarOAbrir() else { print("ERROR: no pude abrir ni conectar con ArbrainManos.app"); exit(2) }
    let pedir = argumentos.contains("--pedir")
    guard let r = Cliente.llamar(fd, ["id": 1, "op": pedir ? "pedir_permisos" : "salud"]), let s = r["r"] as? JSON else { print("ERROR: sin respuesta"); exit(2) }
    let ax = s["accesibilidad"] as? Bool == true, pantalla = s["grabacion_pantalla"] as? Bool == true
    print("manos doctor · Arbrain (ArbrainManos.app) \(s["version"] ?? "?") · \(s["identidad"] ?? "?")")
    let nombre = (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String) ?? "Arbrain"
    let bid = Bundle.main.bundleIdentifier ?? "ai.arbrain.manos"
    print("  Accesibilidad ........ \(ax ? "OK" : "FALTA → Configuración › Privacidad y seguridad › Accesibilidad › \(nombre) (el ícono de Arbrain; id \(bid))")")
    print("  Grabación de pantalla  \(pantalla ? "OK" : "FALTA → Configuración › Privacidad y seguridad › Grabación de pantalla › \(nombre) (el ícono de Arbrain; id \(bid))")")
    print("  Cursor fantasma ...... \(s["fantasma"] as? Bool == true ? "encendido" : "apagado") · modo \(s["modo"] ?? "?")")
    if s["sesion_bloqueada"] as? Bool == true { print("  Sesión ............... BLOQUEADA → nada gráfico responde hasta desbloquear la Mac") }
    if let abiertos = s["paneles_abiertos"] as? [String], !abiertos.isEmpty { print("  Abrí el panel: \(abiertos.joined(separator: ", "))") }
    print(ax && pantalla ? "PERMISOS_OK" : "PERMISOS_FALTAN")
    exit(ax && pantalla ? 0 : 1)

case "llamar":
    guard argumentos.count > 1, let d = argumentos[1].data(using: .utf8), var pedido = (try? JSONSerialization.jsonObject(with: d)) as? JSON else {
        print("uso: ArbrainManos llamar '{\"op\":\"apps\"}'"); exit(64)
    }
    pedido["id"] = pedido["id"] ?? 1
    guard let fd = conectarOAbrir(), let r = Cliente.llamar(fd, pedido) else { print("ERROR: sin conexión"); exit(2) }
    imprimir(r)
    exit(r["ok"] as? Bool == true ? 0 : 1)

case "fantasma-png":
    // Revisión del dibujo sin servir: el cursor a 4× sobre fondo oscuro y claro, lado a lado.
    let ruta = argumentos.count > 1 ? argumentos[1] : "fantasma.png"
    let lado = VistaFantasma.lado, k: CGFloat = 4
    if argumentos.contains("--solo") {
        // Solo el sprite a 2× sobre transparente (para componer videos de evidencia desde una traza).
        let s: CGFloat = 2
        let img = NSImage(size: NSSize(width: lado * s, height: lado * s), flipped: false) { _ in
            VistaFantasma.imagen.draw(in: NSRect(x: 0, y: 0, width: lado * s, height: lado * s)); return true
        }
        let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
        try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: ruta))
        print("\(ruta) punta=\(VistaFantasma.punta.x * s),\((lado - VistaFantasma.punta.y) * s)")
        exit(0)
    }
    let lienzo = NSImage(size: NSSize(width: lado * 2 * k, height: lado * k), flipped: false) { _ in
        NSColor(srgbRed: 0.07, green: 0.06, blue: 0.09, alpha: 1).setFill(); NSRect(x: 0, y: 0, width: lado * k, height: lado * k).fill()
        NSColor(srgbRed: 0.93, green: 0.92, blue: 0.95, alpha: 1).setFill(); NSRect(x: lado * k, y: 0, width: lado * k, height: lado * k).fill()
        VistaFantasma.imagen.draw(in: NSRect(x: 0, y: 0, width: lado * k, height: lado * k))
        VistaFantasma.imagen.draw(in: NSRect(x: lado * k, y: 0, width: lado * k, height: lado * k))
        return true
    }
    let rep = NSBitmapImageRep(data: lienzo.tiffRepresentation!)!
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: ruta))
    print(ruta)
    exit(0)

case "movimiento":
    // Evidencia A/B y portado a JS: lee [[x0,y0,x1,y1,semilla],…] por stdin y escribe, por cada par, las muestras
    // del modelo a 120 Hz como [[ms,x,y],…]. Sin servidor ni permisos. Sexto valor opcional: ritmo (1 = normal).
    // `MANOS_MOVIMIENTO_EXACTO=1` escribe sin redondear: lo usa la prueba de paridad con la extensión web
    // (arbrain/server/src/manos/web/paridad-movimiento.ts).
    let entrada = FileHandle.standardInput.readDataToEndOfFile()
    guard let pares = (try? JSONSerialization.jsonObject(with: entrada)) as? [[Double]] else { print("uso: echo '[[x0,y0,x1,y1,semilla(,ritmo)]]' | ArbrainManos movimiento"); exit(64) }
    let exacto = ProcessInfo.processInfo.environment["MANOS_MOVIMIENTO_EXACTO"] == "1"
    let salida = pares.map { p -> [[Double]] in
        var parametros = ParametrosMovimiento.estandar
        if p.count > 5 { parametros.ritmo = p[5] }
        let m = Movimiento(desde: CGPoint(x: p[0], y: p[1]), hasta: CGPoint(x: p[2], y: p[3]), parametros: parametros, semilla: UInt64(p.count > 4 ? p[4] : 1))
        if exacto { return m.muestras(hz: 120).map { [$0.1, $0.0.x, $0.0.y] } }
        return m.muestras(hz: 120).map { [($0.1 * 10).rounded() / 10, ($0.0.x * 100).rounded() / 100, ($0.0.y * 100).rounded() / 100] }
    }
    FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: salida))
    exit(0)

case "simular-persona":
    // SOLO para la prueba en vivo de «una sola flecha» (scripts/prueba-flecha-unica.sh): mueve el ratón como lo haría
    // Daniel (evento SIN la marca de la mano) para comprobar que la flecha del sistema vuelve sola.
    let dx = argumentos.count > 1 ? Double(argumentos[1]) ?? 30 : 30, dy = argumentos.count > 2 ? Double(argumentos[2]) ?? 0 : 0
    let p0 = CGEvent(source: nil)?.location ?? .zero
    let fuente = CGEventSource(stateID: .hidSystemState)
    for k in 1...6 {
        let q = CGPoint(x: p0.x + dx * Double(k) / 6, y: p0.y + dy * Double(k) / 6)
        CGEvent(mouseEventSource: fuente, mouseType: .mouseMoved, mouseCursorPosition: q, mouseButton: .left)?.post(tap: .cghidEventTap)
        usleep(12_000)
    }
    print("movido \(Int(dx)),\(Int(dy)) desde \(Int(p0.x)),\(Int(p0.y))")
    exit(0)

default:
    // Modo app: accesoria (sin Dock, nunca se activa), sirve y dibuja el fantasma.
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    do { try Servidor.iniciar() } catch {
        FileHandle.standardError.write("manos: \(error)\n".data(using: .utf8)!)
        exit(error is ErrorManos && "\(error)".contains("ya hay") ? 0 : 1)
    }
    _ = Asentador.compartido
    // Cada quien su cursor: saber cuándo Daniel toca su ratón o su teclado (permiso y pausa de `via: hid`).
    Vigia.iniciar()
    // El Halo nunca se queda encima: vigía del hilo principal y, en instancias de prueba, salida por inactividad.
    Fantasma.iniciarVigia()
    Salida.vigilar()
    // `open -j` (o un lanzamiento oculto) esconde todas las ventanas de la app, fantasma incluido.
    app.unhideWithoutActivation()
    app.run()
}
