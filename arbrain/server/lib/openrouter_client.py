#!/usr/bin/env python3
"""
OpenRouter Client — Singleton compartido para scripts Python de Business OS.

Reemplaza el patron `requests.post('https://openrouter.ai/...')` raw que vive
duplicado en 14+ scripts en `arbrain/server/scripts/analytics/`. Tambien expone el
registry de modelos como constante `MODELS` para que ningun script tenga que
hardcodear strings de modelo.

Uso minimo:

    from pathlib import Path
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
    from openrouter_client import chat, MODELS, load_env

    load_env()
    response = chat(
        model=MODELS['flash_lite'],
        messages=[{'role': 'user', 'content': 'hola'}],
    )

Ver `arbrain/server/docs/openrouter/examples.md` para snippets completos.
"""
from __future__ import annotations

import os
import sys
import json
import time
import subprocess
from pathlib import Path
from typing import Any


# ─── Auto-install requests ──────────────────────────────────────────────────
def _ensure(pkg: str, import_name: str | None = None) -> None:
    try:
        __import__(import_name or pkg.replace('-', '_').split('.')[0])
    except ImportError:
        cmd = [sys.executable, '-m', 'pip', 'install', '-q', pkg]
        try:
            subprocess.check_call(cmd + ['--break-system-packages'])
        except subprocess.CalledProcessError:
            subprocess.check_call(cmd)


_ensure('requests')
import requests  # noqa: E402


# ─── Config ─────────────────────────────────────────────────────────────────
OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

# .env del daemon (arbrain/server/.env); si no existe, el de la carpeta de este archivo.
ENV_PATH_REAL = Path(__file__).resolve().parents[1] / '.env'
ENV_PATH_DEV = Path(__file__).resolve().parents[1] / '.env'


def _atribucion_openrouter() -> dict:
    import glob, json as _json
    for f in glob.glob(str(Path(__file__).resolve().parents[1] / 'src' / '*' / 'instalacion.json')):
        try:
            d = _json.loads(Path(f).read_text())
        except Exception:
            continue
        out = {}
        if d.get('openrouter_referer'): out['HTTP-Referer'] = d['openrouter_referer']
        if d.get('openrouter_titulo'): out['X-Title'] = d['openrouter_titulo']
        return out
    return {'X-Title': 'Arbrain'}


# ─── Model Registry ─────────────────────────────────────────────────────────
# Source of truth: `arbrain/server/docs/openrouter/model-registry.md`.
# Si agregas un modelo aqui, agregalo tambien al registry.md.
MODELS: dict[str, str] = {
    # Text — batch / clasificacion / extraccion
    'flash_lite': 'google/gemini-3.1-flash-lite-preview',     # DEFAULT batch
    'flash_2': 'google/gemini-3.1-flash-lite',                 # reasoning / agentes
    'flash_25': 'google/gemini-2.5-flash',                     # chat conversacional
    'flash_2_free': 'google/gemini-2.0-flash-exp:free',        # free tier (low-stakes)

    # Text — premium
    'claude_sonnet_45': 'anthropic/claude-sonnet-4.5',
    'claude_haiku_45': 'anthropic/claude-haiku-4.5',

    # Text — open weights frontier (coding/agentes, 1M ctx). Agregado 17 jun 2026.
    'glm_52': 'z-ai/glm-5.2',                                  # #1 Design Arena, coding open-weights

    # Imagen (NO usar desde aqui; usar `arbrain/server/scripts/generate-image.ts`)
    'nano_banana_2': 'google/gemini-3.1-flash-image-preview',
    'gpt_image_2': 'openai/gpt-5.4-image-2',
    'gemini_pro_image': 'google/gemini-3-pro-image-preview',
}


# ─── Cost Table ($/1M tokens) ───────────────────────────────────────────────
# Source of truth: `arbrain/server/docs/openrouter/cost-table.md`.
COSTS: dict[str, dict[str, float]] = {
    'google/gemini-3.1-flash-lite-preview': {'input': 0.075, 'output': 0.30},
    'google/gemini-3.1-flash-lite': {'input': 0.075, 'output': 0.30},
    'google/gemini-2.5-flash': {'input': 0.30, 'output': 2.50},
    'google/gemini-2.0-flash-exp:free': {'input': 0.0, 'output': 0.0},
    'anthropic/claude-sonnet-4.5': {'input': 3.00, 'output': 15.00},
    'anthropic/claude-haiku-4.5': {'input': 0.80, 'output': 4.00},
    'z-ai/glm-5.2': {'input': 1.40, 'output': 4.40},
}


# ─── Env loader ─────────────────────────────────────────────────────────────
def load_env() -> dict[str, str]:
    """Carga .env del Mac Mini real si existe, sino el local. Idempotente."""
    env_path = ENV_PATH_REAL if ENV_PATH_REAL.exists() else ENV_PATH_DEV
    out: dict[str, str] = {}
    if not env_path.exists():
        return out
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, _, v = line.partition('=')
        v = v.strip()
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        k = k.strip()
        if k:
            os.environ.setdefault(k, v)
            out[k] = v
    return out


# ─── HTTP session (singleton) ───────────────────────────────────────────────
_session: requests.Session | None = None


def _get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
    return _session


