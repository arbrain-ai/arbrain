---
name: os-audit
description: "Auditar en solo lectura Artificial Brain: rutas e índices rotos, instrucciones desactualizadas, duplicidades, trabajo sin publicar y órganos sin resultados recientes. Usar para auditoría, limpieza o verificación tras una migración. Para diagnosticar o reparar servicios, artificial-brain."
---

# OS Audit — ¿el sistema dice la verdad sobre si mismo?

Un OS agentico no se rompe de golpe: se **pudre en silencio**. Los indices siguen
apuntando, los crons siguen listados, el `now.md` sigue sirviendo datos. Todo
se ve vivo. Lo unico que cambio es que ya no es cierto.

Esta skill corre el chequeo que separa *lo que el sistema declara* de *lo que hay*.

> **Linaje.** Tip #2 de Nate Herk, "Steal My Exact AI OS Setup" (jul 2026):
> *have AI audit itself*. Traducido a nuestro vocabulario, mas un check que el no tiene:
> **organos**, el patron organo-zombie (un cron vivo en apariencia que no produce).

## Correr

```bash
python3 .claude/skills/os-audit/scripts/os_audit.py            # markdown a stdout
python3 .claude/skills/os-audit/scripts/os_audit.py --write    # + guarda en .claude/audits/
python3 .claude/skills/os-audit/scripts/os_audit.py --json     # para pipelines
python3 .claude/skills/os-audit/scripts/os_audit.py --check organos
```

Exit code `0` = VERDE, `1` = hay hallazgos. Sirve como gate en un cron si algun dia programas uno (`--cron`: escribe el reporte y solo habla si hay ROJO).

## Regla dura: READ-ONLY

El script **jamas** arregla, mueve, renombra ni borra. Entrega el reporte y para.
Esto no es timidez, es el contrato: un auditor que ademas repara no es auditor, y un
`rm` automatico sobre un sistema que ya esta mintiendo es como se pierde trabajo real.

Al ACTUAR sobre los hallazgos:

| Tipo de fix | Quien lo hace |
|---|---|
| Aditivo (indexar un huerfano, corregir un puntero, documentar) | Levy, directo |
| Mover / consolidar / archivar backstage | Levy, **con `mv` reversible** + tombstone-con-motivo |
| Borrado irreversible, superficies visibles, poda de crons | **Firma del dueño.** Levy propone con evidencia, nunca ejecuta |

## Los checks

| Check | La pregunta | Rojo cuando |
|---|---|---|
| **routing** | ¿Todo lo que los routers prometen existe? | un puntero de CLAUDE.md / MEMORY.md / MEMORY-indice.md / medula no resuelve |
| **index_truth** | ¿Los índices y referencias alcanzables coinciden con el disco? | Un enlace desde MEMORY/MEMORY-user/MEMORY-indice/MEMORY-archivo o sus referencias apunta a un archivo ausente; patrones ambiguos y huérfanos quedan ámbar |
| **freshness** | ¿Las capas volatiles estan frescas? | `now.md` muy viejo — sus datos ya no se citan como actuales; sin daily logs recientes |
| **presupuesto** | ¿Cuanto contexto se paga en cada conversacion? | la esencia o una entrada del indice pasan su techo; el hook de recall no corre |
| **organos** | ¿Algun organo esta vivo en apariencia pero sin producir? | un cron activo lleva >7 dias sin correr |
| **bloat** | ¿Volvio a existir lo que ya matamos? | resucito un path prohibido, o una skill esta viva Y archivada a la vez |
| **higiene** | ¿Hay trabajo que solo existe en este disco? | (ambar) muchos sin commitear, o commits sin pushear |

Los routers auditados y los paths prohibidos estan al inicio del script (`ROUTERS`,
`PROHIBIDOS`). **Cuando se mate algo, se agrega ahi** — asi el audit defiende la decision.

---

# LOS PRINCIPIOS

> Esto no es contexto de relleno: es el **criterio** con el que se lee un reporte y se
> decide que hacer. Leer la skill sin esta parte es correr el script sin entenderlo.

## Las cuatro pudriciones del contexto

Un OS no falla de golpe: se pudre. Y se pudre de **cuatro** maneras. Todo hallazgo del
reporte es una de estas — nombrarla es la mitad del fix.

| Pudricion | Que es | Nuestro equivalente | Fix |
|---|---|---|---|
| **Poisoning** | un dato FALSO entre los buenos; el agente lo repite con confianza | una memoria que afirma algo que ya no es cierto; un puntero fantasma en un indice | el mas facil: verificacion / human in the loop |
| **Bloat** | tanta data que la aguja se pierde en el pajar | skills muertas, memorias sin podar, un CLAUDE.md que crecio a manual | segmentar, no acumular |
| **Confusion** | el dato falta o es irrelevante, y el agente **rellena inventando** | una memoria huerfana que Levy nunca abre | routing correcto |
| **Clash** | dos fuentes que se contradicen y el agente no sabe cual mandar | el tombstone dice archivada, el disco dice viva | jerarquia explicita de quien manda |

Poisoning y confusion se parecen: en **poisoning** agarra un hecho que esta ahi y es falso;
en **confusion** el hecho no esta y lo inventa para no dejar el hueco.

## Expertise vs situacional (la distincion que mas ahorra)

- **EXPERTISE** = el reglamento. Quien eres, tus metas, como opera el negocio. Va cargado
  **siempre**, como system prompt.
