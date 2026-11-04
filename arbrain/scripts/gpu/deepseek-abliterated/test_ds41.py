#!/usr/bin/env python3
"""Pruebas de la receta sin tocar RunPod: la API se simula y cualquier POST/DELETE no previsto hace fallar la prueba.

    python3 arbrain/scripts/gpu/deepseek-abliterated/test_ds41.py
"""
import base64
import io
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI / 'pod'))
import ds41  # noqa: E402
import vigia  # noqa: E402

PRECIOS = {o['gpu']: {'id': o['gpu'], 'securePrice': p, 'communityPrice': p * 0.7} for o, p in zip(ds41.OPCIONES.values(), [2.49, 8.99, 5.29, 3.99])}


class APIFalsa:
    """Responde lo de solo lectura; registra todo lo que cambiaría algo en la cuenta."""

    def __init__(self, saldo=8.19, pods=(), volumenes=()):
        self.saldo, self.pods, self.volumenes, self.cambios = saldo, list(pods), list(volumenes), []

    def __call__(self, url, metodo='GET', cuerpo=None, llave=None, timeout=30):
        if url == ds41.GRAPHQL:
            return 200, {'data': {
                'myself': {'clientBalance': self.saldo, 'currentSpendPerHr': 0},
                'gpuTypes': list(PRECIOS.values()),
                'dataCenters': [{'id': 'US-NC-1', 'storageSupport': True, 'listed': True, 'gpuAvailability': [{'gpuTypeId': ds41.OPCIONES['rtxpro6000x4']['gpu'], 'stockStatus': 'High'}]}],
            }}
        if metodo != 'GET':
            self.cambios.append((metodo, url, cuerpo))
            if url.endswith('/pods') and metodo == 'POST':
                return 201, {'id': 'pod123', 'costPerHr': 9.96}
            if url.endswith('/networkvolumes') and metodo == 'POST':
                return 201, {'id': 'vol1', 'dataCenterId': cuerpo['dataCenterId'], 'size': cuerpo['size']}
            return 204, None
        if url.endswith('/pods'):
            return 200, self.pods
        if url.endswith('/networkvolumes'):
            return 200, self.volumenes
        if '/v1/messages' in url:
            return 0, 'sin red'
        return 200, {'id': url.rsplit('/', 1)[-1], 'costPerHr': 9.96, 'desiredStatus': 'RUNNING'}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        self.env = d / 'server.env'
        self.env.write_text('RUNPOD_API_KEY=rp_falsa\nOTRA=1\n')
        os.chmod(self.env, 0o600)
        self.estado = d / 'ds41.json'
        self.log = d / 'GPU-LOG.md'
        self.p = [mock.patch.object(ds41, 'ESTADO', self.estado), mock.patch.dict(os.environ, {'ARBRAIN_SERVER_ENV': str(self.env)}),
                  mock.patch.object(ds41, 'gpu_log', self.anotar)]
        for x in self.p:
            x.start()
        os.environ.pop('RUNPOD_API_KEY', None)

    def anotar(self, fila):
        with self.log.open('a') as f:
            f.write(fila + '\n')

    def tearDown(self):
        for x in self.p:
            x.stop()
        self.tmp.cleanup()

    def correr(self, api, *argv):
        out = io.StringIO()
        with mock.patch.object(ds41, 'http', api), redirect_stdout(out):
            try:
                ds41.main(list(argv))
                codigo = 0
            except SystemExit as e:
                codigo = e.code
        return codigo, out.getvalue()


class Precios(Base):
    def test_costo_por_hora_secure(self):
        self.assertEqual(ds41.costo_hora('rtxpro6000x4', PRECIOS), 9.96)
        self.assertEqual(ds41.costo_hora('b300x2', PRECIOS), 17.98)
        self.assertEqual(ds41.costo_hora('h100x8', PRECIOS), 31.92)

    def test_volumen_600_gb(self):
        self.assertEqual(ds41.volumen_usd_dia(), 1.38)

    def test_saldo_debe_cubrir_el_tope_completo(self):
        self.assertIsNone(ds41.revisar_saldo(50, 9.96, 2))
        self.assertIn('no cubre', ds41.revisar_saldo(8.19, 9.96, 1))
        self.assertIn('no cubre', ds41.revisar_saldo(22, 9.96, 2))  # 19.92 + 15 % = 22.91
        self.assertIsNone(ds41.revisar_saldo(23, 9.96, 2))

    def test_precios_es_solo_lectura(self):
        api = APIFalsa()
        codigo, out = self.correr(api, 'precios', '--json')
        self.assertEqual(codigo, 0)
        self.assertEqual(api.cambios, [])
        d = json.loads(out)
        self.assertEqual(d['recomendada'], 'rtxpro6000x4')
        self.assertEqual({o['opcion'] for o in d['opciones']}, {'rtxpro6000x4', 'b300x2', 'h200x4', 'h100x8'})


