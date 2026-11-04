#!/usr/bin/env python3
"""Vigía DENTRO del pod: termina el pod (y su cobro) por tope de horas, por inactividad o por un arranque trabado.

Corre antes que todo lo demás (también mientras bajan los pesos) y no depende del Studio: usa la llave que RunPod
pone en cada pod (`RUNPOD_API_KEY`, con alcance solo a ESE pod) para borrarlo con la API REST; si la REST falla,
prueba GraphQL. El volumen de red NO se toca: los pesos sobreviven.

Reglas (variables del pod, las fija `ds41.py arrancar`):
  DS41_FIN_EPOCH         hora límite absoluta (creación + tope de horas). Pasada, se apaga pase lo que pase.
  DS41_TOPE_HORAS        sin DS41_FIN_EPOCH (pod lanzado a mano desde la plantilla): tope desde que nace el contenedor.
  DS41_INACTIVIDAD_MIN   minutos sin tokens nuevos (prompt o generación) después de estar listo. 0 = apagado.
  DS41_ARRANQUE_MAX_MIN  minutos para llegar a «listo» desde que el contenedor nace (descarga incluida).
Además, en cuanto el servidor responde, comprueba que SIN llave contesta 401; si contesta 200 el endpoint está
abierto al mundo y apaga el pod en ese momento.

Uso:  vigia.py                 bucle (lo lanza arranque.sh)
      vigia.py --apagar-ya X   apaga ahora con el motivo X (arranque.sh lo usa si algo falla)
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

PUERTO = int(os.environ.get('DS41_PUERTO', '8000'))
LOCAL = f'http://127.0.0.1:{PUERTO}'
DATOS = os.environ.get('DS41_DATOS', '/workspace/ds41')
LOG = os.path.join(DATOS, 'logs', 'vigia.log')
ESTADO = os.path.join(DATOS, 'logs', 'vigia-estado.json')
CADA_S = int(os.environ.get('DS41_VIGIA_CADA_S', '60'))


def log(msg):
    linea = f"[{time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())}Z] {msg}"
    print(linea, flush=True)
    try:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        with open(LOG, 'a') as f:
            f.write(linea + '\n')
    except OSError:
        pass


def http(url, metodo='GET', headers=None, datos=None, timeout=10):
    req = urllib.request.Request(url, method=metodo, headers=headers or {}, data=datos)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')
    except Exception as e:  # red caída, servidor aún sin abrir el puerto
        return 0, str(e)


# ── Reglas (puras: las prueba test_ds41.py) ──
def contadores(metricas):
    """Suma de tokens de prompt y de generación más solicitudes en curso, del /metrics de vLLM."""
    total, enCurso = 0.0, 0.0
    for linea in metricas.splitlines():
        if linea.startswith('#'):
            continue
        m = re.match(r'^(vllm:(?:prompt_tokens_total|generation_tokens_total|num_requests_running|num_requests_waiting))(?:\{[^}]*\})?\s+([0-9.eE+-]+)$', linea.strip())
        if not m:
            continue
        if m.group(1).endswith('_total'):
            total += float(m.group(2))
        else:
            enCurso += float(m.group(2))
    return total, enCurso


def decidir(ahora, e, cfg):
    """None = seguir; texto = motivo para apagar. `e`: estado {nacio, listo_en, ultima_actividad}."""
    if cfg['fin_epoch'] and ahora >= cfg['fin_epoch']:
        return f"tope de horas alcanzado ({time.strftime('%H:%M', time.gmtime(cfg['fin_epoch']))} UTC)"
    if not e.get('listo_en'):
        if cfg['arranque_max_min'] and ahora - e['nacio'] >= cfg['arranque_max_min'] * 60:
            return f"no llegó a listo en {cfg['arranque_max_min']} min"
        return None
    if cfg['inactividad_min'] and ahora - e['ultima_actividad'] >= cfg['inactividad_min'] * 60:
        return f"{cfg['inactividad_min']} min sin tokens"
    return None


def config():
    num = lambda k, d: float(os.environ.get(k) or d)
    return {'fin_epoch': num('DS41_FIN_EPOCH', 0), 'inactividad_min': num('DS41_INACTIVIDAD_MIN', 20), 'arranque_max_min': num('DS41_ARRANQUE_MAX_MIN', 90)}


# ── Apagar ──
def apagar(motivo):
    pod, llave = os.environ.get('RUNPOD_POD_ID'), os.environ.get('RUNPOD_API_KEY')
    log(f'APAGANDO el pod {pod}: {motivo}')
    if not pod or not llave:
        log('sin RUNPOD_POD_ID o RUNPOD_API_KEY: no puedo apagarme solo. Apágalo desde el Studio: ds41.py apagar')
        return False
    h = {'Authorization': f'Bearer {llave}', 'Content-Type': 'application/json', 'User-Agent': 'ds41-vigia/1'}
    for intento in range(1, 6):
        c, cuerpo = http(f'https://rest.runpod.io/v1/pods/{pod}', 'DELETE', h, timeout=30)
        if c in (200, 204):
            log(f'pod borrado por REST (intento {intento})')
            return True
        q = json.dumps({'query': 'mutation($i: PodTerminateInput!) { podTerminate(input: $i) }', 'variables': {'i': {'podId': pod}}}).encode()
        c2, cuerpo2 = http('https://api.runpod.io/graphql', 'POST', h, q, timeout=30)
        if c2 == 200 and '"errors"' not in cuerpo2:
            log(f'pod terminado por GraphQL (intento {intento})')
            return True
        log(f'no se pudo apagar (REST {c}: {cuerpo[:160]} · GraphQL {c2}: {cuerpo2[:160]}); reintento en 60 s')
        time.sleep(60)
    return False


def probar_llave_del_pod():
    pod, llave = os.environ.get('RUNPOD_POD_ID'), os.environ.get('RUNPOD_API_KEY')
    if not pod or not llave:
        log('AVISO: el pod no trae RUNPOD_POD_ID/RUNPOD_API_KEY; el autoapagado no funcionará')
        return
    c, _ = http(f'https://rest.runpod.io/v1/pods/{pod}', headers={'Authorization': f'Bearer {llave}', 'User-Agent': 'ds41-vigia/1'})
    log(f'llave del pod para autoapagado: {"OK" if c == 200 else f"FALLA (HTTP {c})"}')


def guardar(e):
    try:
        with open(ESTADO, 'w') as f:
            json.dump(e, f)
    except OSError:
        pass


def bucle():
    cfg = config()
    nacio = time.time()
    pod = os.environ.get('RUNPOD_POD_ID', '')
    try:  # un reinicio del contenedor del MISMO pod no reinicia el reloj de arranque (el volumen sí lo comparten otros pods)
        previo = json.load(open(ESTADO))
        if previo.get('pod') == pod:
            nacio = previo.get('nacio', nacio)
    except (OSError, ValueError):
        pass
    e = {'pod': pod, 'nacio': nacio, 'listo_en': None, 'ultima_actividad': nacio, 'tokens': None}
    if not cfg['fin_epoch'] and float(os.environ.get('DS41_TOPE_HORAS') or 0) > 0:  # lanzado a mano desde la plantilla
        cfg['fin_epoch'] = nacio + float(os.environ['DS41_TOPE_HORAS']) * 3600
    log(f"vigía: tope {time.strftime('%H:%M', time.gmtime(cfg['fin_epoch'])) if cfg['fin_epoch'] else 'sin tope'} UTC, "
        f"inactividad {cfg['inactividad_min']:g} min, arranque máx {cfg['arranque_max_min']:g} min")
    probar_llave_del_pod()
    llave = os.environ.get('VLLM_API_KEY', '')
    while True:
        ahora = time.time()
        if not e['listo_en']:
            c, _ = http(f'{LOCAL}/v1/models', headers={'Authorization': f'Bearer {llave}'})
            if c == 200:
                sin, _ = http(f'{LOCAL}/v1/models')
                if sin == 200:
                    apagar('el endpoint responde SIN llave (VLLM_API_KEY no se aplicó)')
                    return
                e['listo_en'] = e['ultima_actividad'] = ahora
                log(f'servidor arriba en {int((ahora - e["nacio"]) / 60)} min; sin llave responde {sin} (bien)')
        else:
            c, m = http(f'{LOCAL}/metrics')
            if c == 200:
                total, enCurso = contadores(m)
                if enCurso > 0 or (e['tokens'] is not None and total > e['tokens']):
                    e['ultima_actividad'] = ahora
                e['tokens'] = total
        guardar(e)
        motivo = decidir(ahora, e, cfg)
        if motivo:
            apagar(motivo)
            return
        time.sleep(CADA_S)


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == '--apagar-ya':
        sys.exit(0 if apagar(' '.join(sys.argv[2:])) else 1)
    bucle()