- **SITUACIONAL** = se jala **just-in-time**, cuando la pregunta lo pide, y no vive en el contexto.

La analogia: el **director** sabe como se arma un salon de clases; la **maestra** sabe que
alumno no ve bien y que dos no pueden sentarse juntos. El director es expertise, la maestra
es situacional.

> **La regla:** todo lo que metimos como expertise **siendo** situacional es bloat que se
> paga en CADA corrida. Es exactamente el argumento del progressive disclosure — el indice
> apunta (expertise), el archivo se abre cuando el tema entra (situacional).

## Los cinco principios de higiene

**1. El router es router, no system prompt.**
El `CLAUDE.md` de la raiz responde *"¿donde vive que?"*. Los prompts especificos viven en los
`CLAUDE.md` de cada subcarpeta y en las skills. Cuando el router empieza a explicar en vez de
apuntar, se convirtio en manual y hay que dividirlo.

**2. Que la IA se audite a si misma — y que el auditor no repare.**
Es esta skill. Read-only no es timidez: un auditor que ademas arregla deja de ser auditor, y
un fix automatico sobre un sistema que ya esta mintiendo es como se pierde trabajo real.

**3. Crons que meten la data sola.**
Si te descubres pidiendo la misma data cada semana, no era situacional: era una cadencia sin
automatizar. Eso es un cron, no un recordatorio.

**4. Segmentar cuando un nodo crece solo.**
Dos wikis chicas y bien nombradas le ganan a una grande: el agente sabe **a cual ir** y no
barre 10x archivos para encontrar uno. Aplica a memorias, skills y references por igual.

**5. BACKTRACK — el unico que cambia el comportamiento de verdad.**
Cuando Levy falla (busco cinco minutos algo que estaba ahi, o dijo "no tengo acceso" cuando si
lo tenia), **"no vuelvas a fallar" no sirve de nada.** Lo que sirve:

> *"Reconstruye que hiciste: donde buscaste, en que orden, y por que NO encontraste ese dato.
> Despues arregla el routing que te hizo fallar."*

Que el agente pruebe su propio error y diga donde debio buscar. **Recien entonces** se arregla.
Cada backtrack es un hallazgo de routing que el audit no tenia como ver, porque el puntero
existia — solo estaba en el lugar equivocado.

## El test de los 30 segundos

Antes de defender cualquier organizacion de carpetas: **piensa en algo que hiciste y encuentralo
a mano** — sin buscador, sin preguntarle a Levy, siguiendo carpetas. Si tu puedes seguir el
camino, un agente con routing tambien. Si tu te pierdes, el ya se perdio.

No hay una forma correcta de organizar un OS. **La unica forma incorrecta es seguir recibiendo
respuestas equivocadas y no hacer nada al respecto.**

## Regla dura: "no medible" NUNCA se reporta como cero

El check de **organos** distingue tres cosas que se ven iguales en un dashboard:

1. **VERDE** — el organo corrio y produjo.
2. **ROJO** — el organo esta activo y lleva dias sin correr. Zombie.
3. **AMBAR / SENSOR CIEGO** — no se puede medir desde aqui.

El caso 3 es real, pero **casi nunca es la respuesta correcta.** El daemon de Arbrain corre en
tu maquina y su scheduler vive en `arbrain/server/store/claudeclaw.db`; el check lo lee en solo
lectura. Alternativa manual: `cd arbrain/server && npx tsx src/schedule-cli.ts list`. Si algun dia
el daemon vive en otra maquina, el check debe preguntarle a ESE daemon, no a un disco vacio.

> **La leccion mas incomoda.** Un check que solo mira una DB local vacia reporta "SENSOR CIEGO"
> mientras el daemon real corre sano en otro lado, o reporta "cero" cuando nadie midio.
> Declararse ciego teniendo el sensor a la mano no es humildad: es el mismo pecado que este
> audit persigue, con mejor prensa. **Antes de reportar "no medible", agotar las vias que ya
> existen.** Un cron muerto en silencio que toca dinero es exactamente lo que este check caza.

## Dos formas de mentir, no una

Un falso VERDE deja pasar un problema. Un falso ROJO entrena a ignorar el tablero, y ese
daño es peor porque es permanente. En esta skill ya pasaron los dos el mismo dia:

| Falso | Que paso | Fix |
|---|---|---|
| ROJO | `last_run` viene en **segundos** y se dividia entre 1000 ⇒ todos los crons sanos salieron como zombies de "20,649 dias" | unidades correctas |
| ROJO | buscar `/error/` en el `last_result` marcaba **"Sin errores."** como fallo | la convencion real: un cron que fallo ARRANCA con ⚠️ |
| ROJO | 36 punteros "rotos" de los cuales 31 eran menciones o repos hermanos sin clon | resolver por sufijo + externos |
| ROJO | ambar permanente por "pesa >500 MB" sobre videos de referencia que una skill CITA | el peso es dato, no hallazgo |
| VERDE | "SENSOR CIEGO" con el daemon real disponible | preguntar al daemon real |

**Calibrar contra los datos, no contra la intuicion.** Cada uno de esos se cerro midiendo el
censo real, no razonando sobre como deberia verse.

## Cadencia

Semanal (domingo, junto a la planeacion) o antes/despues de cualquier cirugia. El reporte
va a `.claude/audits/YYYY-MM-DD-os-audit.md` con `--write`; ahi se acumula el historial y se
puede ver si un hallazgo lleva semanas ignorado, que es su propia señal.
