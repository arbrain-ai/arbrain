#!/usr/bin/env python3
"""habit_record.py: la pluma única de los hábitos del dueño (conversación y diario).

Guarda el catálogo y los registros en un archivo local del repo:
    .claude/plan/habitos.json   (o la ruta de ARBRAIN_HABITOS, útil para pruebas)

Sin red, sin base de datos, sin dependencias: Python 3.9+ en macOS, Windows o Linux.

JSON por stdin. Acciones:
  {"action":"catalog"}                                          -> hábitos (activos y archivados)
  {"action":"habit-add","clave":"ejercicio","nombre":"Ejercicio","seccion":"cuerpo"}
                                                                -> crea o reactiva
  {"action":"habit-archive","clave":"ejercicio"}                -> archiva (historia intacta)
  {"action":"read","date":"YYYY-MM-DD","clave":"ejercicio"}     -> registro + expectedRevision
  {"action":"write","date":"YYYY-MM-DD","clave":"ejercicio","hecho":true,
   "requestId":"<UUID>","expectedRevision":0,"source":"conversation"}
                                                                -> escribe con control de revisión
  {"action":"range","from":"YYYY-MM-DD","to":"YYYY-MM-DD"}      -> registros, conteos y racha

Semántica de `hecho`: true = cumplido, false = no cumplido explícito, null = marca retirada.
Un día sin registro NO es un fallo: es falta de medición.

Reglas de escritura:
  - Leer primero y mandar la revisión leída en expectedRevision. Si no coincide -> 409, se revisa.
  - Un reintento usa EXACTAMENTE el mismo JSON y requestId: no duplica.
  - source "diary" o "import" exige `evidence` (archivo, huella md5 y pasaje que acredita la marca).
  - La evidencia del diario o de una importación nunca pisa una corrección manual de la conversación.
"""
import datetime
import hashlib
import json
import os
import sys
import time
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
STORE = Path(os.environ.get("ARBRAIN_HABITOS") or (REPO / ".claude" / "plan" / "habitos.json"))
SOURCES = ("conversation", "diary", "import")
SECCIONES = ("ancla", "cuerpo", "mente", "nutricion", "trabajo", "otro")
MAX_RECEIPTS = 5000


class HabitError(Exception):
    def __init__(self, message, status=400, extra=None):
        super().__init__(message)
        self.status = status
        self.extra = extra or {}


def empty():
    return {"version": 1, "catalogo": [], "registros": {}, "receipts": {}}


def load():
    if not STORE.exists():
        return empty()
    try:
        data = json.loads(STORE.read_text(encoding="utf-8"))
        if data.get("version") != 1 or not isinstance(data.get("catalogo"), list):
            raise ValueError()
        data.setdefault("registros", {})
        data.setdefault("receipts", {})
        return data
    except (ValueError, OSError):
        raise HabitError("No se pudo leer el registro de hábitos. No se sobrescribió.", 409)


def save(data):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STORE.with_name(STORE.name + ".%d.tmp" % os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, STORE)


class Lock:
    """Candado portable por archivo exclusivo (sin fcntl, funciona también en Windows)."""

    def __init__(self):
        self.path = STORE.with_name(STORE.name + ".lock")

    def __enter__(self):
        STORE.parent.mkdir(parents=True, exist_ok=True)
        limite = time.time() + 10
        while True:
            try:
                fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.close(fd)
                return self
            except FileExistsError:
                try:
                    if time.time() - self.path.stat().st_mtime > 60:
                        self.path.unlink()  # candado huérfano de una corrida muerta
                        continue
                except OSError:
                    pass
                if time.time() > limite:
                    raise HabitError("Otra escritura de hábitos está en curso. Reintenta.", 409)
                time.sleep(0.1)

    def __exit__(self, *exc):
        try:
            self.path.unlink()
        except OSError:
            pass


def civil(value, name="date"):
    if value is None:
        return datetime.date.today().isoformat()
    try:
        if datetime.date.fromisoformat(value).isoformat() != value:
            raise ValueError()
    except (ValueError, TypeError):
        raise HabitError("Fecha inválida en %s (usa YYYY-MM-DD)." % name)
    return value


def clave_valida(body):
    key = body.get("clave")
    if not isinstance(key, str) or not key.strip() or len(key) > 100:
        raise HabitError("Clave de hábito inválida.")
    return key.strip()


def habito(data, key):
    return next((h for h in data["catalogo"] if h["clave"] == key), None)


def record_of(data, date, key):
    return data["registros"].get(date, {}).get(key)


def act_catalog(_body):
    return {"habitos": load()["catalogo"], "archivo": str(STORE)}


def act_habit_add(body):
    key = clave_valida(body)
    nombre = body.get("nombre") or key
    seccion = body.get("seccion") or "otro"
    if seccion not in SECCIONES:
        raise HabitError("Sección inválida. Usa: " + ", ".join(SECCIONES))
    with Lock():
        data = load()
        h = habito(data, key)
        if h:
            h.update({"nombre": nombre, "seccion": seccion, "activo": True})
            if body.get("icono"):
                h["icono"] = body["icono"]
        else:
            data["catalogo"].append({"clave": key, "nombre": nombre, "seccion": seccion,
                                     "icono": body.get("icono") or "", "orden": len(data["catalogo"]) + 1,
                                     "activo": True})
        save(data)
        return {"habitos": data["catalogo"]}


