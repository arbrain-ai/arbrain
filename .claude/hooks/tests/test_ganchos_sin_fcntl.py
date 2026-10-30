"""Ganchos del alumno sin fcntl ni base de zonas (Windows, 29 oct 2026).

En Windows no existe `fcntl` y el Python de python.org no trae tzdata. Esta prueba lo simula en cualquier equipo:
`sys.modules['fcntl'] = None` hace que `import fcntl` lance ImportError, y un ZoneInfo que truena imita la falta de
base de zonas. Carga los ganchos que viajan a la copia del alumno (en el repo fuente, la versión de plantilla; en la
copia, los de .claude/hooks), los ejecuta como los corre Claude Code (JSON por stdin) en una raíz temporal con
edición «cliente» y comprueba que no truenan y que la zona horaria nunca queda fija a la de Ciudad de México.
"""
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zoneinfo
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
HOOKS = ROOT / '.claude/hooks'
PLANTILLA = ROOT / 'arbrain/empaquetado/plantillas/claude/hooks'
# En el repo fuente, agenda-context, memory-recall, candados y demás salen en versión de plantilla; en la copia ya
# están en .claude/hooks. capture-conversation e install.sh viajan tal cual desde .claude/hooks.
ORIGEN_ALUMNO = PLANTILLA if PLANTILLA.is_dir() else HOOKS
DE_PLANTILLA = ['agenda-context.py', 'memory-recall.py', 'intent-context.py', 'candados_comun.py',
                'candado-freno.py', 'candado-pantalla.py', 'codex-context.py', 'py.sh']
DIRECTOS = ['capture-conversation.py']

# Fuera de Windows no hay msvcrt: se pone uno de mentira para recorrer el mismo camino del candado que en Windows.
MSVCRT_FALSO = ("try:\n"
                "    import msvcrt\n"
                "except ImportError:\n"
                "    import types\n"
                "    msvcrt = types.ModuleType('msvcrt'); msvcrt.LK_NBLCK, msvcrt.LK_UNLCK = 2, 0\n"
                "    msvcrt.locking = lambda fd, modo, n: None\n"
                "    sys.modules['msvcrt'] = msvcrt\n")
SIN_FCNTL = ("import runpy, sys\n"
             "sys.modules['fcntl'] = None\n" + MSVCRT_FALSO +
             "gancho = sys.argv[1]\n"
             "sys.argv = sys.argv[1:]\n"
             "runpy.run_path(gancho, run_name='__main__')\n")


def zonas_disponibles():
    try:
        zoneinfo.ZoneInfo('Europe/Madrid')
        return True
    except Exception:
        return False


def cargar(ruta, nombre):
    """Importa un gancho con fcntl ausente (como en Windows)."""
    spec = importlib.util.spec_from_file_location(nombre, ruta)
    modulo = importlib.util.module_from_spec(spec)
    # Los candados agregan su propia carpeta a sys.path; aquí no se toca (lo audita el generador).
    with mock.patch.dict(sys.modules, {'fcntl': None}):
        spec.loader.exec_module(modulo)
    return modulo


