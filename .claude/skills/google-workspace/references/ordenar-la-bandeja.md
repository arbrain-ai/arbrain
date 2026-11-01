# Ordenar la bandeja por primera vez

Leer completo antes de mover un solo correo. Es lo único de esta skill que toca miles de mensajes de golpe, y da
vértigo: por eso lleva dos seguros y un número dicho antes de ejecutar. Criterio del método de Daniel Santacoloma
(«Mano derecha: correo y agenda»), traducido a `gog`.

Banderas fijas en todos los comandos: `--account "$A" --json --no-input`.

## Qué esperar (díselo antes de empezar)

- Toma una tarde. Su parte son tres momentos: revisar la lista de quién le escribe, dar el sí a los filtros y dar
  el sí al archivado grande.
- La mayoría de lo que le llega suele ser publicidad, mucho más de lo que él cree. **Nada se borra:** lo que sale
  de la bandeja sigue en Gmail y se encuentra con una búsqueda.
- No prometas «una bandeja de veinte correos». Lo que sobrevive al ruido es correo real sin atender, y alguien
  tiene que mirarlo una vez. **Dile el número real antes de ejecutar, no después.**

## 1. Medir antes de tocar

No clasifiques a ojo. Barre varios meses por ventanas de fecha y agrupa por **dirección** del remitente:

```bash
gog gmail messages search 'in:inbox after:2026/08/01 before:2026/09/01' --all --account "$A" --json --no-input
gog gmail search 'in:inbox after:2026/08/01 before:2026/09/01' --all --count --account "$A" --json --no-input
```

- `--all` recorre todas las páginas; sin él solo ves la primera y pierdes correos en silencio.
- `--count` da el total exacto. Úsalo para cuadrar lo que agrupaste.
- Agrupa y cuenta con un script corto (Python) sobre el JSON, no a mano. Unas pocas decenas de remitentes
  concentran casi todo el volumen: son unas setenta decisiones, no miles.

## 2. El cruce que decide: a quién le responde

Contar quién escribe no basta. Lo que separa señal de ruido es **si él ha respondido alguna vez**:

```bash
gog gmail search 'in:sent to:alguien@empresa.com' --all --count --account "$A" --json --no-input
```

Hazlo para cada remitente grande. Un remitente que escribe mucho y al que nunca respondió es ruido medido, no una
corazonada.

## 3. Su lista (primer momento suyo)

Muéstrale una tabla corta: remitente (la dirección completa), cuántos correos, si alguna vez respondió y tu
propuesta (`1-Responder`, `3-Leer`, `4-Ruido`). Él corrige. Reglas:

- **Por dirección, no por dominio.** `info@cliente.com` puede ser ruido y `ana.perez@cliente.com` su cliente más
  importante. Un dominio entero va a una etiqueta solo si todas sus direcciones son máquina.
- **Persona o máquina:** si el mensaje trae `List-Unsubscribe`, es comercial
  (`gog gmail get <messageId> --format metadata --headers From,List-Unsubscribe`).
- Lo que no sepas clasificar, pregúntalo. No adivines.

## 4. Sus contactos

Lo más probable es que su libreta de Google tenga gente de hace años y a casi nadie de con quien trabaja hoy. Por
eso Gmail no sabe quién importa. Con su sí sobre la lista, crea los contactos de sus interlocutores actuales:

```bash
gog contacts search "<nombre>" --account "$A" --json --no-input
gog contacts create --given "<Nombre>" --family "<Apellido>" --email <correo> --org "<Empresa · rol>" \
  --account "$A" --json --no-input
```

Desde ese momento la regla es simple: en contactos → bandeja; no está y parece persona → pregúntale; máquina →
ruido.

## 5. Etiquetas y filtros (segundo momento suyo)

Crea las cinco etiquetas si no existen (`gog gmail labels list`; `gog gmail labels create 4-Ruido`). Revisa los
filtros que ya tiene para no duplicar (`gog gmail settings filters list`). Luego, con su sí explícito sobre la
lista de filtros:

```bash
gog --dry-run gmail settings filters create --from info@tienda.com --add-label 4-Ruido --archive \
  --account "$A" --json --no-input
```

Y sin `--dry-run` cuando cuadre. Un filtro actúa sobre lo que llega, 24 horas, aunque tú estés apagado.

**Tiendas y aerolíneas** mandan publicidad y confirmaciones desde el mismo dominio. Archiva solo la publicidad y
conserva la tarjeta de embarque:

```bash
gog gmail settings filters create --query 'category:promotions from:(tienda.com OR aerolinea.com)' \
  --add-label 4-Ruido --archive --account "$A" --json --no-input
```

Nunca `--trash` ni `--forward` en un filtro.

## 6. Lo que ya está en la bandeja (tercer momento suyo)

**Corta por criterio, no por fecha.** «Todo lo anterior a marzo» archiva conversaciones vivas y conserva basura
reciente. El criterio que funcionó:

- **Se queda:** lo de los últimos 30 días que no sea ruido ni promoción, más lo de sus contactos de los últimos
  90 días.
- **Se archiva:** todo lo demás, sin importar la fecha.

**Los dos seguros, sin excepción:**

1. **Etiqueta de rastro** en todo lo que muevas: `gog gmail labels create Archivado-2026-11-01` (la fecha de
   hoy). Revertir es buscarla y devolver.
2. **Respaldo en disco** con el id exacto de cada mensaje, fuera de su cerebro (no es memoria):
   `~/Arbrain-respaldos/correo/archivado-2026-11-01.txt`, un id por línea.

Pasos:

1. Saca los ids con `gog gmail messages search '<criterio>' --all --account "$A" --json --no-input` y guárdalos
   en el respaldo.
2. Anota el «antes»: `gog gmail labels get INBOX` y `gog gmail labels get TRASH` (cuántos hay en cada una).
3. **Dile el número exacto** («voy a archivar 18,240 correos; se quedan 612 en tu bandeja; nada se borra») y
   espera su sí.
4. Mueve en lotes de hasta 1,000 ids: primero uno con `--dry-run`, luego todos.

   ```bash
   gog gmail batch modify <id1> <id2> … --add Archivado-2026-11-01 --remove INBOX \
     --account "$A" --json --no-input
   ```

## 7. Probar que no se borró nada

- `gog gmail labels get Archivado-2026-11-01`: su total es igual al número de líneas del respaldo.
- `gog gmail labels get TRASH`: igual que en el «antes». Archivar no es borrar, y hay que probarlo.
- `gog gmail labels get INBOX`: lo que quedó, y se lo dices.

Anota en su memoria (`.claude/memory/reference/reglas-de-correo.md`) los filtros creados, la etiqueta de rastro y
dónde quedó el respaldo. Los ids no van a la memoria.

## Revertir

```bash
gog gmail messages search 'label:Archivado-2026-11-01' --all --account "$A" --json --no-input
gog gmail batch modify <id1> <id2> … --add INBOX --remove Archivado-2026-11-01 --account "$A" --json --no-input
```
