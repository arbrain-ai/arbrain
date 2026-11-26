"""Pruebas del mapa vivo (mapa.py) y de su base de capítulos (canvas/scripts/lienzo_vivo.py): nunca inventa, lo
pendiente se queda pendiente, cuatro capítulos con encuadre de pantalla, piezas con sus datos adentro y respeto a lo
que una mano tocó en el Lienzo.

    python3 -m unittest discover -s .claude/skills/mapa-vivo/tests

Datos inventados (references/ejemplo.json y el ejemplo de la Radiografía): nunca de un cliente real.
"""
import copy
import importlib.util
import io
import json
import os
import re
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SKILLS = AQUI.parents[1]


def cargar(nombre, ruta):
    spec = importlib.util.spec_from_file_location(nombre, ruta)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M = cargar("mapa", AQUI.parent / "scripts" / "mapa.py")
LV = M.LV
EJEMPLO = json.loads((AQUI.parent / "references" / "ejemplo.json").read_text(encoding="utf-8"))
RADIOGRAFIA = SKILLS / "radiografia" / "references" / "ejemplo.json"


def correr(*args):
    buf = io.StringIO()
    with redirect_stdout(buf):
        codigo = M.main(list(args))
    return codigo, json.loads(buf.getvalue())


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.dir = self.raiz / "cliente"
        self.dir.mkdir()
        self._env = {k: os.environ.get(k) for k in ("ARBRAIN_RAIZ", "MISSION_CONTROL_ORIGIN", "ARBRAIN_PASE_AGENTE")}
        os.environ["ARBRAIN_RAIZ"] = str(self.raiz)
        os.environ.pop("MISSION_CONTROL_ORIGIN", None)
        os.environ.pop("ARBRAIN_PASE_AGENTE", None)

    def tearDown(self):
        for k, v in self._env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        self.tmp.cleanup()

    def poner(self, datos):
        (self.dir / "mapa.json").write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")

    def args(self, orden, *mas):
        return (orden, "--carpeta", str(self.dir), *mas)


class Revisar(Base):
    def test_el_ejemplo_pasa_y_dice_lo_que_esta_por_medir(self):
        self.poner(EJEMPLO)
        codigo, out = correr(*self.args("revisar"))
        self.assertEqual(codigo, 0)
        self.assertEqual(out["por_medir"], ["Adquisición", "Bienvenida"])
        self.assertEqual(out["faltan"], [])
        self.assertTrue(out["ejemplo"])
        self.assertEqual(out["oferta"], {"firmado": 3, "opera": 0, "abierto": 5, "pendiente": 2, "idea": 1})

    def test_una_pieza_sin_texto_cuenta_como_pendiente_aunque_diga_firmada(self):
        d = copy.deepcopy(EJEMPLO)
        d["oferta"]["hoja"][5] = {"n": 6, "texto": "", "estado": "firmado"}
        self.poner(d)
        _, out = correr(*self.args("revisar"))
        self.assertEqual(out["oferta"]["firmado"], 3)

    def test_las_seis_etapas_en_orden_o_no_se_dibuja(self):
        d = copy.deepcopy(EJEMPLO)
        d["sistema"]["etapas"].pop()
        self.poner(d)
        codigo, out = correr(*self.args("lienzo"))
        self.assertEqual(codigo, 2)
        self.assertTrue(any("seis" in e for e in out["errores"]))
        self.assertFalse((self.dir / "mapa").exists())

    def test_un_hilo_a_un_destino_que_no_existe_es_error(self):
        d = copy.deepcopy(EJEMPLO)
        d["vehiculo"]["pasos"][0]["hilos"] = ["Cobranza"]
        self.poner(d)
        codigo, out = correr(*self.args("revisar"))
        self.assertEqual(codigo, 2)
        self.assertIn("Cobranza", " ".join(out["errores"]))

    def test_color_y_motivo_de_marca_se_validan(self):
        d = copy.deepcopy(EJEMPLO)
        d["marca"] = {"acento": "naranja", "motivo": "martillo"}
        self.poner(d)
        codigo, out = correr(*self.args("revisar"))
        self.assertEqual(codigo, 2)
        self.assertEqual(len(out["errores"]), 2)

    def test_avisa_si_el_mapa_de_un_cliente_nombra_la_ia(self):
        d = copy.deepcopy(EJEMPLO)
        d["vehiculo"]["pasos"][0]["detalle"] = "Un agente de IA contesta las cotizaciones."
        self.poner(d)
        _, out = correr(*self.args("revisar"))
        self.assertTrue(any("IA" in a for a in out["avisos"]))

    def test_un_numero_sin_fecha_se_avisa(self):
        d = copy.deepcopy(EJEMPLO)
        del d["sistema"]["etapas"][1]["numero"]["medido_en"]
        self.poner(d)
        _, out = correr(*self.args("revisar"))
        self.assertTrue(any("Nutrición" in a for a in out["avisos"]))


