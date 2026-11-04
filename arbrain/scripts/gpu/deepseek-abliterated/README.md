# DeepSeek-V4.1-Flash abliterated en RunPod

Receta para rentar 4× RTX PRO 6000 (u otra opción), servir el modelo con vLLM en formato Anthropic y conectarlo al
modo «abliterated» de la cabina. Todo lo que cobra pide `--va`; apagar no.

```bash
python3 ds41.py precios                      # precios vivos, solo lectura
python3 ds41.py volumen --dc US-NC-1 --va    # disco de 600 GB para los pesos (US$1.38/día)
python3 ds41.py arrancar --tope-horas 2 --va # el pod (US$9.96/h), se apaga solo
python3 ds41.py esperar && python3 ds41.py probar && python3 ds41.py conectar
python3 ds41.py apagar                       # borra el pod, anota el costo en GPU-LOG
python3 test_ds41.py                         # pruebas sin red
```

Guía completa, conceptos y costo de la primera sesión: `docs/builds/deepseek-abliterated-2026-11-03/RUNBOOK.md`.
Adaptado de github.com/hanxiao/DeepSeek-V4.1-Flash-1017-FP8-abliterated-4x-RTX-PRO-6000 (Apache-2.0, commit
`1777471`): `pod/parches/` y `probar.sh` vienen de ahí.