# ─── Core call ──────────────────────────────────────────────────────────────
def chat(
    model: str,
    messages: list[dict[str, Any]],
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
    response_format: dict[str, Any] | None = None,
    timeout: int = 60,
    max_retries: int = 3,
    retry_delay: float = 2.0,
    extra_headers: dict[str, str] | None = None,
    **extra_body: Any,
) -> dict[str, Any]:
    """
    Llama a OpenRouter chat completions con retries y session reuse.

    Args:
        model: ID del modelo. Usar MODELS['alias'] para evitar typos.
        messages: lista de {'role': 'system|user|assistant', 'content': '...'}
        temperature: 0.0-2.0. None usa el default del modelo.
        max_tokens: limite de output tokens. None = sin limite (cuidado costo).
        response_format: ej. {'type': 'json_object'} para forzar JSON.
        timeout: segundos por intento HTTP.
        max_retries: reintentos en caso de error 5xx o timeout.
        retry_delay: segundos base para exponential backoff (delay * 2^attempt).
        extra_headers: headers adicionales (ej. para tracking).
        **extra_body: campos extra para el body JSON (top_p, frequency_penalty, etc).

    Returns:
        Response dict con keys: id, choices, usage, model.

    Raises:
        RuntimeError si falla despues de max_retries.
        ValueError si OPENROUTER_API_KEY no esta en environment.
    """
    api_key = os.environ.get('OPENROUTER_API_KEY')
    if not api_key:
        # Intentar cargar el .env si aun no se hizo
        load_env()
        api_key = os.environ.get('OPENROUTER_API_KEY')
    if not api_key:
        raise ValueError(
            'OPENROUTER_API_KEY not set. Call load_env() first or set the env var.'
        )

    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }
    # Identifica las llamadas en el dashboard de OpenRouter (de la instalación original, si la hay).
    headers.update(_atribucion_openrouter())
    if extra_headers:
        headers.update(extra_headers)

    body: dict[str, Any] = {
        'model': model,
        'messages': messages,
        **extra_body,
    }
    if temperature is not None:
        body['temperature'] = temperature
    if max_tokens is not None:
        body['max_tokens'] = max_tokens
    if response_format is not None:
        body['response_format'] = response_format

    session = _get_session()
    last_error: Exception | None = None

    for attempt in range(max_retries):
        try:
            resp = session.post(OPENROUTER_URL, headers=headers, json=body, timeout=timeout)
        except (requests.Timeout, requests.ConnectionError) as e:
            last_error = e
            if attempt < max_retries - 1:
                time.sleep(retry_delay * (2 ** attempt))
                continue
            raise RuntimeError(f'OpenRouter network error after {max_retries} retries: {e}') from e

        if resp.status_code == 200:
            return resp.json()

        # Retry on 5xx y 429
        if resp.status_code >= 500 or resp.status_code == 429:
            last_error = RuntimeError(f'HTTP {resp.status_code}: {resp.text[:300]}')
            if attempt < max_retries - 1:
                time.sleep(retry_delay * (2 ** attempt))
                continue

        # 4xx (excepto 429): no retry, error del caller
        raise RuntimeError(f'OpenRouter HTTP {resp.status_code}: {resp.text[:500]}')

    raise RuntimeError(f'OpenRouter failed after {max_retries} retries: {last_error}')


# ─── Cost tracking ──────────────────────────────────────────────────────────
def track_cost(response: dict[str, Any], model: str) -> float:
    """
    Calcula el costo USD de una response de OpenRouter usando COSTS table.

    Args:
        response: dict retornado por chat().
        model: ID del modelo usado (debe estar en COSTS).

    Returns:
        Costo en USD (float). Retorna 0.0 si el modelo no esta en COSTS.
    """
    if model not in COSTS:
        return 0.0
    usage = response.get('usage', {})
    prompt_tokens = usage.get('prompt_tokens', 0)
    completion_tokens = usage.get('completion_tokens', 0)
    rates = COSTS[model]
    return (prompt_tokens * rates['input'] + completion_tokens * rates['output']) / 1_000_000


# ─── Convenience extractor ──────────────────────────────────────────────────
def get_text(response: dict[str, Any]) -> str:
    """Extrae el texto de la primera choice. Atajo para no escribir el path completo."""
    try:
        return response['choices'][0]['message']['content']
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError(f'Malformed OpenRouter response: {e}\n{response}') from e


def get_json(response: dict[str, Any]) -> Any:
    """Extrae y parsea JSON del primer choice. Solo si pediste response_format=json_object."""
    text = get_text(response)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f'Invalid JSON in response: {e}\nText: {text[:500]}') from e


# ─── CLI smoke test ─────────────────────────────────────────────────────────
if __name__ == '__main__':
    """Quick smoke test: python3 openrouter_client.py"""
    load_env()
    print('Testing OpenRouter client...')
    print(f'  API key present: {bool(os.environ.get("OPENROUTER_API_KEY"))}')
    print(f'  Models registered: {len(MODELS)}')
    print(f'  Costs registered: {len(COSTS)}')
    print()
    print('Sending test prompt to flash_lite...')
    resp = chat(
        model=MODELS['flash_lite'],
        messages=[{'role': 'user', 'content': 'Say "ok" in one word.'}],
        max_tokens=10,
        temperature=0.0,
    )
    print(f'  Response: {get_text(resp).strip()}')
    print(f'  Cost: ${track_cost(resp, MODELS["flash_lite"]):.6f}')
    print('OK.')