class Armar(Base):
    def test_cinco_piezas_con_su_ficha_y_sus_datos_adentro(self):
        self.poner(EJEMPLO)
        codigo, out = correr(*self.args("armar"))
        self.assertEqual(codigo, 0)
        self.assertEqual(len(out["piezas"]), 5)
        for pid in ("ondas", "nervio", "escalera", "hoja", "hilos"):
            html = (self.dir / "mapa" / f"{pid}.html").read_text(encoding="utf-8")
            ficha = LV.ficha_de(html)
            self.assertEqual(ficha["id"], pid)
            self.assertEqual(ficha["fondo"], "transparente")
            self.assertEqual(ficha["ancho"], 1600)
            self.assertNotRegex(html, r"(?m)^(import|export) ")            # ya no es un módulo: corre dentro del Lienzo
            self.assertIn("Ferretería La Tuerca", html)                     # sus datos viajan adentro
            self.assertIn("function montar(raiz, ctx, D)", html)
        self.assertEqual(LV.ficha_de((self.dir / "mapa" / "hilos.html").read_text(encoding="utf-8"))["pasos"], 6)
        self.assertEqual(LV.ficha_de((self.dir / "mapa" / "nervio.html").read_text(encoding="utf-8"))["pasos"], 3)

    def test_un_dato_no_puede_cerrar_el_script_de_la_pieza(self):
        d = copy.deepcopy(EJEMPLO)
        d["norte"]["tierra"] = "</script><script>alert(1)</script>"
        self.poner(d)
        correr(*self.args("armar"))
        html = (self.dir / "mapa" / "ondas.html").read_text(encoding="utf-8")
        self.assertNotIn("</script><script>alert(1)", html)
        self.assertEqual(html.count("</script>"), 2)                        # la ficha y el cuerpo, nada más

    def test_cuatro_capitulos_de_pantalla_y_ningun_marco_suelto(self):
        self.poner(EJEMPLO)
        _, out = correr(*self.args("armar"))
        self.assertEqual([c["titulo"] for c in out["capitulos"]], ["Tu norte", "El sistema nervioso", "La oferta", "El vehículo"])
        self.assertEqual(out["avisos"], [])
        d = M.leer_datos(self.dir)
        P = M.pagina(d, M.armar_piezas(d, self.dir / "mapa"), self.dir / "mapa")
        marcos = [e for e in P.els if e["type"] == "frame"]
        caps = [e for e in marcos if e["id"].startswith("cap:")]
        self.assertEqual(len(caps), 4)
        for c in caps:
            self.assertAlmostEqual(c["width"] / c["height"], 16 / 9, places=2)
            self.assertTrue(c["title"] and c["tema"] and c["capitulo"])
        dentro = lambda e, c: c["x"] <= e["x"] + e["width"] / 2 <= c["x"] + c["width"] and c["y"] <= e["y"] + e["height"] / 2 <= c["y"] + c["height"]
        for m in marcos:
            if m not in caps:                                               # una tarjeta suelta se anunciaría como capítulo
                self.assertTrue(any(dentro(m, c) for c in caps), m["id"])
        self.assertEqual(len([e for e in P.els if e["type"] == "embed"]), 5)
        for e in P.els:
            self.assertTrue(e["gen"])
            if e["type"] == "embed":
                self.assertTrue(e["pieza"].startswith("doc:") and e["pieza"].endswith(".html"))

    def test_el_mapa_propio_habla_en_primera_persona(self):
        d = copy.deepcopy(EJEMPLO)
        d["para"] = "propio"
        self.poner(d)
        _, out = correr(*self.args("armar"))
        self.assertEqual(out["capitulos"][0]["titulo"], "Mi norte")
        self.assertNotIn("(ejemplo)", "Mapa vivo · X")
        self.assertIn("(ejemplo)", out["pagina"])

    def test_el_costo_se_dibuja_a_escala_cuando_hay_con_que(self):
        d = copy.deepcopy(EJEMPLO)
        d["vehiculo"]["costo"] = {"mes": "≈ 3,600 EUR", "mes_num": 3600}
        x = M.completar(d)
        self.assertEqual([b["valor"] for b in x["vehiculo"]["costo"]["escala"]], [3600.0, 4000.0])
        d["norte"]["meta"]["a"] = ""                                         # sin meta en número, no se inventa la comparación
        self.assertNotIn("escala", M.completar(d)["vehiculo"]["costo"])

    def test_sin_la_app_no_escribe_y_lo_dice(self):
        self.poner(EJEMPLO)
        codigo, out = correr(*self.args("lienzo"))
        self.assertEqual(codigo, 0)
        self.assertEqual(out["lienzo"], "sin_app")
        self.assertTrue((self.dir / "mapa" / "nervio.html").exists())


