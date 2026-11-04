#!/usr/bin/env python3
"""DeepSeek-V4.1-Flash-1017 abliterated en GPU rentada de RunPod: la receta completa desde el Studio.

Todo lo que cuesta dinero pide `--va` (el «va» del dueño de la cuenta); sin él solo imprime el PLAN y lo que costaría.
Apagar nunca pide `--va` (deja de cobrar). Guía para aprender y primera sesión:
docs/builds/deepseek-abliterated-2026-11-03/RUNBOOK.md

  ds41.py precios                      precios vivos y disponibilidad de las 4 opciones (solo lectura)
  ds41.py volumen  --dc US-NC-1 [--va] crea el volumen de red de 600 GB para los pesos
  ds41.py plantilla [--va]             crea la plantilla en RunPod (para verla o lanzarla a mano en la consola)
  ds41.py arrancar [--opcion rtxpro6000x4] [--tope-horas 2] [--inactividad-min 20] [--sin-volumen] [--va]
  ds41.py esperar  [--max-min 90]      espera en primer plano a que /v1/messages responda 200
  ds41.py probar   [chat tools ...]    pruebas de humo contra el pod (probar.sh)
  ds41.py conectar | desconectar       apunta el modo «abliterated» de la cabina al pod (o lo regresa a abliteration.ai)
  ds41.py vigilar                      segundo candado desde el Studio: apaga al pasar el tope aunque el vigía del pod falle
  ds41.py estado                       saldo, gasto por hora, pods y si el endpoint responde
  ds41.py apagar                       borra el pod (el volumen y sus pesos se quedan), anota el costo en GPU-LOG

La llave de RunPod sale de RUNPOD_API_KEY (proceso o arbrain/server/.env) y nunca se imprime. La llave Bearer del
pod se genera al arrancar y vive en ~/.config/arbrain/gpu/ds41.json (0600).
"""
import argparse
import base64
import io
import json
import os
import re
import secrets
import stat
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
REST = 'https://rest.runpod.io/v1'
GRAPHQL = 'https://api.runpod.io/graphql'
ESTADO = Path(os.environ.get('DS41_ESTADO', Path.home() / '.config/arbrain/gpu/ds41.json'))

MODEL_REPO = 'mrfakename/DeepSeek-V4.1-Flash-1017-abliterated'
MODEL_REV = '517efab9ccfef7f714dbd7d679f181a86f43ccf9'  # la revisión que sirve hanxiao
MODELO = 'DeepSeek-V4.1-Flash-1017-abliterated'
LIL = 'ghcr.io/local-inference-lab/vllm@sha256:fd74019fc217a541060093d18427c36330df6ac5700651b55593dafdbb936920'
VLLM_OFICIAL = 'vllm/vllm-openai:v0.28.0'
# Pesos 510.3 GB + cachés de kernels y bitácoras. Precio de docs.runpod.io/pods/pricing (3 nov 2026): la API no lo da.
VOLUMEN_GB = 600
VOLUMEN_USD_GB_MES = 0.07
PREFIJO = 'ds41-abliterated'

OPCIONES = {
    'rtxpro6000x4': {
        'gpu': 'NVIDIA RTX PRO 6000 Blackwell Server Edition', 'n': 4, 'vram': 96, 'motor': 'lil', 'imagen': LIL, 'spec': 3, 'probada': True,
        'cabe': '1M por petición; ~4.2M tokens de KV entre todas (medido por hanxiao: 8 sesiones, ~371 tok/s una sola)',
    },
    'b300x2': {
        'gpu': 'NVIDIA B300 SXM6 AC', 'n': 2, 'vram': 288, 'motor': 'vllm', 'imagen': VLLM_OFICIAL, 'spec': 5, 'probada': False,
        'cabe': '1M por petición con mucho KV de sobra (576 GB); receta sin probar con este checkpoint',
    },
    'h200x4': {
        'gpu': 'NVIDIA H200', 'n': 4, 'vram': 141, 'motor': 'vllm', 'imagen': VLLM_OFICIAL, 'spec': 5, 'probada': False,
        'cabe': '1M por petición (564 GB; NVIDIA publica 4x H200 para V4-Flash); FP4 emulado (Hopper no tiene FP4): más lento',
    },
    'h100x8': {
        'gpu': 'NVIDIA H100 80GB HBM3', 'n': 8, 'vram': 80, 'motor': 'vllm', 'imagen': VLLM_OFICIAL, 'spec': 5, 'probada': False,
        'cabe': '1M por petición (640 GB, TP8); FP4 emulado; vLLM avisa problemas de DSpark en H100',
    },
}
RECOMENDADA = 'rtxpro6000x4'


