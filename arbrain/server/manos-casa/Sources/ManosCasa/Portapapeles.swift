import AppKit
import Foundation

/// Portapapeles de la Mac: texto, imágenes y archivos. El portapapeles es de Daniel: todo lo que se escribe
/// guarda antes un RESPALDO de lo que tenía, y `pegar` lo devuelve al terminar (lo que copió sigue ahí).
///
///   portapapeles {accion: leer}                               → tipos y texto (recortado)
///   portapapeles {accion: escribir, texto | imagen | archivos} → deja eso copiado (con respaldo)
///   portapapeles {accion: restaurar}                          → devuelve lo que había antes de la última escritura
///   pegar {app, texto | imagen | archivos, x?, y?}            → copia, (clic en x,y), ⌘V por el menú, restaura
enum Portapapeles {
    private static var respaldo: [[NSPasteboard.PasteboardType: Data]]?
    private static var cuentaEscrita = 0

    static func instantanea() -> [[NSPasteboard.PasteboardType: Data]] {
        (NSPasteboard.general.pasteboardItems ?? []).map { item in
            var d: [NSPasteboard.PasteboardType: Data] = [:]
            for t in item.types { if let x = item.data(forType: t) { d[t] = x } }
            return d
        }
    }

    static func reponer(_ items: [[NSPasteboard.PasteboardType: Data]]) {
        let pb = NSPasteboard.general
        pb.clearContents()
        let objs: [NSPasteboardItem] = items.map { d in
            let it = NSPasteboardItem()
            for (t, x) in d { it.setData(x, forType: t) }
            return it
        }
        if !objs.isEmpty { pb.writeObjects(objs) }
    }

    static func leer() -> JSON {
        let pb = NSPasteboard.general
        let tipos = (pb.types ?? []).map(\.rawValue)
        var r: JSON = ["tipos": Array(tipos.prefix(12)), "cambios": pb.changeCount,
                       "imagen": pb.canReadObject(forClasses: [NSImage.self], options: nil),
                       "archivos": (pb.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL])?.map(\.path) ?? []]
        if let t = pb.string(forType: .string) { r["texto"] = String(t.prefix(2000)); r["largo"] = t.count }
        return r
    }

    /// Escribe y devuelve el changeCount nuevo. Guarda respaldo solo si lo que hay NO lo escribimos nosotros.
    static func escribir(_ a: JSON) throws -> JSON {
        let pb = NSPasteboard.general
        if pb.changeCount != cuentaEscrita || respaldo == nil { respaldo = instantanea() }
        if let t = a["texto"] as? String {
            pb.clearContents(); pb.setString(t, forType: .string)
        } else if let ruta = a["imagen"] as? String {
            guard let img = NSImage(contentsOfFile: (ruta as NSString).expandingTildeInPath) else { throw ErrorManos("No pude leer la imagen \(ruta).") }
            pb.clearContents(); pb.writeObjects([img])
        } else if let rutas = a["archivos"] as? [String], !rutas.isEmpty {
            let urls = rutas.map { URL(fileURLWithPath: ($0 as NSString).expandingTildeInPath) as NSURL }
            for u in urls where !FileManager.default.fileExists(atPath: u.path ?? "") { throw ErrorManos("No existe \(u.path ?? "").") }
            pb.clearContents(); pb.writeObjects(urls)
        } else {
            throw ErrorManos("escribir necesita texto, imagen (ruta) o archivos ([rutas]).")
        }
        cuentaEscrita = pb.changeCount
        return ["cambios": pb.changeCount, "respaldo": respaldo?.count ?? 0]
    }

    static func restaurar() -> JSON {
        guard let r = respaldo else { return ["restaurado": false, "detalle": "no había respaldo"] }
        // Si alguien (Daniel) copió algo después de nuestra escritura, NO se pisa.
        if NSPasteboard.general.changeCount != cuentaEscrita { respaldo = nil; return ["restaurado": false, "detalle": "el portapapeles cambió después (lo copió alguien más): se respeta"] }
        reponer(r)
        respaldo = nil
        return ["restaurado": true, "elementos": r.count]
    }

    static func despachar(_ a: JSON) throws -> Any {
        switch a["accion"] as? String ?? "leer" {
        case "leer": return leer()
        case "escribir": return try escribir(a)
        case "restaurar": return restaurar()
        default: throw ErrorManos("portapapeles: accion leer, escribir o restaurar.")
        }
    }

    /// Pegar en una app: copia, opcionalmente hace clic en (x,y) para poner el foco, ⌘V por el menú, y restaura.
    static func pegar(_ a: JSON) throws -> JSON {
        let pid = try Motor.compartido.pid(a)
        var r: JSON = ["escrito": try escribir(a)]
        if Pluma.numero(a["x"]) != nil, Pluma.numero(a["y"]) != nil {
            var c = a; c["devolver_foco"] = false
            r["clic"] = try Pluma.clicXY(c)
        }
        // El ⌘V del menú actúa sobre la ventana CLAVE: en una app de fondo no hay. Se activa la ventana destino
        // sin levantarla (Cielo) y al final se devuelve el foco a la app de Daniel.
        let v = try Pluma.ventana(pid, a["ventana"] as? Int)
        let frente = NSWorkspace.shared.frontmostApplication?.processIdentifier
        Cielo.activarSinLevantar(pid: pid, ventana: v.id)
        usleep(60_000)
        defer { if let f = frente, f != pid { Cielo.devolverFoco(a: f, desde: pid, ventana: v.id) } }
        var t: JSON = ["pid": Int(pid), "accion": "tecla", "tecla": "v", "modificadores": ["cmd"]]
        if let v = a["ventana"] { t["ventana"] = v }
        if let ref = a["ref"] { t["ref"] = ref }
        r["pegado"] = try Motor.compartido.actuar(t)
        if a["restaurar"] as? Bool != false {
            // La app lee el portapapeles al procesar el ⌘V: se le da tiempo antes de devolver lo de Daniel.
            usleep(UInt32((Pluma.numero(a["espera_ms"]) ?? 400) * 1000))
            r["restaurado"] = restaurar()
        }
        return r
    }
}