class Nuevo(Base):
    def test_siembra_con_la_radiografia_y_no_inventa(self):
        (self.dir / "radiografia.json").write_text(RADIOGRAFIA.read_text(encoding="utf-8"), encoding="utf-8")
        codigo, out = correr(*self.args("nuevo"))
        self.assertEqual(codigo, 0, out)
        d = json.loads((self.dir / "mapa.json").read_text(encoding="utf-8"))
        self.assertEqual(d["negocio"], "Ferretería La Tuerca")
        self.assertTrue(d["ejemplo"])
        self.assertEqual(d["para"], "cliente")
        et = {e["etapa"]: e for e in d["sistema"]["etapas"]}
        self.assertIsNone(et["Adquisición"]["numero"]["valor"])              # no lo sabía: se queda por medir
        self.assertEqual(et["Conversión"]["numero"]["valor"], "12 de 35")
        self.assertEqual(et["Conversión"]["a_mano"]["horas_mes"], 30)        # 35 veces × 12 min × 4.33 semanas
        self.assertFalse(et["Bienvenida"]["opera_hoy"])
        self.assertEqual(d["sistema"]["cuello"]["etapa"], "Conversión")
        self.assertEqual(d["sistema"]["cuello"]["se_van"], "")               # eso se le pregunta al dueño
        pasos = d["vehiculo"]["pasos"]
        self.assertEqual(pasos[0]["hilos"], ["Conversión"])                  # primero, lo que ataca el cuello
        self.assertEqual(pasos[0]["peso"], 3)
        self.assertIn("2,600", pasos[0]["recupera"])
        self.assertEqual(d["vehiculo"]["costo"]["mes"], "≈ 3,600 EUR")
        self.assertEqual(d["norte"]["porque"]["estado"], "pendiente")        # nadie lo dijo: no se escribe por él
        self.assertEqual([x["estado"] for x in d["oferta"]["hoja"]].count("pendiente"), 10)
        codigo, out = correr(*self.args("revisar"))
        self.assertEqual(codigo, 0)
        self.assertTrue(any("porque" in f for f in out["faltan"]))
        self.assertTrue(any("se_van" in f for f in out["faltan"]))
        codigo, out = correr(*self.args("armar"))                            # y aun con huecos, se puede dibujar
        self.assertEqual(codigo, 0, out)

    def test_no_empieza_otro_mapa_encima(self):
        self.poner(EJEMPLO)
        codigo, out = correr(*self.args("nuevo", "--negocio", "Otro"))
        self.assertEqual(codigo, 3)
        self.assertIn("continúa", out["alto"])

    def test_sin_nombre_no_hay_mapa(self):
        codigo, out = correr(*self.args("nuevo"))
        self.assertEqual(codigo, 2)

    def test_el_propio_siembra_con_su_embudo_y_su_oferta(self):
        emb = {"esquema": "arbrain.embudo/v1", "negocio": "Consultoría Ejemplo", "embudos": [
            {"id": "canal", "nombre": "Mi canal", "tipo": "piso", "estado": "por construir"},
            {"id": "dx", "nombre": "El diagnóstico", "tipo": "oferta", "frase": "Te dibujo tu embudo."}],
            "etapas": [{"id": "dx.conversion", "orden": 3, "embudo": "dx", "etapa": "Conversión", "nombre": "La llamada",
                        "que_pasa": "Llamada de 30 minutos.", "opera_hoy": True, "ejecuta": [{"tipo": "persona", "rol": "fundador"}],
                        "mide": {"nombre": "Llamadas que cierran", "valor": None}, "cuello": {"es": True, "frase": "Pocas llamadas."}}]}
        (self.dir / "embudo.json").write_text(json.dumps(emb, ensure_ascii=False), encoding="utf-8")
        (self.dir / "02-oferta.md").write_text(
            "# Mi oferta\n\n> En 60 días tu taller cotiza solo.\n\n| # | Pieza | Estado |\n|---|---|---|\n| 1 | Avatar | firmada |\n| 2 | Promesa | borrador |\n\n"
            "## 1 · Avatar\n- A quién (industria): Talleres de 5 a 15 personas.\n\n## 2 · Promesa\n- Resultado: Cotizar el mismo día.\n\n## 3 · Vehículo\n- Nombre del método:\n",
            encoding="utf-8")
        codigo, out = correr(*self.args("nuevo", "--propio"))
        self.assertEqual(codigo, 0, out)
        d = json.loads((self.dir / "mapa.json").read_text(encoding="utf-8"))
        self.assertEqual(d["para"], "propio")
        self.assertEqual([e["nombre"] for e in d["oferta"]["escalera"]], ["Mi canal", "El diagnóstico"])
        self.assertEqual(d["oferta"]["escalera"][0]["estado"], "pendiente")
        self.assertTrue(d["oferta"]["escalera"][1]["frente"])
        self.assertEqual(d["oferta"]["hoja"][0], {"n": 1, "texto": "Talleres de 5 a 15 personas.", "estado": "firmado"})
        self.assertEqual(d["oferta"]["hoja"][1]["estado"], "abierto")
        self.assertEqual(d["oferta"]["hoja"][2]["estado"], "pendiente")
        self.assertEqual(d["oferta"]["en_corto"], "En 60 días tu taller cotiza solo.")
        self.assertEqual(d["sistema"]["cuello"]["etapa"], "Conversión")
        self.assertEqual(d["sistema"]["etapas"][2]["quien"], ["tú"])