# ── Llaves y rutas ──
def repo_principal():
    """La copia principal del repo (donde vive arbrain/server/.env), también desde un worktree."""
    try:
        comun = subprocess.run(['git', '-C', str(AQUI), 'rev-parse', '--path-format=absolute', '--git-common-dir'], capture_output=True, text=True, check=True).stdout.strip()
        return Path(comun).parent
    except (subprocess.CalledProcessError, FileNotFoundError):
        return Path.home() / 'Developer/artificial-brain'


def ruta_env():
    return Path(os.environ.get('ARBRAIN_SERVER_ENV') or repo_principal() / 'arbrain/server/.env')


def leer_env(ruta):
    vals = {}
    try:
        for l in ruta.read_text().splitlines():
            m = re.match(r'^([A-Z0-9_]+)=(.*)$', l.strip())
            if m:
                vals[m.group(1)] = m.group(2).strip().strip('"\'')
    except OSError:
        pass
    return vals


def llave_runpod():
    k = os.environ.get('RUNPOD_API_KEY') or leer_env(ruta_env()).get('RUNPOD_API_KEY')
    if not k:
        sys.exit(f'Falta RUNPOD_API_KEY (proceso o {ruta_env()}).')
    return k


def leer_estado():
    try:
        return json.loads(ESTADO.read_text())
    except (OSError, ValueError):
        return {}


def guardar_estado(e):
    ESTADO.parent.mkdir(parents=True, exist_ok=True)
    tmp = ESTADO.with_suffix('.tmp')
    tmp.write_text(json.dumps(e, indent=2))
    os.chmod(tmp, stat.S_IRUSR | stat.S_IWUSR)
    tmp.replace(ESTADO)


