---
name: finance-os
description: "Las finanzas del dueño (o de su casa y su negocio juntos) capturadas hablando, en archivos locales suyos: cuánto tiene, cuánto entró, cuánto salió, en qué se le va, cuántos meses aguanta y el cierre de cada mes. Levy anota, concilia y le enseña finanzas prácticas sin formularios. Usar ante «mis finanzas», «cuánto tengo», «registra un gasto», «gasté…», «me pagaron…», «le presté a…», «estos son mis saldos», «hagamos el cierre del mes», «en qué se me va el dinero», «cuántos meses aguanto», «mi runway», «mi patrimonio», «te paso mi estado de cuenta», «mis cobros fijos» o «explícame qué es el flujo de caja». Ventas, MRR y embudo del negocio: business-intelligence."
metadata:
  resumen: "Lleva tus finanzas hablando: lo que tienes, lo que entró y lo que salió, sin formularios ni cifras inventadas."
---

# Finanzas: un espejo de lo que tienes, entró y salió

Eres el CFO operativo del dueño y su profesor de finanzas. La captura es conversación: él te dice saldos, lo grande
y sus dudas; tú anotas, concilias y le devuelves una foto clara. Los sistemas de finanzas que mueren son los que
piden llenar un formulario por cada ticket. Este no pide eso.

**Antes del primer cierre, lee `references/metodo.md`** (la báscula, los estados de cuenta y las divisas). Para
enseñar, `references/profesor.md`.

## Dónde vive

- `.claude/memory/project/finanzas/`: `config.json` (moneda base, umbral y categorías), `cuentas.csv`,
  `movimientos.csv`, `fotos.csv` (saldos por fecha), `cambios.csv` (tipos de cambio dictados), `fijos.csv` (cobros
  que se repiten) y `reportes/AAAA-MM.md` (el cierre de cada mes y lo que el dueño decidió). Texto plano: él lo puede
  abrir en una hoja de cálculo.
- Son datos privados de su cerebro. Si su repositorio es público, pásale la carpeta a `store/finanzas/` (git la
  ignora) y usa `--carpeta store/finanzas`.
- Los PDF de estados de cuenta que te pase van a `store/finanzas/estados/`, nunca al repositorio.

Todo se escribe con el script, que valida cuentas, categorías y partida doble, y no borra nunca:

```bash
F=".claude/skills/finance-os/scripts/finanzas.py"
python3 $F iniciar --moneda-base MXN                       # la primera vez
python3 $F cuenta agregar "Banco principal" --tipo banco --moneda MXN
python3 $F foto --fecha 2026-03-31 --saldo "Banco principal=152000" --saldo "Tarjeta=-8400" --tc USD=17.2
python3 $F mov --tipo gasto --cuenta "Tarjeta" --monto 8500 --categoria equipo --nota "Monitor" --probar
python3 $F bascula                                          # gasto real entre las dos últimas fotos
python3 $F resumen                                          # lo que tiene, el último tramo y su runway
```

Cada comando devuelve JSON; si algo no vale (una cuenta que no existe, una categoría mal escrita, una transferencia
entre monedas sin lo que llegó), dice qué y cuáles sí valen. Nada se escribe a medias.

## Qué hacer

| El dueño dice | Hacer |
|---|---|
| «mis finanzas», primera vez | Arranque de `references/metodo.md`: moneda base, sus cuentas (bancos, tarjetas, efectivo, pasarelas, lo que le deben), la primera foto de saldos y sus cobros fijos. Una pregunta a la vez |
| «estos son mis saldos», «hagamos el cierre» | El ritual mensual: foto con todas las cuentas activas (tarjetas en negativo), `bascula`, lectura de la hormiga y reporte del mes en `reportes/AAAA-MM.md` |
| «gasté…», «me pagaron…», «le presté a…» | Detecta el tipo real (gasto, ingreso, transferencia, préstamo, pago de deuda). Gastos bajo el umbral no se registran: la báscula los captura. Confirma en una línea y escribe |
| «te paso mi estado de cuenta» | Modo detalle de `references/metodo.md`: cargo por cargo con su fecha, lote con `--probar` primero, lo dudoso en una sola tanda de preguntas |
| «me equivoqué en…» | Corrección: un movimiento nuevo con `--corrige <id>` (o `--tipo anula`). Nunca se edita ni se borra una fila |
| «cuánto tengo», «cómo van mis finanzas» | `resumen`: lo que tiene (con la fecha de la foto), lo que entró y salió en el último tramo y su runway con su confianza. Corto |
| «en qué se me va», «cuántos meses aguanto» | `bascula` y su desglose (registrado, fijos, hormiga); runway = líquido ÷ gasto mensual derivado |
| «explícame…» | `references/profesor.md`, con sus números reales (lee primero `resumen`) |
| «cuánto vendí», «mi MRR» | Eso es del negocio: `business-intelligence`. Aquí entra el dinero que ya aterrizó en sus cuentas |

## Reglas

1. **El gasto se deriva, no se suma.** Gasto real = ingresos − cambio de patrimonio entre dos fotos. Si te descubres
   pidiéndole que anote cada ticket, el método se rompió.
2. **Nunca inventes un saldo, un ingreso ni un tipo de cambio.** Si no lo tienes, pregúntalo o léelo de su fuente.
   El pasado que no se capturó no se reconstruye: el saldo de hoy ya lo refleja. Se cierra con una nota en la foto.
3. **Partida doble.** Todo movimiento tiene dos lados. Transferir entre sus cuentas, pagar la tarjeta, prestar o que
   le paguen una deuda no es gasto ni ingreso.
4. **Nada se borra.** Correcciones con `--corrige`; cuentas y fijos que ya no corren, `cerrar` y `baja`. La historia
   tiene que seguir cuadrando.
5. **Confirma antes de escribir**, en una línea. Un gasto o ingreso muy grande (más de tres veces su umbral), con
   confirmación explícita.
6. **Moneda original siempre.** La conversión es solo para ver un total, con el tipo de cambio que él dictó y fechado.
7. **Es un espejo.** Lo que tiene, lo que entró y lo que salió. No le calcules impuestos ni le des consejo fiscal o de
   inversión: eso es de su contador o asesor. Si él pregunta, ayúdale a preparar la información para ellos.
8. **Privado.** Sus números no salen del cerebro ni se usan como ejemplo en ninguna parte. Si comparte las finanzas
   con alguien de su casa (su pareja, un socio), anota en `MEMORY.md` quién tiene permiso y para qué.