class LaManoManda(unittest.TestCase):
    """La fusión de `lienzo_vivo`: lo que una mano tocó en el Lienzo no se pisa."""

    def pagina(self):
        P = LV.Pagina("Prueba")
        c = P.capitulo("a", "Uno", tesis="Una tesis.")
        P.texto("a:nota", c.x0, c.baja(60), "Hola", 44)
        P.capitulo("b", "Dos")
        return P

    def test_primera_vez_todo_es_nuevo_y_queda_firmado(self):
        els, cuenta = self.pagina().fusionar([], None)
        self.assertEqual(cuenta["nuevos"], len(els))
        self.assertTrue(all(e["gsig"] == LV.firma(e) for e in els))

    def test_lo_movido_lo_bloqueado_y_lo_ajeno_se_respetan(self):
        previos, _ = self.pagina().fusionar([], None)
        man = {"ids": [e["id"] for e in previos]}
        movido = next(e for e in previos if e["id"] == "a:nota")
        movido["x"] += 500                                                   # la mano lo movió: su firma ya no cuadra
        movido["text"] = "Lo que escribió el dueño"
        previos.append({"id": "suyo", "type": "text", "x": 0, "y": 0, "width": 10, "height": 10, "rotation": 0, "zIndex": 1, "autor": "humano"})
        previos = [e for e in previos if e["id"] != "a:tesis"]               # y borró la tesis
        els, cuenta = self.pagina().fusionar(previos, man)
        por = {e["id"]: e for e in els}
        self.assertEqual(por["a:nota"]["text"], "Lo que escribió el dueño")
        self.assertTrue(por["a:nota"]["mano"])
        self.assertIn("suyo", por)
        self.assertNotIn("a:tesis", por)
        self.assertEqual((cuenta["de_la_mano"], cuenta["no_repuestos"], cuenta["ajenos"]), (1, 1, 1))
        self.assertEqual(cuenta["borrados"], ["a:tesis"])
        els2, cuenta2 = self.pagina().fusionar(els, {"ids": man["ids"], "borrados": cuenta["borrados"]})
        self.assertEqual({e["id"] for e in els2}, set(por))                  # la segunda corrida no cambia nada
        self.assertEqual(cuenta2["de_la_mano"], 1)

    def test_un_resto_mio_que_nadie_toco_se_retira(self):
        previos, _ = self.pagina().fusionar([], None)
        viejo = {"id": "a:viejo", "type": "text", "x": 1, "y": 2, "width": 3, "height": 4, "rotation": 0, "zIndex": 1, "gen": True}
        viejo["gsig"] = LV.firma(viejo)
        els, cuenta = self.pagina().fusionar(previos + [viejo], {"ids": [e["id"] for e in previos] + ["a:viejo"]})
        self.assertNotIn("a:viejo", {e["id"] for e in els})
        self.assertEqual(cuenta["retirados"], 1)

    def test_el_spec_declarativo_arma_capitulos_sin_coordenadas(self):
        with tempfile.TemporaryDirectory() as t:
            spec = Path(t) / "clase.json"
            spec.write_text(json.dumps({"nombre": "Clase", "titular": "Cómo cotizamos", "capitulos": [
                {"id": "hoy", "titulo": "Cómo es hoy", "tesis": "Cada cotización espera dos días.", "bloques": [
                    {"tipo": "frases", "lista": [{"ceja": "El dolor", "texto": "«Ya compraron»", "estado": "firmado"}]},
                    {"tipo": "texto", "texto": "Una lista de precios por tipo de obra."}]},
                {"id": "manana", "titulo": "Cómo será", "bloques": []}]}, ensure_ascii=False), encoding="utf-8")
            buf = io.StringIO()
            with redirect_stdout(buf):
                codigo = LV.main(["capitulos", str(spec)])
            out = json.loads(buf.getvalue())
            self.assertEqual(codigo, 0)
            self.assertEqual([c["titulo"] for c in out["capitulos"]], ["Cómo es hoy", "Cómo será"])
            self.assertEqual(out["avisos"], [])

    def test_los_estados_se_leen_igual_en_python_y_en_el_kit(self):
        casos = {"firmada": "firmado", "Medido 13 nov": "firmado", "opera hoy": "opera", "borrador": "abierto", "abierto": "abierto",
                 "idea": "idea", "vacía": "pendiente", "por medir": "pendiente", "por construir": "pendiente", "": "pendiente", None: "pendiente"}
        for entrada, esperado in casos.items():
            self.assertEqual(LV.estado_de(entrada), esperado, entrada)
        kit = (SKILLS / "canvas" / "assets" / "pieza" / "kit.js").read_text(encoding="utf-8")
        for patron in ("firmad|decidid|medid|hecho|listo", "opera|activo|funciona|vivo", "abiert|borrador|en curso|por decidir", "idea|mas adelante|algun dia"):
            self.assertIn(patron, kit)                                       # las mismas reglas en los dos lados
            self.assertIn(patron, Path(LV.__file__).read_text(encoding="utf-8"))