# ── API ──
def http(url, metodo='GET', cuerpo=None, llave=None, timeout=30):
    h = {'Content-Type': 'application/json', 'User-Agent': 'arbrain-ds41/1'}
    if llave:
        h['Authorization'] = f'Bearer {llave}'
    req = urllib.request.Request(url, method=metodo, headers=h, data=json.dumps(cuerpo).encode() if cuerpo is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            t = r.read().decode()
            return r.status, (json.loads(t) if t.strip() else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode('utf-8', 'replace')
        try:
            return e.code, json.loads(t)
        except ValueError:
            return e.code, t
    except (urllib.error.URLError, TimeoutError) as e:
        return 0, str(e)


def gql(q, llave):
    c, r = http(GRAPHQL, 'POST', {'query': q}, llave)
    if c != 200 or not isinstance(r, dict) or r.get('errors'):
        sys.exit(f'GraphQL de RunPod respondió {c}: {str(r)[:300]}')
    return r['data']


def rest(ruta, llave, metodo='GET', cuerpo=None):
    return http(REST + ruta, metodo, cuerpo, llave)


# ── Puro (lo prueban test_ds41.py) ──
def costo_hora(opcion, precios):
    """USD/h del pod en Secure Cloud (el único con volumen de red)."""
    o = OPCIONES[opcion]
    return round(precios[o['gpu']]['securePrice'] * o['n'], 2)


def volumen_usd_dia(gb=VOLUMEN_GB):
    return round(gb * VOLUMEN_USD_GB_MES * 12 / 365, 2)


def revisar_saldo(saldo, usd_hora, tope_horas, volumen_nuevo=False):
    """None si alcanza; si no, el motivo. Pide el tope completo + 15 % de margen (y una semana de volumen si es nuevo)."""
    necesita = usd_hora * tope_horas * 1.15 + (volumen_usd_dia() * 7 if volumen_nuevo else 0)
    if saldo < necesita:
        return f'el saldo (US${saldo:.2f}) no cubre el tope: {tope_horas:g} h × US${usd_hora:.2f}/h + 15 % = US${necesita:.2f}. Recarga o baja --tope-horas.'
    return None


def paquete_pod(raiz=AQUI / 'pod'):
    """arranque.sh + vigia.py + parches en un tar.gz base64: viaja en una variable del pod, sin repo ni registro."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as t:
        for p in sorted(raiz.rglob('*')):
            if p.is_file() and '__pycache__' not in p.parts:
                ti = t.gettarinfo(str(p), arcname=str(p.relative_to(raiz)))
                ti.uid = ti.gid = 0
                ti.uname = ti.gname = 'root'
                ti.mtime = 0
                with open(p, 'rb') as f:
                    t.addfile(ti, f)
    return base64.b64encode(buf.getvalue()).decode()


ARRANQUE = ('P=$(command -v python3 || echo /opt/venv/bin/python); '
            '"$P" -c \'import base64,io,os,tarfile; tarfile.open(fileobj=io.BytesIO(base64.b64decode(os.environ["DS41_PAQUETE"]))).extractall("/opt/ds41", filter="data")\' '
            '&& exec bash /opt/ds41/arranque.sh')


def env_pod(opcion, llave, fin_epoch, inactividad_min, arranque_max_min, sin_volumen, paquete):
    o = OPCIONES[opcion]
    return {
        'DS41_PAQUETE': paquete, 'VLLM_API_KEY': llave, 'DS41_MOTOR': o['motor'], 'DS41_SPEC': str(o['spec']),
        'DS41_DATOS': '/root/ds41' if sin_volumen else '/workspace/ds41',
        'MODEL_REPO': MODEL_REPO, 'MODEL_REV': MODEL_REV, 'SERVED_MODEL_NAME': MODELO, 'DS41_MAXLEN': '1048576',
        'DS41_FIN_EPOCH': str(int(fin_epoch)), 'DS41_INACTIVIDAD_MIN': str(inactividad_min), 'DS41_ARRANQUE_MAX_MIN': str(arranque_max_min),
    }


def payload_pod(opcion, env, volumen=None, nombre=None):
    """Cuerpo de POST /pods. Con volumen el pod nace en el centro de datos del volumen."""
    o = OPCIONES[opcion]
    p = {
        'name': nombre or f'{PREFIJO}-{opcion}', 'imageName': o['imagen'], 'cloudType': 'SECURE', 'computeType': 'GPU',
        'gpuTypeIds': [o['gpu']], 'gpuCount': o['n'], 'interruptible': False,
        'minRAMPerGPU': 64, 'minVCPUPerGPU': 8,
        'ports': ['8000/http'], 'dockerEntrypoint': ['/bin/bash', '-c'], 'dockerStartCmd': [ARRANQUE], 'env': env,
    }
    if volumen:
        p.update({'networkVolumeId': volumen['id'], 'dataCenterIds': [volumen['dataCenterId']], 'volumeMountPath': '/workspace', 'containerDiskInGb': 60})
    else:
        p.update({'containerDiskInGb': 700, 'volumeInGb': 0})
    return p


def tachar(payload):
    """El plan se imprime sin secretos ni el paquete entero."""
    p = json.loads(json.dumps(payload))
    env = p.get('env', {})
    if 'VLLM_API_KEY' in env:
        env['VLLM_API_KEY'] = '<se genera al arrancar; no se imprime>'
    if 'DS41_PAQUETE' in env:
        env['DS41_PAQUETE'] = f'<arranque.sh + vigia.py + parches, {len(env["DS41_PAQUETE"]) // 1024} KB en base64>'
    return p


def url_pod(pod_id):
    return f'https://{pod_id}-8000.proxy.runpod.net'


def editar_env(texto, poner):
    """Quita las claves de `poner` y agrega las que traen valor. Lo demás del .env queda intacto."""
    lineas = [l for l in texto.splitlines() if not any(re.match(rf'^{k}=', l) for k in poner)]
    while lineas and not lineas[-1].strip():
        lineas.pop()
    lineas += [f'{k}={v}' for k, v in poner.items() if v]
    return '\n'.join(lineas) + '\n'


CLAVES_CABINA = ('ABLITERATED_BASE_URL', 'ABLITERATED_API_KEY', 'CABINA_MODELO_ABLITERATED')


# ── GPU-LOG ──
def gpu_log(fila):
    try:
        top = subprocess.run(['git', '-C', str(AQUI), 'rev-parse', '--show-toplevel'], capture_output=True, text=True, check=True).stdout.strip()
        ruta = Path(top) / 'docs/agents/personajes-v5/GPU-LOG.md'
        with open(ruta, 'a') as f:
            f.write(fila + '\n')
        print(f'Anotado en {ruta}')
    except (OSError, subprocess.CalledProcessError) as e:
        print(f'No pude anotar en GPU-LOG ({e}). Fila: {fila}')


def ahora_mx():
    return time.strftime('%Y-%m-%d %H:%M')  # hora local del Studio (Ciudad de México), como el resto de GPU-LOG


# ── Comandos ──
def precios_vivos(llave):
    ids = sorted({o['gpu'] for o in OPCIONES.values()})
    d = gql('{ myself { clientBalance currentSpendPerHr } gpuTypes { id securePrice communityPrice } '
            'dataCenters { id storageSupport listed gpuAvailability { gpuTypeId stockStatus } } }', llave)
    precios = {g['id']: g for g in d['gpuTypes'] if g['id'] in ids}
    stock = {}
    for dc in d['dataCenters']:
        if not (dc['storageSupport'] and dc['listed']):
            continue
        for g in dc['gpuAvailability']:
            if g['gpuTypeId'] in ids:
                stock.setdefault(g['gpuTypeId'], []).append((dc['id'], g['stockStatus'] or 'sin dato'))
    return d['myself'], precios, stock


def cmd_precios(a):
    llave = llave_runpod()
    yo, precios, stock = precios_vivos(llave)
    filas = []
    for nombre, o in OPCIONES.items():
        uh = costo_hora(nombre, precios)
        filas.append({'opcion': nombre, 'gpus': f"{o['n']}× {o['gpu']}", 'vram_total_gb': o['n'] * o['vram'], 'usd_hora_secure': uh,
                      'usd_hora_community': round(precios[o['gpu']]['communityPrice'] * o['n'], 2), 'cabe_1m': o['cabe'], 'receta_probada': o['probada'],
                      'centros_con_volumen': stock.get(o['gpu'], [])})
    if a.json:
        print(json.dumps({'saldo': yo['clientBalance'], 'gasto_hora': yo['currentSpendPerHr'], 'volumen_gb': VOLUMEN_GB,
                          'volumen_usd_mes': round(VOLUMEN_GB * VOLUMEN_USD_GB_MES, 2), 'opciones': filas, 'recomendada': RECOMENDADA}, indent=2))
        return
    print(f"Saldo US${yo['clientBalance']:.2f} · gasto ahora US${yo['currentSpendPerHr']}/h · {time.strftime('%Y-%m-%d %H:%M')}\n")
    for f in filas:
        print(f"{f['opcion']:13} {f['gpus']:52} {f['vram_total_gb']:4} GB  US${f['usd_hora_secure']:6.2f}/h secure (community {f['usd_hora_community']:.2f}, sin volumen)")
        print(f"{'':13} {f['cabe_1m']}")
        print(f"{'':13} centros con volumen: {', '.join(f'{dc} ({s})' for dc, s in f['centros_con_volumen']) or 'ninguno'}\n")
    print(f'Volumen de red {VOLUMEN_GB} GB: US${VOLUMEN_GB * VOLUMEN_USD_GB_MES:.2f}/mes = US${volumen_usd_dia()}/día, se cobra exista o no un pod.')
    print(f'Recomendada: {RECOMENDADA} (la única receta medida; la más barata por hora).')


def cmd_volumen(a):
    llave = llave_runpod()
    c, vols = rest('/networkvolumes', llave)
    existentes = [v for v in (vols or []) if str(v.get('name', '')).startswith(PREFIJO)] if c == 200 else []
    if existentes:
        print(f'Ya hay volumen: {json.dumps(existentes)}. No creo otro.')
        return
    cuerpo = {'name': f'{PREFIJO}-pesos', 'size': a.gb, 'dataCenterId': a.dc}
    yo = gql('{ myself { clientBalance } }', llave)['myself']
    semana = volumen_usd_dia(a.gb) * 7
    print(f'PLAN: POST /networkvolumes {json.dumps(cuerpo)}\nCuesta US${a.gb * VOLUMEN_USD_GB_MES:.2f}/mes (US${volumen_usd_dia(a.gb)}/día) desde que nace, con o sin pod. Saldo US${yo["clientBalance"]:.2f}.')
    if yo['clientBalance'] < semana:
        sys.exit(f'El saldo no cubre ni una semana de volumen (US${semana:.2f}). Recarga primero.')
    if not a.va:
        print('No se creó nada. Repite con --va para crearlo.')
        return
    c, v = rest('/networkvolumes', llave, 'POST', cuerpo)
    if c not in (200, 201):
        sys.exit(f'RunPod respondió {c}: {v}')
    e = leer_estado()
    e['volumen'] = {'id': v['id'], 'dataCenterId': v['dataCenterId'], 'size': v['size']}
    guardar_estado(e)
    gpu_log(f"| {ahora_mx()} | abierto | volumen {v['id']} ({v['dataCenterId']}, {v['size']} GB) | — | {volumen_usd_dia(a.gb)}/día | Pesos de DeepSeek-V4.1-Flash abliterated | — |")
    print(f"Volumen {v['id']} en {v['dataCenterId']}.")


def cmd_plantilla(a):
    o = OPCIONES[a.opcion]
    cuerpo = {
        'name': f'{PREFIJO}-{a.opcion}', 'imageName': o['imagen'], 'category': 'NVIDIA', 'isPublic': False, 'isServerless': False,
        'containerDiskInGb': 60, 'volumeInGb': 0, 'volumeMountPath': '/workspace', 'ports': ['8000/http'],
        'dockerEntrypoint': ['/bin/bash', '-c'], 'dockerStartCmd': [ARRANQUE],
        # Lanzada a mano desde la consola: la llave sale de un secreto de RunPod (Settings › Secrets › ds41_api_key)
        # y el vigía usa el tope relativo DS41_TOPE_HORAS desde que nace el contenedor.
        'env': {**{k: v for k, v in env_pod(a.opcion, '{{ RUNPOD_SECRET_ds41_api_key }}', 0, 20, 90, False, paquete_pod()).items() if k != 'DS41_FIN_EPOCH'}, 'DS41_TOPE_HORAS': '2'},
        'readme': 'DeepSeek-V4.1-Flash-1017 abliterated (receta de Arbrain sobre hanxiao). Monta el volumen ds41-abliterated-pesos. Guía: docs/builds/deepseek-abliterated-2026-11-03/RUNBOOK.md',
    }
    print('PLAN: POST /templates\n' + json.dumps(tachar(cuerpo), indent=2))
    if not a.va:
        print('No se creó nada (una plantilla no cobra). Repite con --va para crearla.')
        return
    c, t = rest('/templates', llave_runpod(), 'POST', cuerpo)
    if c not in (200, 201):
        sys.exit(f'RunPod respondió {c}: {t}')
    e = leer_estado()
    e.setdefault('plantillas', {})[a.opcion] = t['id']
    guardar_estado(e)
    print(f"Plantilla {t['id']}.")


def cmd_arrancar(a):
    o = OPCIONES[a.opcion]
    if not o['probada'] and not a.experimental:
        sys.exit(f'{a.opcion} usa una receta sin probar con este checkpoint. Si es a propósito: --experimental.')
    if not 0 < a.tope_horas <= 8:
        sys.exit('--tope-horas entre 0 y 8.')
    llave = llave_runpod()
    yo, precios, stock = precios_vivos(llave)
    c, pods = rest('/pods', llave)
    vivos = [p for p in (pods or []) if str(p.get('name', '')).startswith(PREFIJO)] if c == 200 else []
    if vivos:
        sys.exit(f"Ya hay un pod {vivos[0]['id']} ({vivos[0].get('desiredStatus')}). Apágalo con: ds41.py apagar")
    e = leer_estado()
    volumen = None
    if not a.sin_volumen:
        volumen = e.get('volumen')
        if not volumen:
            sys.exit('No hay volumen. Créalo con: ds41.py volumen --dc <centro> --va  (o usa --sin-volumen).')
        dcs = dict(stock.get(o['gpu'], []))
        if volumen['dataCenterId'] not in dcs:
            print(f"AVISO: {volumen['dataCenterId']} no lista {o['gpu']}; RunPod puede negarse a crear el pod (no cobra si se niega).")
    uh = costo_hora(a.opcion, precios)
    falta = revisar_saldo(yo['clientBalance'], uh, a.tope_horas)
    primera = a.sin_volumen or not e.get('pesos_completos')
    arranque_max = a.arranque_max_min or (90 if primera else 45)
    fin = time.time() + a.tope_horas * 3600
    llave_pod = 'sk-ds41-' + secrets.token_hex(24)
    payload = payload_pod(a.opcion, env_pod(a.opcion, llave_pod, fin, a.inactividad_min, arranque_max, a.sin_volumen, paquete_pod()), volumen)
    print('PLAN: POST /pods\n' + json.dumps(tachar(payload), indent=2))
    print(f"\nCuesta US${uh:.2f}/h mientras exista. Tope duro {a.tope_horas:g} h = US${uh * a.tope_horas:.2f} "
          f"(se apaga solo a las {time.strftime('%H:%M', time.localtime(fin))}), o tras {a.inactividad_min} min sin tokens, "
          f"o si en {arranque_max} min no está listo. Saldo US${yo['clientBalance']:.2f}.")
    if falta:
        sys.exit('NO: ' + falta)
    if not a.va:
        print('No se creó nada. Repite con --va para rentar.')
        return
    c, pod = rest('/pods', llave, 'POST', payload)
    if c not in (200, 201):
        sys.exit(f'RunPod no creó el pod ({c}): {str(pod)[:400]}')
    e['pod'] = {'id': pod['id'], 'opcion': a.opcion, 'url': url_pod(pod['id']), 'llave': llave_pod, 'inicio': time.time(), 'fin': fin,
                'usd_hora': pod.get('costPerHr') or uh, 'sin_volumen': a.sin_volumen}
    guardar_estado(e)
    gpu_log(f"| {ahora_mx()} | abierto | {pod['id']} {PREFIJO} | {o['n']}× {o['gpu'].replace('NVIDIA ', '')} SECURE | {e['pod']['usd_hora']} | "
            f"DeepSeek-V4.1-Flash abliterated ({o['motor']}), tope {a.tope_horas:g} h, inactividad {a.inactividad_min} min | — |")
    print(f"Pod {pod['id']} creado. Endpoint {url_pod(pod['id'])}. Sigue: ds41.py esperar · y en otra terminal: ds41.py vigilar")


def pod_actual():
    p = leer_estado().get('pod')
    if not p:
        sys.exit('No hay pod registrado (ds41.py arrancar).')
    return p


def mensaje(url, llave, timeout=120):
    return http(f'{url}/v1/messages', 'POST', {'model': MODELO, 'max_tokens': 64, 'messages': [{'role': 'user', 'content': 'Reply OK.'}]}, llave, timeout)


def cmd_esperar(a):
    p = pod_actual()
    llave = llave_runpod()
    t0 = time.time()
    while time.time() - t0 < a.max_min * 60:
        c, pod = rest(f"/pods/{p['id']}", llave)
        if c == 404:
            sys.exit('El pod ya no existe (¿lo apagó el vigía?). Revisa la bitácora en el volumen: ds41/logs/.')
        cm, _ = mensaje(p['url'], p['llave'], 60)
        estado = pod.get('desiredStatus') if isinstance(pod, dict) else c
        print(f"{int((time.time() - p['inicio']) / 60):3} min desde que nació · pod {estado} · /v1/messages {cm or 'sin respuesta'}", flush=True)
        if cm == 200:
            e = leer_estado()
            if not p.get('sin_volumen'):
                e['pesos_completos'] = True
            e['pod']['listo_en'] = time.time()
            guardar_estado(e)
            print(f"LISTO en {int((time.time() - p['inicio']) / 60)} min. Prueba: ds41.py probar")
            return
        time.sleep(30)
    sys.exit(f'No respondió en {a.max_min} min. El vigía del pod lo apaga al pasar su tope de arranque.')


def cmd_probar(a):
    p = pod_actual()
    env = {**os.environ, 'DS41_URL': p['url'], 'DS41_API_KEY': p['llave'], 'DS41_MODELO': MODELO}
    sys.exit(subprocess.run(['bash', str(AQUI / 'probar.sh'), *a.pruebas], env=env).returncode)


def cmd_conectar(a):
    ruta = ruta_env()
    if a.desconectar:
        poner = {k: '' for k in CLAVES_CABINA}
    else:
        p = pod_actual()
        poner = {'ABLITERATED_BASE_URL': p['url'], 'ABLITERATED_API_KEY': p['llave'], 'CABINA_MODELO_ABLITERATED': MODELO}
    texto = ruta.read_text() if ruta.exists() else ''
    modo = stat.S_IMODE(ruta.stat().st_mode) if ruta.exists() else 0o600
    tmp = ruta.with_name(ruta.name + '.ds41tmp')
    tmp.write_text(editar_env(texto, poner))
    os.chmod(tmp, modo)
    tmp.replace(ruta)
    print(f'{ruta}: ' + ('modo «abliterated» de vuelta a api.abliteration.ai.' if a.desconectar else f"modo «abliterated» apunta a {poner['ABLITERATED_BASE_URL']} ({MODELO})."))


def cmd_estado(a):
    llave = llave_runpod()
    yo = gql('{ myself { clientBalance currentSpendPerHr } }', llave)['myself']
    c, pods = rest('/pods', llave)
    c2, vols = rest('/networkvolumes', llave)
    print(f"Saldo US${yo['clientBalance']:.2f} · gasto US${yo['currentSpendPerHr']}/h")
    for p in pods or []:
        print(f"pod {p['id']} {p.get('name')} {p.get('desiredStatus')} US${p.get('costPerHr')}/h")
    for v in vols or []:
        print(f"volumen {v['id']} {v.get('name')} {v.get('dataCenterId')} {v.get('size')} GB")
    p = leer_estado().get('pod')
    if p:
        cm, _ = mensaje(p['url'], p['llave'], 30)
        print(f"endpoint {p['url']} → /v1/messages {cm or 'sin respuesta'} · llave en {ESTADO} (no se imprime) · "
              f"tope {time.strftime('%H:%M', time.localtime(p['fin']))}")


def cmd_vigilar(a):
    p = pod_actual()
    llave = llave_runpod()
    print(f"Vigilando {p['id']}: lo borro a las {time.strftime('%H:%M', time.localtime(p['fin'] + 300))} si sigue vivo (tope + 5 min). Ctrl+C suelta.")
    while True:
        c, _ = rest(f"/pods/{p['id']}", llave)
        if c == 404:
            print('El pod ya no existe. Fin.')
            return
        if time.time() >= p['fin'] + 300:
            print('Pasó el tope y el pod sigue vivo: lo borro desde el Studio.')
            a.pod = None
            cmd_apagar(a)
            return
        time.sleep(60)


def cmd_apagar(a):
    llave = llave_runpod()
    e = leer_estado()
    p = e.get('pod') or {}
    pod_id = getattr(a, 'pod', None) or p.get('id')
    if not pod_id:
        sys.exit('No hay pod registrado; pasa --pod <id>.')
    c, info = rest(f'/pods/{pod_id}', llave)
    c2, r = rest(f'/pods/{pod_id}', llave, 'DELETE')
    if c2 not in (200, 204) and c != 404:
        sys.exit(f'RunPod no borró el pod ({c2}): {r}. Bórralo en console.runpod.io AHORA.')
    horas = (time.time() - p['inicio']) / 3600 if p.get('inicio') else None
    uh = (info.get('costPerHr') if isinstance(info, dict) else None) or p.get('usd_hora')
    costo = f'~US${horas * uh:.2f}' if horas is not None and uh else '—'
    vivio = f' Vivió {horas * 60:.0f} min, {costo}.' if horas is not None else ''
    print(f'Pod {pod_id} borrado ({"ya no existía" if c == 404 else "ok"}).{vivio}')
    if p.get('id') == pod_id:
        listo = f", listo en {(p['listo_en'] - p['inicio']) / 60:.0f} min" if p.get('listo_en') else ', nunca llegó a listo'
        gpu_log(f"| {time.strftime('%Y-%m-%d %H:%M', time.localtime(p['inicio']))} | {ahora_mx()[11:]} | {pod_id} (terminado) | {p.get('opcion')} | {uh} | "
                f"DeepSeek-V4.1-Flash abliterated{listo} | {costo} |")
        e.pop('pod', None)
        guardar_estado(e)
        if leer_env(ruta_env()).get('ABLITERATED_BASE_URL') == p.get('url'):
            a.desconectar = True
            cmd_conectar(a)
    yo = gql('{ myself { clientBalance currentSpendPerHr } }', llave)['myself']
    print(f"Saldo US${yo['clientBalance']:.2f} · gasto US${yo['currentSpendPerHr']}/h (el volumen sigue cobrando si existe).")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('precios'); s.add_argument('--json', action='store_true'); s.set_defaults(f=cmd_precios)
    s = sub.add_parser('volumen'); s.add_argument('--dc', required=True); s.add_argument('--gb', type=int, default=VOLUMEN_GB); s.add_argument('--va', action='store_true'); s.set_defaults(f=cmd_volumen)
    s = sub.add_parser('plantilla'); s.add_argument('--opcion', choices=OPCIONES, default=RECOMENDADA); s.add_argument('--va', action='store_true'); s.set_defaults(f=cmd_plantilla)
    s = sub.add_parser('arrancar')
    s.add_argument('--opcion', choices=OPCIONES, default=RECOMENDADA); s.add_argument('--tope-horas', type=float, default=2)
    s.add_argument('--inactividad-min', type=int, default=20); s.add_argument('--arranque-max-min', type=int, default=0)
    s.add_argument('--sin-volumen', action='store_true'); s.add_argument('--experimental', action='store_true'); s.add_argument('--va', action='store_true')
    s.set_defaults(f=cmd_arrancar)
    s = sub.add_parser('esperar'); s.add_argument('--max-min', type=int, default=90); s.set_defaults(f=cmd_esperar)
    s = sub.add_parser('probar'); s.add_argument('pruebas', nargs='*'); s.set_defaults(f=cmd_probar)
    s = sub.add_parser('conectar'); s.set_defaults(f=cmd_conectar, desconectar=False)
    s = sub.add_parser('desconectar'); s.set_defaults(f=cmd_conectar, desconectar=True)
    s = sub.add_parser('estado'); s.set_defaults(f=cmd_estado)
    s = sub.add_parser('vigilar'); s.set_defaults(f=cmd_vigilar)
    s = sub.add_parser('apagar'); s.add_argument('--pod'); s.set_defaults(f=cmd_apagar)
    a = ap.parse_args(argv)
    a.f(a)


if __name__ == '__main__':
    main()
