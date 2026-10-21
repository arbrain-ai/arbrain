"""Piezas compartidas de los candados (PreToolUse). Sin dependencias, solo biblioteca estándar.

Edición del alumno: viajan el freno de envíos y «no pelear la pantalla». Sin estos candados ambas
reglas dependerían de que el modelo se portara bien. Una defensa que exige acordarse no defiende.

Contrato de salida:
- Claude Code: JSON `hookSpecificOutput` con `permissionDecision: deny` y la razón en español
  (o `additionalContext` para inyectar contexto). Salida 0.
- Codex (`--runtime codex`): razón por stderr y salida 2, la vía estándar de los hooks de Codex.
"""
import hashlib
import json
import os
import re
import shlex
import sys
import time
import unicodedata
from pathlib import Path

HOOKS = Path(__file__).resolve().parent
TMP = HOOKS / 'tmp'


def runtime() -> str:
    return 'codex' if '--runtime' in sys.argv and sys.argv[sys.argv.index('--runtime') + 1:][:1] == ['codex'] else 'claude'


def leer_payload(raw: str) -> dict:
    data = json.loads(raw) if raw.strip() else {}
    return data if isinstance(data, dict) else {}


def registrar(candado: str, evento: str, **datos) -> None:
    """Bitácora local (nunca la campana del dueño). Jamás lanza."""
    try:
        TMP.mkdir(parents=True, exist_ok=True)
        fila = {'t': time.strftime('%Y-%m-%dT%H:%M:%S'), 'candado': candado, 'evento': evento, **datos}
        with open(TMP / 'candados.jsonl', 'a', encoding='utf-8') as f:
            f.write(json.dumps(fila, ensure_ascii=False)[:4000] + '\n')
    except Exception:
        pass


def denegar(razon: str, rt: str | None = None) -> int:
    rt = rt or runtime()
    if rt == 'codex':
        print(razon, file=sys.stderr)
        return 2
    print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny',
                                             'permissionDecisionReason': razon}}, ensure_ascii=False))
    return 0


def contexto(texto: str) -> int:
    print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'additionalContext': texto}}, ensure_ascii=False))
    return 0


# ---------- Shell ----------

OPERADORES = {';', '&', '&&', '|', '||', '(', ')', '\n', ';;', '|&'}


def tokens_shell(cmd: str) -> list[str]:
    """Tokeniza como bash (comillas fuera) y conserva los operadores como tokens propios.
    Lanza ValueError con comillas desbalanceadas: quien llama decide si abre o cierra."""
    lex = shlex.shlex(cmd, posix=True, punctuation_chars=';&|()\n')
    lex.whitespace = ' \t\r'
    lex.whitespace_split = True
    lex.commenters = ''
    return list(lex)


HEREDOC = re.compile(r'<<-?\s*([\'"]?)([A-Za-z_][A-Za-z0-9_]*)\1')


def sin_heredocs(cmd: str) -> str:
    """Quita el cuerpo de cada heredoc: es texto (un script, un correo, prosa), no comandos.
    La línea que lo abre se queda, así `gog gmail send --body-file - <<EOF` se sigue viendo."""
    lineas, salida, i = cmd.split('\n'), [], 0
    while i < len(lineas):
        linea = lineas[i]
        salida.append(linea)
        i += 1
        for m in HEREDOC.finditer(linea):
            fin = m.group(2)
            while i < len(lineas) and lineas[i].strip() != fin:
                i += 1
            i += 1  # el delimitador
    return '\n'.join(salida)


def segmentos(cmd: str, profundidad: int = 0) -> list[list[str]]:
    """Comandos simples del texto. Desenvuelve `bash -c "..."`, `sh -c`, `zsh -c` y `eval`."""
    segs, actual = [], []
    for t in tokens_shell(sin_heredocs(cmd)):
        if t in OPERADORES or (t and set(t) <= set(';&|()\n')):
            if actual:
                segs.append(actual)
            actual = []
        else:
            actual.append(t)
    if actual:
        segs.append(actual)
    if profundidad < 3:
        extra = []
        for s in segs:
            for i, t in enumerate(s):
                base = os.path.basename(t)
                anidado = None
                if base in ('bash', 'sh', 'zsh') and '-c' in s[i + 1:i + 4]:
                    j = s.index('-c', i + 1)
                    anidado = s[j + 1] if j + 1 < len(s) else None
                elif t == 'eval' and i + 1 < len(s):
                    anidado = ' '.join(s[i + 1:])
                if anidado:
                    try:
                        extra.extend(segmentos(anidado, profundidad + 1))
                    except ValueError:
                        extra.append(anidado.split())
        segs.extend(extra)
    return segs