class SinVaNoSeGasta(Base):
    def test_volumen_sin_va_no_crea(self):
        api = APIFalsa(saldo=50)
        codigo, out = self.correr(api, 'volumen', '--dc', 'US-NC-1')
        self.assertEqual((codigo, api.cambios), (0, []))
        self.assertIn('No se creó nada', out)

    def test_arrancar_sin_va_no_crea_y_no_imprime_secretos(self):
        api = APIFalsa(saldo=50)
        ds41.guardar_estado({'volumen': {'id': 'vol1', 'dataCenterId': 'US-NC-1', 'size': 600}})
        codigo, out = self.correr(api, 'arrancar')
        self.assertEqual((codigo, api.cambios), (0, []))
        self.assertIn('No se creó nada', out)
        self.assertNotIn('sk-ds41-', out)
        self.assertNotIn('rp_falsa', out)

    def test_arrancar_con_poco_saldo_se_niega_aunque_haya_va(self):
        api = APIFalsa(saldo=8.19)
        ds41.guardar_estado({'volumen': {'id': 'vol1', 'dataCenterId': 'US-NC-1', 'size': 600}})
        codigo, out = self.correr(api, 'arrancar', '--va')
        self.assertIn('no cubre', str(codigo))
        self.assertEqual(api.cambios, [])

    def test_receta_sin_probar_pide_experimental(self):
        codigo, _ = self.correr(APIFalsa(saldo=500), 'arrancar', '--opcion', 'h200x4', '--sin-volumen')
        self.assertIn('--experimental', str(codigo))

    def test_no_arranca_un_segundo_pod(self):
        api = APIFalsa(saldo=500, pods=[{'id': 'viejo', 'name': 'ds41-abliterated-rtxpro6000x4', 'desiredStatus': 'RUNNING'}])
        codigo, _ = self.correr(api, 'arrancar', '--sin-volumen', '--va')
        self.assertIn('Ya hay un pod', str(codigo))
        self.assertEqual(api.cambios, [])

    def test_con_va_y_saldo_crea_un_pod_con_tope(self):
        api = APIFalsa(saldo=50)
        ds41.guardar_estado({'volumen': {'id': 'vol1', 'dataCenterId': 'US-NC-1', 'size': 600}})
        antes = time.time()
        codigo, out = self.correr(api, 'arrancar', '--tope-horas', '2', '--va')
        self.assertEqual(codigo, 0, out)
        [(metodo, url, cuerpo)] = api.cambios
        self.assertEqual((metodo, url), ('POST', ds41.REST + '/pods'))
        self.assertEqual((cuerpo['networkVolumeId'], cuerpo['dataCenterIds'], cuerpo['gpuCount']), ('vol1', ['US-NC-1'], 4))
        fin = int(cuerpo['env']['DS41_FIN_EPOCH'])
        self.assertAlmostEqual(fin, antes + 7200, delta=5)
        e = json.loads(self.estado.read_text())
        self.assertTrue(e['pod']['llave'].startswith('sk-ds41-'))
        self.assertEqual(oct(self.estado.stat().st_mode & 0o777), '0o600')
        self.assertIn('abierto', self.log.read_text())