def act_habit_archive(body):
    key = clave_valida(body)
    with Lock():
        data = load()
        h = habito(data, key)
        if not h:
            raise HabitError("Ese hábito no existe en el catálogo.", 404)
        h["activo"] = False
        save(data)
        return {"habitos": data["catalogo"]}


def act_read(body):
    date, key = civil(body.get("date")), clave_valida(body)
    data = load()
    if not habito(data, key):
        raise HabitError("Ese hábito no existe en el catálogo. Créalo con habit-add.", 404)
    rec = record_of(data, date, key)
    return {"date": date, "clave": key, "record": rec, "expectedRevision": rec["revision"] if rec else 0}


def act_write(body):
    date, key = civil(body.get("date")), clave_valida(body)
    if "hecho" not in body or (body["hecho"] is not None and type(body["hecho"]) is not bool):
        raise HabitError("hecho debe ser true, false o null.")
    expected = body.get("expectedRevision")
    if type(expected) is not int or expected < 0:
        raise HabitError("expectedRevision es obligatorio: lee primero con action read.")
    try:
        request_id = str(uuid.UUID(str(body.get("requestId"))))
    except ValueError:
        raise HabitError("requestId debe ser un UUID.")
    source = body.get("source", "conversation")
    if source not in SOURCES:
        raise HabitError("source inválido. Usa: " + ", ".join(SOURCES))
    evidence = body.get("evidence")
    if source != "conversation" and (not isinstance(evidence, str) or not evidence.strip()):
        raise HabitError("La evidencia es obligatoria para source %s." % source)
    fingerprint = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

    with Lock():
        data = load()
        if not habito(data, key):
            raise HabitError("Ese hábito no existe en el catálogo. Créalo con habit-add.", 404)
        receipts = data["receipts"]
        current = record_of(data, date, key)
        if request_id in receipts:
            if receipts[request_id] != fingerprint:
                raise HabitError("No reutilices un requestId con otro contenido.", 409)
            return {"date": date, "clave": key, "record": current, "replay": True}
        revision = current["revision"] if current else 0
        if expected != revision:
            raise HabitError("El registro cambió desde tu lectura. Revisa antes de escribir.", 409,
                             {"record": current, "expectedRevision": revision})
        if current and current.get("source") == "conversation" and source != "conversation":
            raise HabitError("Hay una corrección manual del dueño para ese día. La evidencia no la pisa; repórtalo.",
                             409, {"record": current})
        rec = {"hecho": body["hecho"], "revision": revision + 1, "source": source,
               "evidence": evidence if isinstance(evidence, str) else None,
               "requestId": request_id,
               "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        data["registros"].setdefault(date, {})[key] = rec
        receipts[request_id] = fingerprint
        if len(receipts) > MAX_RECEIPTS:
            for old in list(receipts)[: len(receipts) - MAX_RECEIPTS]:
                del receipts[old]
        save(data)
        return {"date": date, "clave": key, "record": rec}


def act_range(body):
    today = datetime.date.today()
    start = civil(body.get("from") or (today - datetime.timedelta(days=27)).isoformat(), "from")
    end = civil(body.get("to") or today.isoformat(), "to")
    if start > end:
        raise HabitError("from debe ser anterior o igual a to.")
    data = load()
    d0, d1 = datetime.date.fromisoformat(start), datetime.date.fromisoformat(end)
    dias = [(d0 + datetime.timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]
    resumen = {}
    for h in data["catalogo"]:
        k = h["clave"]
        estados = [(d, (record_of(data, d, k) or {}).get("hecho")) for d in dias]
        registrados = [e for _, e in estados if e is not None]
        if not h.get("activo") and not registrados:
            continue  # archivado y sin historia en el período: no aparece
        racha = 0
        for i, (d, e) in enumerate(reversed(estados)):
            if e is None and i == 0 and d == today.isoformat():
                continue  # hoy aún sin marcar no rompe la racha de ayer
            if e is True:
                racha += 1
            else:
                break
        resumen[k] = {"nombre": h["nombre"], "activo": h.get("activo", True),
                      "registrados": len(registrados), "cumplidos": registrados.count(True), "racha": racha}
    registros = {d: data["registros"][d] for d in dias if d in data["registros"]}
    return {"from": start, "to": end, "resumen": resumen, "registros": registros}


ACTIONS = {"catalog": act_catalog, "habit-add": act_habit_add, "habit-archive": act_habit_archive,
           "read": act_read, "write": act_write, "range": act_range}


def main():
    try:
        body = json.loads(sys.stdin.read() or "{}")
        if not isinstance(body, dict):
            raise HabitError("Se esperaba un objeto JSON.")
        action = body.get("action", "read")
        if action not in ACTIONS:
            raise HabitError("Acción desconocida. Usa: " + ", ".join(ACTIONS))
        print(json.dumps(ACTIONS[action](body), ensure_ascii=False))
        return 0
    except HabitError as err:
        print(json.dumps(dict({"error": str(err), "status": err.status}, **err.extra), ensure_ascii=False))
        return 1
    except ValueError as err:
        print(json.dumps({"error": "JSON inválido: %s" % err, "status": 400}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