def bases(seg: list[str]) -> list[str]:
    return [os.path.basename(t) for t in seg]


# ---------- La cita del dueño ----------

COMILLAS = str.maketrans({c: ' ' for c in '«»“”"\'‘’`'})


def normalizar(texto: str) -> str:
    t = unicodedata.normalize('NFC', texto).casefold().translate(COMILLAS)
    t = re.sub(r'\s+', ' ', t).strip()
    return t.strip('.,;:!?¡¿ ')


def _textos_usuario(entrada: dict) -> list[str]:
    """Texto que tecleó la persona en una línea de transcript (Claude Code o Codex).
    Nunca cuenta resultados de herramientas: el contenido de una página no es permiso."""
    if entrada.get('isMeta') or entrada.get('isCompactSummary'):
        return []
    for msg in (entrada.get('message'), entrada.get('payload'), entrada):
        if isinstance(msg, dict) and msg.get('role') == 'user':
            contenido = msg.get('content')
            if isinstance(contenido, str):
                return [contenido]
            if isinstance(contenido, list):
                return [b.get('text', '') for b in contenido
                        if isinstance(b, dict) and b.get('type') in ('text', 'input_text') and isinstance(b.get('text'), str)]
            return []
    return []


def cita_en_transcript(cita: str, rutas: list[str]) -> bool:
    """True si la cita aparece textual (normalizada) en algún mensaje humano de los transcripts."""
    objetivo = normalizar(cita)
    if len(objetivo) < 8:
        return False
    for ruta in rutas:
        if not ruta:
            continue
        p = Path(os.path.expanduser(ruta))
        if not p.is_file():
            continue
        with open(p, encoding='utf-8', errors='replace') as f:
            for linea in f:
                if '"user"' not in linea:
                    continue
                try:
                    entrada = json.loads(linea)
                except ValueError:
                    continue
                if not isinstance(entrada, dict):
                    continue
                for texto in _textos_usuario(entrada):
                    if objetivo in normalizar(texto):
                        return True
    return False


def rutas_transcript(payload: dict) -> list[str]:
    return [r for r in (payload.get('transcript_path'), payload.get('agent_transcript_path')) if isinstance(r, str) and r]


def clave_sesion(payload: dict) -> str:
    sid = payload.get('session_id')
    if isinstance(sid, str) and sid:
        return re.sub(r'[^A-Za-z0-9_.-]', '_', sid)[:80]
    return hashlib.sha1(str(payload.get('transcript_path', '')).encode()).hexdigest()[:16]


# ---------- Programa en posición de comando ----------

PREFIJOS = {'nohup', 'command', 'exec', 'sudo', 'time', 'do', 'then', 'else', '{', '!', 'builtin'}
ENVOLTORIOS = {'xargs', 'env', 'timeout', 'gtimeout', 'caffeinate', 'nice'}
INTERPRETES = re.compile(r'^(python[0-9.]*|bash|sh|zsh|node|tsx|uv|ruby|perl)$')


def programa(seg: list[str]) -> tuple[str, list[str]]:
    """(nombre, argumentos) de lo que de verdad corre el segmento: salta VAR=valor, prefijos,
    envoltorios (xargs, env, timeout) e intérpretes (python3 script.py → script.py).
    Así `grep -n --send correo_86.py` es grep, no un envío."""
    i = 0
    while i < len(seg):
        t = seg[i]
        if t in PREFIJOS or re.match(r'^[A-Za-z_][A-Za-z0-9_]*=', t):
            i += 1
            continue
        nombre = os.path.basename(t)
        if nombre in ENVOLTORIOS:
            i += 1
            while i < len(seg) and (seg[i].startswith('-') or re.match(r'^[0-9.]+[smhd]?$', seg[i])):
                i += 1
            continue
        if INTERPRETES.match(nombre):
            j = i + 1
            if nombre == 'uv' and j < len(seg) and seg[j] == 'run':
                j += 1
            while j < len(seg) and seg[j].startswith('-'):
                j += 2 if seg[j] in ('-m', '-W', '-X') else 1
            if j < len(seg) and not seg[j].startswith('-') and '-c' not in seg[i + 1:j]:
                return os.path.basename(seg[j]), seg[j + 1:]
        return nombre, seg[i + 1:]
    return '', []