class Payload(unittest.TestCase):
    def test_con_volumen_monta_workspace_en_su_centro(self):
        env = ds41.env_pod('rtxpro6000x4', 'sk', 0, 20, 90, False, 'X')
        p = ds41.payload_pod('rtxpro6000x4', env, {'id': 'v', 'dataCenterId': 'EU-RO-1'})
        self.assertEqual((p['cloudType'], p['volumeMountPath'], p['dataCenterIds'], p['ports']), ('SECURE', '/workspace', ['EU-RO-1'], ['8000/http']))
        self.assertEqual(p['env']['DS41_DATOS'], '/workspace/ds41')
        self.assertFalse(p['interruptible'])

    def test_sin_volumen_baja_al_disco_del_contenedor(self):
        p = ds41.payload_pod('rtxpro6000x4', ds41.env_pod('rtxpro6000x4', 'sk', 0, 20, 90, True, 'X'))
        self.assertNotIn('networkVolumeId', p)
        self.assertGreaterEqual(p['containerDiskInGb'], 600)
        self.assertEqual(p['env']['DS41_DATOS'], '/root/ds41')

    def test_tachar(self):
        p = ds41.tachar(ds41.payload_pod('rtxpro6000x4', ds41.env_pod('rtxpro6000x4', 'sk-ds41-secreto', 0, 20, 90, False, 'A' * 4096)))
        self.assertNotIn('secreto', json.dumps(p))
        self.assertIn('KB en base64', p['env']['DS41_PAQUETE'])

    def test_paquete_trae_arranque_vigia_y_parches_y_el_arranque_lo_abre(self):
        b64 = ds41.paquete_pod()
        nombres = tarfile.open(fileobj=io.BytesIO(base64.b64decode(b64))).getnames()
        for n in ['arranque.sh', 'vigia.py', 'parches/encoding-1017-vllm.patch', 'parches/deepseek_v41-placeholder.patch']:
            self.assertIn(n, nombres)
        self.assertLess(len(b64), 32 * 1024)
        # el comando de arranque del pod, con /opt/ds41 cambiado a una carpeta temporal y sin ejecutar arranque.sh
        with tempfile.TemporaryDirectory() as d:
            cmd = ds41.ARRANQUE.replace('/opt/ds41', d).replace('&& exec bash', '&& test -f')
            r = subprocess.run(['/bin/bash', '-c', cmd], env={**os.environ, 'DS41_PAQUETE': b64}, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue((Path(d) / 'vigia.py').exists())

    def test_url_del_proxy(self):
        self.assertEqual(ds41.url_pod('abc123'), 'https://abc123-8000.proxy.runpod.net')


class EnvCabina(Base):
    def test_conectar_y_desconectar_solo_tocan_sus_tres_claves(self):
        ds41.guardar_estado({'pod': {'id': 'p1', 'url': 'https://p1-8000.proxy.runpod.net', 'llave': 'sk-ds41-x'}})
        self.correr(APIFalsa(), 'conectar')
        t = self.env.read_text()
        self.assertIn('ABLITERATED_BASE_URL=https://p1-8000.proxy.runpod.net', t)
        self.assertIn('CABINA_MODELO_ABLITERATED=DeepSeek-V4.1-Flash-1017-abliterated', t)
        self.assertIn('OTRA=1', t)
        self.assertEqual(oct(self.env.stat().st_mode & 0o777), '0o600')
        self.correr(APIFalsa(), 'desconectar')
        t = self.env.read_text()
        self.assertNotIn('ABLITERATED', t)
        self.assertEqual(t, 'RUNPOD_API_KEY=rp_falsa\nOTRA=1\n')

    def test_editar_env_no_pisa_claves_parecidas(self):
        t = ds41.editar_env('ABLITERATED_API_KEY_VIEJA=1\nABLITERATED_API_KEY=a\n', {'ABLITERATED_API_KEY': 'b'})
        self.assertEqual(t, 'ABLITERATED_API_KEY_VIEJA=1\nABLITERATED_API_KEY=b\n')

    def test_apagar_borra_anota_y_desconecta(self):
        ds41.guardar_estado({'pod': {'id': 'p1', 'url': 'https://p1-8000.proxy.runpod.net', 'llave': 'sk', 'inicio': time.time() - 1800, 'usd_hora': 9.96, 'opcion': 'rtxpro6000x4'}})
        self.correr(APIFalsa(), 'conectar')
        api = APIFalsa()
        codigo, out = self.correr(api, 'apagar')
        self.assertEqual(codigo, 0, out)
        self.assertEqual([c[0] for c in api.cambios], ['DELETE'])
        self.assertIn('US$4.98', out)
        self.assertNotIn('ABLITERATED', self.env.read_text())
        self.assertNotIn('pod', json.loads(self.estado.read_text()))


class Vigia(unittest.TestCase):
    cfg = {'fin_epoch': 10_000, 'inactividad_min': 20, 'arranque_max_min': 90}

    def test_tope_de_horas_gana_siempre(self):
        self.assertIn('tope', vigia.decidir(10_000, {'nacio': 0, 'listo_en': 5, 'ultima_actividad': 9_999}, self.cfg))

    def test_arranque_trabado(self):
        self.assertIsNone(vigia.decidir(89 * 60, {'nacio': 0, 'listo_en': None, 'ultima_actividad': 0}, self.cfg))
        self.assertIn('no llegó', vigia.decidir(90 * 60, {'nacio': 0, 'listo_en': None, 'ultima_actividad': 0}, self.cfg))

    def test_inactividad_solo_cuenta_despues_de_listo(self):
        e = {'nacio': 0, 'listo_en': 100, 'ultima_actividad': 100}
        self.assertIsNone(vigia.decidir(100 + 19 * 60, e, self.cfg))
        self.assertIn('sin tokens', vigia.decidir(100 + 20 * 60, e, self.cfg))
        self.assertIsNone(vigia.decidir(100 + 20 * 60, e, {**self.cfg, 'inactividad_min': 0}))

    def test_contadores_de_metrics_de_vllm(self):
        m = '\n'.join(['# HELP x', 'vllm:prompt_tokens_total{model_name="m"} 1200.0', 'vllm:generation_tokens_total{model_name="m"} 300.0',
                       'vllm:num_requests_running{model_name="m"} 1.0', 'vllm:num_requests_waiting{model_name="m"} 0.0', 'vllm:otra 99'])
        self.assertEqual(vigia.contadores(m), (1500.0, 1.0))

    def test_apagar_sin_llave_del_pod_no_revienta(self):
        with mock.patch.dict(os.environ, {}, clear=True), redirect_stdout(io.StringIO()):
            self.assertFalse(vigia.apagar('prueba'))


if __name__ == '__main__':
    unittest.main(verbosity=1)
