import AppKit
import Foundation
import ManosNucleo

/// Socket Unix local (`~/.config/arbrain/manos.sock`, 0600; en la edición cliente, el de la carpeta de datos de la app
/// con token por conexión: Edicion.swift): JSON por líneas.
/// Pedido: {"id":1,"op":"observar",...}. Respuesta: {"id":1,"ok":true,"r":{...}} o {"id":1,"ok":false,"error":"..."}.
/// Conexión persistente: el viaje de ida y vuelta cuesta décimas de milisegundo,
/// no los ~100 ms de lanzar un proceso por llamada.
enum Servidor {
    /// Edición cliente (Edicion.swift): nunca el socket de la instalación original.
    static var ruta: String {
        ProcessInfo.processInfo.environment["MANOS_CASA_SOCKET"].flatMap { $0.isEmpty ? nil : $0 }
            ?? "\(NSHomeDirectory())/.config/\(Edicion.cliente ? "arbrain-cliente" : "arbrain")/manos.sock"
    }
    static let version = "0.2.0"
    /// Candados por ventana entre sesiones (agentes). 15 s desde la última acción.
    static let candados = Candados(duracionMs: Int(ProcessInfo.processInfo.environment["MANOS_CANDADO_MS"] ?? "") ?? 15_000)

    static func iniciar() throws {
        try FileManager.default.createDirectory(atPath: (ruta as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
        if Cliente.conectar(ruta) != nil { throw ErrorManos("ya hay unas manos sirviendo en \(ruta)") }
        unlink(ruta)
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { throw ErrorManos("socket() falló") }
        var dir = sockaddr_un()
        dir.sun_family = sa_family_t(AF_UNIX)
        _ = withUnsafeMutablePointer(to: &dir.sun_path) { p in ruta.withCString { strncpy(UnsafeMutableRawPointer(p).assumingMemoryBound(to: CChar.self), $0, 103) } }
        let tam = socklen_t(MemoryLayout<sockaddr_un>.size)
        guard withUnsafePointer(to: &dir, { bind(fd, UnsafeRawPointer($0).assumingMemoryBound(to: sockaddr.self), tam) }) == 0 else { throw ErrorManos("bind() falló en \(ruta)") }
        chmod(ruta, 0o600)
        guard listen(fd, 16) == 0 else { throw ErrorManos("listen() falló") }
        let hilo = Thread {
            while true {
                let c = accept(fd, nil, nil)
                if c < 0 { continue }
                let h = Thread { atender(c, sesionConexion: "conexion-\(c)-\(UInt32.random(in: 0...UInt32.max))") }
                h.qualityOfService = .userInteractive
                h.start()
            }
        }
        hilo.name = "manos.aceptar"
        hilo.start()
    }

    static func atender(_ fd: Int32, sesionConexion: String) {
        var bufer = Data()
        var trozo = [UInt8](repeating: 0, count: 65536)
        var sesiones: Set<String> = [sesionConexion]
        // Edición cliente (red team 3 M-10): la primera línea trae el token; sin él la conexión se cierra sin ejecutar nada.
        var autenticada = !Edicion.cliente
        while true {
            let n = read(fd, &trozo, trozo.count)
            // Al cerrarse la conexión, sus candados se sueltan: un agente muerto no bloquea a nadie.
            // Y si era quien movía el Halo, el Halo se va con él (falla del 6 oct: encargo detenido, Halo encima horas).
            if n <= 0 { for s in sesiones { candados.soltar(sesion: s) }; Fantasma.compartido.soltar(sesiones: sesiones, motivo: "desconexion"); close(fd); return }
            bufer.append(contentsOf: trozo[0..<n])
            while let i = bufer.firstIndex(of: 0x0A) {
                let linea = bufer.subdata(in: bufer.startIndex..<i)
                bufer.removeSubrange(bufer.startIndex...i)
                guard !linea.isEmpty else { continue }
                var respuesta: Data
                if !autenticada {
                    let pedido = (try? JSONSerialization.jsonObject(with: linea)) as? JSON
                    guard Edicion.tokenValido(pedido?["token"]) else {
                        var no = try! JSONSerialization.data(withJSONObject: ["id": pedido?["id"] ?? NSNull(), "ok": false, "error": "no autorizado: esta conexión no se presentó con el token de Arbrain"])
                        no.append(0x0A)
                        _ = no.withUnsafeBytes { write(fd, $0.baseAddress!, $0.count) }
                        close(fd); return
                    }
                    autenticada = true
                }
                respuesta = responder(linea, sesionConexion: sesionConexion, sesiones: &sesiones)
                respuesta.append(0x0A)
                _ = respuesta.withUnsafeBytes { p in
                    var enviado = 0
                    while enviado < p.count {
                        let w = write(fd, p.baseAddress! + enviado, p.count - enviado)
                        if w <= 0 { break }
                        enviado += w
                    }
                }
            }
        }
    }

    static func responder(_ linea: Data, sesionConexion: String = "local", sesiones: inout Set<String>) -> Data {
        guard let pedido = (try? JSONSerialization.jsonObject(with: linea)) as? JSON else {
            return try! JSONSerialization.data(withJSONObject: ["id": NSNull(), "ok": false, "error": "JSON inválido"])
        }
        let id = pedido["id"] ?? NSNull()
        let t0 = DispatchTime.now().uptimeNanoseconds
        var salida: JSON
        do {
            let sesion = (pedido["sesion"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? sesionConexion
            sesiones.insert(sesion)
            // Concurrencia: actuar toma la ventana. La espera ocurre FUERA de la cola del motor,
            // para que la sesión dueña pueda seguir actuando mientras la otra espera.
            Salida.actividad()
            if pedido["op"] as? String == "soltar" { candados.soltar(sesion: sesion); Fantasma.compartido.soltar(sesiones: [sesion], motivo: "soltar"); return try! JSONSerialization.data(withJSONObject: ["id": id, "ok": true, "r": ["soltado": sesion]]) }
            var llave: Candados.Llave?
            if ["actuar", "medios", "trazo", "clic_xy", "hover", "rueda", "pegar"].contains(pedido["op"] as? String ?? "") {
                llave = try esperarCandado(pedido, sesion: sesion)
                Fantasma.compartido.dueno = sesion
            }
            if pedido["op"] as? String == "fantasma", pedido["x"] != nil { Fantasma.compartido.dueno = sesion }
            let r = try Motor.compartido.cola.sync { try despachar(pedido) }
            if let llave { candados.renovar(llave, sesion: sesion) }
            salida = ["id": id, "ok": true, "r": r]
        } catch {
            salida = ["id": id, "ok": false, "error": "\(error)"]
        }
        salida["ms"] = Double(DispatchTime.now().uptimeNanoseconds - t0) / 1e6
        if let d = try? JSONSerialization.data(withJSONObject: salida) { return d }
        return try! JSONSerialization.data(withJSONObject: ["id": id, "ok": false, "error": "respuesta no serializable"])
    }

    /// Toma la ventana para esta sesión; si otra la tiene, espera hasta `espera_candado_ms` (3 s por defecto)
    /// y si sigue tomada devuelve un error que dice quién la tiene y desde cuándo.
    static func esperarCandado(_ a: JSON, sesion: String) throws -> Candados.Llave {
        let pid = try Motor.compartido.cola.sync { try Motor.compartido.pid(a) }
        let llave = Candados.Llave(pid: pid, ventana: (a["ventana"] as? Int).map { UInt32($0) })
        let esperaMs = (a["espera_candado_ms"] as? Int) ?? 3000
        let fin = DispatchTime.now().uptimeNanoseconds + UInt64(max(0, esperaMs)) * 1_000_000
        while true {
            guard let (suya, toma) = candados.tomar(llave, sesion: sesion, quien: a["quien"] as? String) else { return llave }
            let ahora = DispatchTime.now().uptimeNanoseconds
            if ahora >= fin {
                let hace = Double(ahora - toma.desde) / 1e9, libre = Double(toma.hasta - ahora) / 1e9
                throw ErrorManos(String(format: "ocupada: %@ la está operando otra sesión (%@) desde hace %.1f s; se libera en %.1f s si deja de actuar. Espera y reintenta, o pasa espera_candado_ms.", suya.description, toma.quien ?? toma.sesion, hace, libre))
            }
            usleep(50_000)
        }
    }

    static func despachar(_ a: JSON) throws -> Any {
        let m = Motor.compartido
        switch a["op"] as? String ?? "" {
        case "salud": return Permisos.estado().merging(["version": version, "fantasma": Fantasma.compartido.activo, "modo": m.modo]) { x, _ in x }
        case "pedir_permisos":
            return DispatchQueue.main.sync { Permisos.pedir() }.merging(["version": version, "fantasma": Fantasma.compartido.activo, "modo": m.modo]) { x, _ in x }
        case "apps": return m.apps()
        case "abrir":
            guard let app = a["app"] as? String else { throw ErrorManos("abrir necesita app") }
            return try m.abrir(app)
        case "ventanas": return m.ventanas(pid: (try? m.pid(a)).flatMap { a["pid"] != nil || a["app"] != nil ? $0 : nil })
        case "observar": return try m.observar(a)
        case "actuar": return try m.actuar(a)
        case "verificar": return try m.verificar(a)
        case "contexto": return try m.contexto(a)
        case "medios": return try m.medios(a)
        case "mostrar":
            // Solo por intención «ponme/muéstrame» (lo valida la capa TS): trae la ventana al frente y la deja ahí.
            let pid = try m.pid(a)
            let (v, wid) = try m.ventanaAX(pid, a["ventana"] as? Int)
            AXUIElementPerformAction(v, kAXRaiseAction as CFString)
            DispatchQueue.main.sync { _ = NSRunningApplication(processIdentifier: pid)?.activate(options: []) }
            return ["ventana": Int(wid), "al_frente": true]
        case "pagina":
            let pid = try m.pid(a)
            Web.asegurar(pid)
            let (v, wid) = try m.ventanaAX(pid, a["ventana"] as? Int)
            var r: JSON = ["ventana": Int(wid), "titulo": AX.string(v, kAXTitleAttribute) ?? ""]
            if let area = Web.areaWeb(v) { r["url"] = Web.url(area) ?? ""; r["titulo_pagina"] = AX.string(area, kAXTitleAttribute) ?? "" }
            return r
        case "web":
            let pid = try m.pid(a)
            if a["reintentar"] as? Bool == true { Web.olvidar(pid) }
            let r = Web.asegurar(pid)
            return ["via": r.via, "recien": r.recien, "codigos": Web.ultimoDiagnostico]
        case "candados":
            let ahora = DispatchTime.now().uptimeNanoseconds
            return candados.vigentes(ahora: ahora).map { (k, t) in ["llave": k.description, "sesion": t.sesion, "quien": t.quien ?? "", "hace_s": Double(ahora - t.desde) / 1e9] as JSON }
        case "inspeccionar": return try m.inspeccionar(a)
        case "cursor": return m.cursor()
        case "inactividad": return ["segundos": Vigia.inactividadS()]
        case "colocar": return try m.colocar(a)
        case "modo":
            if let nuevo = a["modo"] as? String { m.modo = nuevo }
            return ["modo": m.modo]
        case "fantasma":
            if let act = a["activo"] as? Bool { Fantasma.compartido.activo = act }
            if let e = a["estilo"] as? String { DispatchQueue.main.sync { Fantasma.compartido.estilo = e } }
            if let t = a["traza"] as? String {
                // Evidencia: «iniciar» limpia y empieza a anotar; «leer» devuelve [t, x, y, alfa, pulso] por cuadro.
                if t == "iniciar" { DispatchQueue.main.sync { Fantasma.compartido.traza = [] } }
                if t == "leer" { return DispatchQueue.main.sync { ["traza": Fantasma.compartido.traza ?? [], "estilo": Fantasma.compartido.estilo] } }
                if t == "parar" { DispatchQueue.main.sync { Fantasma.compartido.traza = nil } }
            }
            // Apagado inmediato (fin o cancelación de un encargo) y, solo para la prueba de regresión, perder el reposo.
            if a["ocultar"] as? Bool == true { Fantasma.compartido.ocultarYa("pedido"); return ["oculto": true] }
            if a["sabotear_reposo"] as? Bool == true { Fantasma.compartido.sabotearReposo() }
            if a["estado"] as? Bool == true { return Fantasma.compartido.estado() }
            if let x = a["x"] as? Double, let y = a["y"] as? Double {
                Fantasma.compartido.mostrar(x: x, y: y, pulso: a["pulso"] as? Bool ?? true, ventana: (a["ventana"] as? Int).map { CGWindowID($0) })
            }
            return ["activo": Fantasma.compartido.activo]
        case "captura":
            guard let w = a["ventana"] as? Int, let ruta = a["ruta"] as? String else { throw ErrorManos("captura necesita ventana y ruta") }
            if let e = Captura.ventana(CGWindowID(w), ruta) { throw ErrorManos(e) }
            return ["ruta": ruta]
        // Lienzos (Pluma.swift): arrastre, clic por coordenadas, ojos con OCR y color de píxel.
        case "trazo": return try Pluma.trazo(a)
        case "clic_xy": return try Pluma.clicXY(a)
        case "hover": return try Pluma.hover(a)
        case "seleccion": return try Pluma.seleccion(a)
        case "rueda": return try Pluma.rueda(a)
        case "ojos": return try Pluma.ojos(a)
        case "cielo": return Cielo.disponible
        case "portapapeles": return try Portapapeles.despachar(a)
        case "pegar": return try Portapapeles.pegar(a)
        case "grabar":
            guard #available(macOS 15.0, *) else { throw ErrorManos("grabar necesita macOS 15") }
            return try Grabadora.despachar(a)
        case "pixel": return try Pluma.pixel(a)
        case "ping": return ["pong": true, "version": version]
        // Saludo de la conexión (edición cliente: lleva el token, ya validado en `atender`).
        case "hola": return ["hola": true, "version": version, "edicion": Edicion.cliente ? "cliente" : "original"]
        default: throw ErrorManos("Operación desconocida: \(a["op"] ?? "")")
        }
    }
}

/// Instancias de PRUEBA (scripts/instancia-prueba.sh): con `MANOS_SALIR_INACTIVA_S` la app sale sola tras N s sin
/// pedidos. Antes una copia de prueba quedó viva del sábado al martes (6 oct) con su Halo y sus relojes.
enum Salida {
    private static let candado = NSLock()
    private static var ultima = Date()
    static func actividad() { candado.lock(); ultima = Date(); candado.unlock() }
    static func vigilar() {
        guard let s = ProcessInfo.processInfo.environment["MANOS_SALIR_INACTIVA_S"].flatMap(Double.init), s > 0 else { return }
        let h = Thread {
            while true {
                sleep(1)
                candado.lock(); let quieta = Date().timeIntervalSince(ultima); candado.unlock()
                if quieta > s { unlink(Servidor.ruta); exit(0) }
            }
        }
        h.name = "manos.salida"
        h.start()
    }
}

/// Cliente mínimo (para `doctor` y `llamar` desde la terminal).
enum Cliente {
    static func conectar(_ ruta: String) -> Int32? {
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        var dir = sockaddr_un()
        dir.sun_family = sa_family_t(AF_UNIX)
        _ = withUnsafeMutablePointer(to: &dir.sun_path) { p in ruta.withCString { strncpy(UnsafeMutableRawPointer(p).assumingMemoryBound(to: CChar.self), $0, 103) } }
        let ok = withUnsafePointer(to: &dir) { connect(fd, UnsafeRawPointer($0).assumingMemoryBound(to: sockaddr.self), socklen_t(MemoryLayout<sockaddr_un>.size)) } == 0
        if !ok { close(fd); return nil }
        return fd
    }

    static func llamar(_ fd: Int32, _ pedido0: JSON) -> JSON? {
        var pedido = pedido0
        if Edicion.cliente, pedido["token"] == nil, let t = Edicion.tokenVigente() { pedido["token"] = t }
        guard var d = try? JSONSerialization.data(withJSONObject: pedido) else { return nil }
        d.append(0x0A)
        _ = d.withUnsafeBytes { write(fd, $0.baseAddress!, $0.count) }
        var bufer = Data()
        var trozo = [UInt8](repeating: 0, count: 65536)
        while true {
            let n = read(fd, &trozo, trozo.count)
            if n <= 0 { return nil }
            bufer.append(contentsOf: trozo[0..<n])
            if let i = bufer.firstIndex(of: 0x0A) { return (try? JSONSerialization.jsonObject(with: bufer.subdata(in: bufer.startIndex..<i))) as? JSON }
        }
    }
}