def _png(ruta: Path, w: int, h: int) -> Path:
    """Un PNG real y mínimo (sin dependencias): una sola fila de color repetida."""
    import struct, zlib
    def trozo(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    filas = b"".join(b"\x00" + b"\xc8\x96\x32" * w for _ in range(h))
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_bytes(b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                     + trozo(b"IDAT", zlib.compress(filas)) + trozo(b"IEND", b""))
    return ruta


class ImagenesYLogos(Base):
    """Imágenes y logos en un capítulo (nativos) y en una pieza (por su ficha), sin deformarse y sin inventar logos."""

    def setUp(self):
        super().setUp()
        self.foto = _png(self.raiz / "clase" / "img" / "escena.png", 160, 90)
        self.wa = _png(self.raiz / "logos" / "whatsapp.png", 40, 40)

    def test_la_proporcion_se_lee_de_png_jpeg_webp_y_gif_sin_dependencias(self):
        import struct
        self.assertEqual(LV.proporcion(self.foto), (160, 90))
        jpg = self.raiz / "a.jpg"
        jpg.write_bytes(b"\xff\xd8" + b"\xff\xe0" + struct.pack(">H", 4) + b"JF" + b"\xff\xc0" + struct.pack(">HBHH", 11, 8, 300, 640) + b"\x03")
        self.assertEqual(LV.proporcion(jpg), (640, 300))
        webp = self.raiz / "a.webp"
        webp.write_bytes(b"RIFF" + b"\x00" * 4 + b"WEBP" + b"VP8X" + b"\x00" * 8 + (1535).to_bytes(3, "little") + (863).to_bytes(3, "little"))
        self.assertEqual(LV.proporcion(webp), (1536, 864))
        gif = self.raiz / "a.gif"
        gif.write_bytes(b"GIF89a" + struct.pack("<HH", 12, 7))
        self.assertEqual(LV.proporcion(gif), (12, 7))
        txt = self.raiz / "a.png"
        txt.write_text("no soy imagen")
        with self.assertRaises(ValueError):
            LV.proporcion(txt)

    def test_una_imagen_nativa_conserva_su_proporcion_y_su_capitulo(self):
        P = LV.Pagina("Clase")
        c = P.capitulo("uno", "Uno", tesis="Una frase con postura.")
        P.capitulo("dos", "Dos")
        e = P.imagen("uno:foto", c.x0, c.baja(900), 1600, "clase/img/escena.png", tema=c.tema, aparece="Uno")
        self.assertEqual((e["type"], e["width"], e["height"]), ("image", 1600, 900))
        self.assertEqual(e["src"], self.foto.resolve().as_posix())
        self.assertEqual((e["ruta"], e["tema"], e["aparece"]), ("clase/img/escena.png", "Uno", "Uno"))
        # en una caja más alta que la imagen: cabe y se centra, no se estira
        e2 = P.imagen("uno:foto2", 0, 0, 1600, self.foto, alto=1600)
        self.assertEqual((e2["width"], e2["height"], e2["y"]), (1600, 900, 350))
        self.assertEqual([a for a in P.revisar() if "se sale" in a], [])
        # El Lienzo carga del disco solo rutas /Users, /Volumes o ~/ (la carpeta temporal de la prueba no lo es): lo avisa.
        if not LV.carga_del_disco(self.foto.resolve()):
            self.assertTrue(any("ponla dentro de una pieza" in a for a in P.revisar()))

    def test_el_lienzo_solo_carga_imagenes_nativas_de_sus_raices(self):
        self.assertTrue(LV.carga_del_disco("/" + "Volumes/disco/foto.png"))
        self.assertTrue(LV.carga_del_disco(Path("~/fotos/foto.png")))
        self.assertFalse(LV.carga_del_disco("/tmp/foto.png"))
        self.assertFalse(LV.carga_del_disco("C:/fotos/foto.png"))

    def test_una_imagen_que_no_existe_o_vive_fuera_no_entra(self):
        P = LV.Pagina("Clase")
        with self.assertRaisesRegex(ValueError, "no existe"):
            P.imagen("x", 0, 0, 100, "clase/img/nada.png")
        afuera = _png(Path(tempfile.mkdtemp()) / "afuera.png", 10, 10)
        with self.assertRaisesRegex(ValueError, "dentro de la carpeta de Arbrain"):
            P.imagen("y", 0, 0, 100, afuera)

    def test_un_logo_es_un_archivo_real_o_no_va(self):
        P = LV.Pagina("Clase")
        e = P.logo("lg", 0, 0, 140, "logos/whatsapp.png")
        self.assertTrue(e["logo"])
        self.assertEqual((e["width"], e["height"]), (140, 140))
        with self.assertRaisesRegex(ValueError, "No se fabrica"):
            P.logo("lg2", 0, 0, 140, "logos/un-logo-inventado.png")
        ancho = P.tira_logos("tira", 0, 300, 100, ["logos/whatsapp.png", self.foto], aire=50, rotulos=["WhatsApp", None])
        self.assertEqual(round(ancho), round(100 + 50 + 100 * 160 / 90))
        self.assertEqual([x["id"] for x in P.els if x["id"].startswith("tira")], ["tira:1", "tira:1:r", "tira:2"])

    def test_la_pieza_declara_sus_imagenes_y_el_puente_las_entrega(self):
        fuente = "const W = 800, H = 450\nexport default function montar(raiz, ctx, D) { return {} }\n"
        img = LV.imagen_de(self.foto)
        self.assertEqual(img, {"ruta": "clase/img/escena.png", "ancho": 160, "alto": 90})
        html = LV.armar_pieza("con-foto", "Con foto", fuente, "", {"foto": img}, 2, imagenes=[img, "logos/whatsapp.png", img])
        ficha = LV.ficha_de(html)
        self.assertEqual(ficha["imagenes"], ["clase/img/escena.png", "logos/whatsapp.png"])
        self.assertIn("marca.imagen(r)", html)        # el host del Lienzo entrega las imágenes declaradas por `marca.imagen`
        with self.assertRaisesRegex(ValueError, "no existe"):
            LV.armar_pieza("rota", "Rota", fuente, "", {}, imagenes=["clase/img/nada.png"])
        with self.assertRaisesRegex(ValueError, "512 KB"):
            LV.armar_pieza("pesada", "Pesada", fuente, "", {"x": "a" * (600 * 1024)})

    def test_el_kit_sabe_poner_imagenes_y_logos(self):
        kit = (SKILLS / "canvas" / "assets" / "pieza" / "kit.js").read_text(encoding="utf-8")
        self.assertRegex(kit, r"export function imagen\(div, ctx, img")
        self.assertRegex(kit, r"export function logo\(div, ctx, img")
        self.assertIn("ctx.imagen?.(ruta)", kit)
        self.assertIn("objectFit: 'contain'", kit)                     # nunca deformada
        self.assertIn("data-imagen", kit)                              # si llega tarde, el host le pone su src
        self.assertRegex(kit, r"\.pv\[data-tema=oscuro\] \.pv-img\.foto img\{filter:brightness")   # en oscuro, la ilustración no deslumbra
        self.assertIn("falta", kit)                                    # fuera del Lienzo, un hueco rotulado

    def test_el_spec_pone_imagen_y_logos_sin_coordenadas(self):
        spec = {"nombre": "Con imágenes", "capitulos": [
            {"id": "a", "titulo": "A", "bloques": [{"tipo": "imagen", "ruta": "img/escena.png", "ancho": .5},
                                                     {"tipo": "logos", "lista": ["../logos/whatsapp.png"], "alto": 120, "rotulos": ["WhatsApp"]}]},
            {"id": "b", "titulo": "B", "bloques": []}]}
        P = LV.desde_spec(spec, self.raiz / "clase")
        im = next(e for e in P.els if e["type"] == "image" and not e.get("logo"))
        lg = next(e for e in P.els if e.get("logo"))
        self.assertEqual(round(im["height"]), round(im["width"] * 90 / 160))
        self.assertGreater(lg["y"], im["y"] + im["height"])
        self.assertEqual([a for a in P.revisar() if "se sale" in a], [])


class SinDatosDeNadie(unittest.TestCase):
    def test_el_ejemplo_esta_marcado_como_inventado(self):
        self.assertTrue(EJEMPLO["ejemplo"])
        self.assertEqual(EJEMPLO["esquema"], M.ESQUEMA)

    def test_las_piezas_no_traen_datos_escritos(self):
        for js in (AQUI.parent / "assets" / "piezas").glob("*.js"):
            texto = js.read_text(encoding="utf-8")
            self.assertNotRegex(texto, re.compile(r"ferreter|tuerca\b(?!')|EUR|USD", re.I), js.name)


if __name__ == "__main__":
    unittest.main()
