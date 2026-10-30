#!/usr/bin/env node
const port = process.env.MISSION_CONTROL_DESKTOP_PORT || '3218';
const baseUrl = `http://127.0.0.1:${port}`;

const checks = [
  ['tasks', '/api/tasks'],
  ['draw3', '/api/draw3'],
  ['draw3 local cache', '/api/draw3?source=local'],
  ['chat sessions', '/api/chat/sessions?source=mc&limit=1'],
  ['local pull', '/api/local-first/pull'],
];

let failed = false;

for (const [label, path] of checks) {
  const url = `${baseUrl}${path}`;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    const body = await response.text();
    if (!response.ok) {
      failed = true;
      console.error(`${label}: HTTP ${response.status}`);
      continue;
    }

    let summary = `${body.length} bytes`;
    try {
      const json = JSON.parse(body);
      if (Array.isArray(json)) {
        summary = `${json.length} rows`;
      } else if (json && typeof json === 'object') {
        const keys = Object.keys(json).slice(0, 6).join(', ');
        summary = keys ? `keys: ${keys}` : 'object';
      }
    } catch {
      // Plain text responses are fine for smoke checks.
    }

    console.log(`${label}: OK (${summary})`);
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${label}: ${message}`);
  }
}

if (failed) {
  process.exit(1);
}