class RaizAlumno(unittest.TestCase):
    """Una raíz temporal con los ganchos del alumno y arbrain/EDICION = cliente."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        destino = self.raiz / '.claude/hooks'
        destino.mkdir(parents=True)
        for nombre in DE_PLANTILLA:
            if (ORIGEN_ALUMNO / nombre).is_file():
                shutil.copy2(ORIGEN_ALUMNO / nombre, destino / nombre)
        for nombre in DIRECTOS:
            shutil.copy2(HOOKS / nombre, destino / nombre)
        (self.raiz / 'arbrain').mkdir()
        (self.raiz / 'arbrain/EDICION').write_text('# edición de la copia\ncliente\n', encoding='utf-8')
        (self.raiz / '.claude/now.md').write_text('# Ahora\n\n## Hoy\n- `09:00` Revisión de cotización · año fiscal\n',
                                                  encoding='utf-8')
        self.env = {k: v for k, v in os.environ.items()
                    if k not in ('ARBRAIN_TZ', 'ARBRAIN_EDICION', 'CLAUDECLAW_DAEMON', 'CLAUDECLAW_SOURCE',
                                 'CLAUDE_INVOKED_BY', 'ARBRAIN_MODO_PERMISOS')}
        self.env['CLAUDE_PROJECT_DIR'] = str(self.raiz)

    def tearDown(self):
        self.tmp.cleanup()

    def gancho(self, nombre):
        return self.raiz / '.claude/hooks' / nombre

    def correr(self, nombre, entrada, *args, env=None):
        r = subprocess.run([sys.executable, '-I', '-c', SIN_FCNTL, str(self.gancho(nombre)), *args],
                           input=json.dumps(entrada, ensure_ascii=False), capture_output=True, text=True,
                           encoding='utf-8', cwd=self.raiz, env={**self.env, **(env or {})}, timeout=30)
        salida = r.stdout + r.stderr
        self.assertNotIn('Traceback', salida, f'{nombre} tronó:\n{salida}')
        self.assertIn(r.returncode, (0, 2), f'{nombre} salió con {r.returncode}:\n{salida}')
        return r


class GanchosSinFcntl(RaizAlumno):
    def test_cada_gancho_importa_sin_fcntl(self):
        for nombre in DE_PLANTILLA + DIRECTOS:
            if not nombre.endswith('.py') or not self.gancho(nombre).is_file():
                continue
            with self.subTest(gancho=nombre):
                cargar(self.gancho(nombre), 'gancho_' + nombre.replace('-', '_')[:-3])

    def test_ninguna_plantilla_importa_fcntl_sin_guarda(self):
        for nombre in DE_PLANTILLA + DIRECTOS:
            ruta = self.gancho(nombre)
            if not nombre.endswith('.py') or not ruta.is_file():
                continue
            for n, linea in enumerate(ruta.read_text(encoding='utf-8').splitlines(), 1):
                # `try:import fcntl` (con su except) pasa; un `import ..., fcntl` al inicio de línea, no.
                if re.match(r'^\s*(import|from)\b.*\bfcntl\b', linea):
                    self.fail(f'{nombre}:{n} importa fcntl sin try/except: {linea.strip()}')

    def test_ejecutan_con_entrada_minima(self):
        transcript = self.raiz / 'sesion.jsonl'
        transcript.write_text(json.dumps({
            'type': 'user', 'uuid': 'u1', 'timestamp': '2026-10-27T22:30:00Z',
            'message': {'role': 'user', 'content': [{'type': 'text', 'text': '¿Qué hago hoy? señal ñandú'}]}},
            ensure_ascii=False) + '\n', encoding='utf-8')
        base = {'session_id': 'sesion-prueba', 'transcript_path': str(transcript), 'cwd': str(self.raiz)}
        casos = [
            ('memory-recall.py', {**base, 'hook_event_name': 'UserPromptSubmit', 'prompt': '¿qué tengo hoy en mi agenda?'}, []),
            ('memory-recall.py', {}, []),
            ('candado-freno.py', {**base, 'hook_event_name': 'PreToolUse', 'tool_name': 'Bash',
                                  'tool_input': {'command': 'echo hola'}}, []),
            ('candado-freno.py', {**base, 'hook_event_name': 'PreToolUse', 'tool_name': 'mcp__manos__observar',
                                  'tool_input': {}}, []),
            ('candado-pantalla.py', {**base, 'hook_event_name': 'PreToolUse', 'tool_name': 'Bash',
                                     'tool_input': {'command': 'ls'}}, []),
            ('capture-conversation.py', {**base, 'hook_event_name': 'Stop'}, ['--runtime', 'claude']),
            ('capture-conversation.py', {}, ['--runtime', 'claude']),
            ('capture-conversation.py', {**base, 'transcript_path': str(self.raiz / 'no-existe.jsonl')},
             ['--runtime', 'claude']),
            ('agenda-context.py', {}, []),
        ]
        for nombre, entrada, args in casos:
            if not self.gancho(nombre).is_file():
                continue
            with self.subTest(gancho=nombre, entrada=sorted(entrada)):
                self.correr(nombre, entrada, *args)
        r = self.correr('memory-recall.py', {**base, 'prompt': 'qué tengo hoy en mi agenda'})
        contexto = json.loads(r.stdout)['hookSpecificOutput']['additionalContext']
        self.assertIn('Revisión de cotización', contexto)
        diarios = list((self.raiz / '.claude/daily').glob('*.md'))
        self.assertEqual(len(diarios), 1, diarios)
        self.assertIn('señal ñandú', diarios[0].read_text(encoding='utf-8'))

    def test_ritual_hecho_corre_sin_fcntl_ni_zonas(self):
        # Con ARBRAIN_TZ puesta y sin base de zonas, el registro del ritual no truena: cae a la hora del equipo.
        codigo = ("import runpy, sys, zoneinfo\n"
                  "sys.modules['fcntl'] = None\n" + MSVCRT_FALSO +
                  "def falla(*a, **k): raise zoneinfo.ZoneInfoNotFoundError('sin base de zonas')\n"
                  "zoneinfo.ZoneInfo = falla\n"
                  "sys.argv = [sys.argv[1], '--ritual-hecho']\n"
                  "runpy.run_path(sys.argv[0], run_name='__main__')\n")
        r = subprocess.run([sys.executable, '-I', '-c', codigo, str(self.gancho('agenda-context.py'))],
                           capture_output=True, text=True, encoding='utf-8', cwd=self.raiz,
                           env={**self.env, 'ARBRAIN_TZ': 'Europe/Madrid'}, timeout=30)
        self.assertNotIn('Traceback', r.stdout + r.stderr, r.stderr)
        self.assertEqual(r.returncode, 0, r.stderr)
        estado = json.loads((self.raiz / 'arbrain/server/store/rituales/bajar-a-tierra.json').read_text(encoding='utf-8'))
        self.assertIn('hecho', estado)


class ZonaEnCliente(RaizAlumno):
    def cargar_con(self, nombre, env):
        with mock.patch.dict(os.environ, env, clear=False):
            for k in ('ARBRAIN_TZ', 'ARBRAIN_EDICION'):
                if k not in env:
                    os.environ.pop(k, None)
            return cargar(self.gancho(nombre), 'zona_' + nombre.replace('-', '_')[:-3])

    def test_capture_sin_arbrain_tz_usa_la_zona_del_equipo(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop('ARBRAIN_TZ', None)
            os.environ.pop('ARBRAIN_EDICION', None)
            m = self.cargar_con('capture-conversation.py', {})
            self.assertEqual(m.edicion(self.raiz), 'cliente')
            self.assertIsNone(m.zona(self.raiz), 'en cliente la zona es la del equipo, nunca México fija')

    @unittest.skipUnless(zonas_disponibles(), 'este Python no trae base de zonas (Windows sin tzdata)')
    def test_capture_respeta_arbrain_tz(self):
        m = self.cargar_con('capture-conversation.py', {})
        with mock.patch.dict(os.environ, {'ARBRAIN_TZ': 'Europe/Madrid'}):
            self.assertEqual(str(m.zona(self.raiz)), 'Europe/Madrid')
            dia = m.record({'type': 'user', 'uuid': 'u', 'timestamp': '2026-10-27T23:30:00Z',
                            'message': {'role': 'user', 'content': 'hola'}}, 'claude')['day']
            self.assertEqual(dia, '2026-10-28')  # 00:30 en Madrid; en Ciudad de México seguiría siendo el 27

    def test_capture_sin_base_de_zonas_no_truena(self):
        m = self.cargar_con('capture-conversation.py', {})
        with mock.patch.object(m, 'ZoneInfo', side_effect=zoneinfo.ZoneInfoNotFoundError('sin base')), \
                mock.patch.dict(os.environ, {'ARBRAIN_TZ': 'Europe/Madrid'}):
            self.assertIsNone(m.zona(self.raiz))

    @unittest.skipUnless(zonas_disponibles(), 'este Python no trae base de zonas (Windows sin tzdata)')
    def test_agenda_respeta_arbrain_tz(self):
        m = self.cargar_con('agenda-context.py', {'ARBRAIN_TZ': 'Europe/Madrid'})
        self.assertEqual(m.RITUAL_TZ, 'Europe/Madrid')
        self.assertEqual(str(m._ahora().tzinfo), 'Europe/Madrid')

    def test_agenda_sin_arbrain_tz_no_fija_mexico(self):
        m = self.cargar_con('agenda-context.py', {})
        self.assertIsNone(m.RITUAL_TZ)
        ahora = m._ahora()
        self.assertNotEqual(str(ahora.tzinfo), 'America/Mexico_City')
        self.assertEqual(ahora.utcoffset(), datetime.now().astimezone().utcoffset())

    def test_agenda_sin_base_de_zonas_cae_a_la_hora_local(self):
        m = self.cargar_con('agenda-context.py', {'ARBRAIN_TZ': 'Europe/Madrid'})
        with mock.patch.object(m, 'ZoneInfo', side_effect=zoneinfo.ZoneInfoNotFoundError('sin base')):
            ahora = m._ahora()
        self.assertIsInstance(ahora.tzinfo, timezone)
        self.assertEqual(m.ritual_context(self.raiz, ahora.replace(hour=19), {}), '')

    def test_plantillas_no_fijan_mexico(self):
        for nombre in DE_PLANTILLA:
            ruta = self.gancho(nombre)
            if ruta.is_file():
                with self.subTest(gancho=nombre):
                    self.assertNotIn('America/Mexico_City', ruta.read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
