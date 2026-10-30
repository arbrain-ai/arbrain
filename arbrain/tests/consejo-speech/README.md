# Contrato de lectura manual / selección

Prueba de navegador que importa AudioButton y el motor real. Sólo SpeechSynthesis se simula para inspeccionar qué texto llega al dispositivo sin producir audio ni gasto.

Desde la raíz:

```sh
mkdir -p /tmp/consejo-speech-qa
agent-server/node_modules/.bin/esbuild arbrain/tests/consejo-speech/fixture.tsx --bundle --jsx=automatic --outfile=/tmp/consejo-speech-qa/fixture.js
cp arbrain/tests/consejo-speech/index.html /tmp/consejo-speech-qa/index.html
python3 -m http.server 3349 --bind 127.0.0.1 --directory /tmp/consejo-speech-qa
```

Abrir localhost:3349 en Chrome. Al cargar: active=false, ninguna salida de voz. “Seleccionar segunda frase” → altavoz: salida exacta `Sólo esta selección.`, total=1. “Restablecer” → altavoz: salida `Primera frase completa.`, total=3. “Restablecer” detiene, id=null. El botón usa pointerdown para conservar la selección real; no se llama directamente al handler para pasar la prueba.

Ejecutado 10 sep 2026 por Computer Use: todos esos estados observados. No certifica sonido físico ni selección táctil de Safari iOS.
