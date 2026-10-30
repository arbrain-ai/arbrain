#!/usr/bin/env python3
"""GRAFO → PLAN — el compilador de topología a orquestación (cierra el hueco del metagrafo, 21 jul).

EL HUECO QUE CIERRA: el GRAFO DEL SISTEMA decía QUIÉN conecta con QUIÉN, pero derivar la
orquestación (qué corre en paralelo, en qué orden, con qué gates) era juicio del ejecutor leyendo
el spec. Este script lo vuelve DETERMINISTA: mapa y máquina, una sola pluma.

QUÉ HACE: lee un grafo en el schema conectoma (nodos = artefactos, aristas = transformaciones
tipadas script/agente/manual/mixta, lazos = comparadores sobre nodos/aristas) y deriva el PLAN:

  - FASES por orden topológico (capa de un artefacto = 1 + máx capa de sus insumos).
  - Dentro de una fase, transformaciones hacia ARTEFACTOS DISTINTOS = PARALELIZABLES
    (la regla de oro: dos agentes coexisten si escriben nodos disjuntos y se hablan por aristas).
  - Varias aristas al MISMO artefacto = convergencia (se marca: van al mismo worker/merge).
  - Los LAZOS se montan como GATES: al cerrar la fase que produce su nodo/arista anclada.
  - Tipos → ejecutores: script = correr determinista · agente = spawnear subagente (Sonnet) ·
    manual = checkpoint del dueño · mixta = agente con scripts.

USO:
  python3 grafo2plan.py GRAFO.json [-o plan.md] [--json plan.json]
  # GRAFO.json = schema conectoma (arbrain/public/conectoma/README.md) o un GRAFO DEL SISTEMA
  #              exportado del spec con el mismo shape.

Validado contra el grafo real de un pipeline de edición de video: deriva solo que el carril de CORTE y el de
DISEÑO corren en paralelo y convergen en timeline.json — exactamente lo que pasó en producción.
"""
import json, sys, argparse
from collections import defaultdict

EJECUTOR = {
    "script": "▸ correr script (determinista)",
    "agente": "◆ juicio del agente",
    "manual": "⏸ checkpoint del dueño",
    "mixta": "◆ agente con scripts",
}


def compilar(G):
    nodos = {n["id"]: n for n in G["nodos"]}
    aristas = G["aristas"]
    lazos = G.get("lazos", [])

    # Feedback remains in the source graph and in the plan, but cannot be a
    # prerequisite of the same iteration. Only EXPLICIT feedback is excluded.
    if len(nodos) != len(G["nodos"]):
        raise ValueError("IDs de nodo duplicados")
    if len({a["id"] for a in aristas}) != len(aristas):
        raise ValueError("IDs de arista duplicados")
    feedback = []
    entradas = defaultdict(list)   # nodo <- aristas que lo producen
    for a in aristas:
        if a["from"] not in nodos or a["to"] not in nodos:
            sys.exit(f"✗ arista '{a['id']}' referencia nodos inexistentes")
        role = a.get("plan_role", "dependency")
        if role not in ("dependency", "feedback"):
            raise ValueError(f"plan_role desconocido: {a['id']}")
        if role == "feedback":
            if not a.get("condition"):
                raise ValueError(f"Feedback sin condición: {a['id']}")
            feedback.append(a)
        else:
            entradas[a["to"]].append(a)

    # capa de cada nodo = 1 + max(capa de sus fuentes); raíces = 0. Con guard de ciclos.
    capa, visitando = {}, set()

    def capa_de(nid):
        if nid in capa:
            return capa[nid]
        if nid in visitando:
            sys.exit(f"✗ CICLO detectado pasando por '{nid}' — un plan exige DAG (los ciclos van como LAZOS, no aristas)")
        visitando.add(nid)
        c = 0 if not entradas[nid] else 1 + max(capa_de(a["from"]) for a in entradas[nid])
        visitando.discard(nid)
        capa[nid] = c
        return c

    for nid in nodos:
        capa_de(nid)

    # fase de una TRANSFORMACIÓN = capa de su artefacto destino
    fases = defaultdict(list)
    for a in aristas:
        if a.get("plan_role") != "feedback":
            fases[capa[a["to"]]].append(a)

    # lazos anclados: gate se corre al cerrar la fase que produce su ancla
    gates = defaultdict(list)
    ar_by_id = {a["id"]: a for a in aristas}
    for l in lazos:
        kind, ref = str(l.get("sobre", "")).split(":") if ":" in str(l.get("sobre", "")) else (None, None)
        if kind == "nodo" and ref in capa:
            gates[capa[ref]].append(l)
        elif kind == "arista" and ref in ar_by_id:
            edge = ar_by_id[ref]
            anchor = edge["from"] if edge.get("plan_role") == "feedback" else edge["to"]
            gates[capa[anchor]].append(l)
        else:
            raise ValueError(f"Lazo sin ancla válida: {l.get('id')}")

    plan = []
    return_phases = defaultdict(list)
    for edge in feedback:
        return_phases[capa[edge["from"]]].append(edge)
    for f in sorted(set(fases) | set(gates) | set(return_phases)):

        ts = fases[f]
        destinos = defaultdict(list)
        for a in ts:
            destinos[a["to"]].append(a)
        grupos = []
        for dest, arls in destinos.items():
            grupos.append({
                "produce": dest,
                "produce_label": nodos[dest]["label"],
                "transformaciones": [
                    {"id": a["id"], "label": a["label"], "tipo": a["tipo"],
                     "desde": nodos[a["from"]]["label"], "ejecutor": EJECUTOR.get(a["tipo"], a["tipo"])}
                    for a in arls
                ],
                "convergencia": len(arls) > 1,
            })
        plan.append({
            "fase": f,
            "paralelizable": len(grupos) > 1,
            "grupos": grupos,
            "retornos": return_phases.get(f, []),
            "gates": [{"id": l["id"], "label": l["label"], "estado": l.get("estado", ""),
                       "referencia": l.get("referencia", "")} for l in gates.get(f, [])],
        })
    return plan


def render_md(G, plan):
    out = [f"# Plan de orquestación — {G['titulo']}",
           f"\n> Derivado DETERMINISTA del grafo `{G['slug']}` por grafo2plan.py — no es juicio, es topología.",
           "> Regla: dentro de una fase, grupos hacia artefactos DISTINTOS son candidatos a paralelismo; comprobar recursos compartidos;",
           "> los gates de la fase se corren ANTES de avanzar a la siguiente.\n"]
    for p in plan:
        par = " · ⚡ GRUPOS EN PARALELO" if p["paralelizable"] else ""
        out.append(f"## Fase {p['fase']}{par}")
        for g in p["grupos"]:
            conv = " ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)" if g["convergencia"] else ""
            out.append(f"\n**→ produce `{g['produce_label']}`**{conv}")
            for t in g["transformaciones"]:
                out.append(f"- {t['ejecutor']} · **{t['label']}** (desde {t['desde']})")
        if p["gates"]:
            out.append("\n**Gates al cerrar la fase:**")
            for l in p["gates"]:
                ref = f" — referencia: {l['referencia']}" if l["referencia"] else ""
                out.append(f"- ↻ {l['label']} [{l['estado']}]{ref}")
        if p.get("retornos"):
            out.append("\n**Retornos condicionales (nueva iteración; no ejecutar automáticamente):**")
            for edge in p["retornos"]:
                out.append(f"- `{edge['id']}` → `{edge['to']}`: {edge['condition']}")
        out.append("")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("grafo")
    ap.add_argument("-o", "--out", help="escribir el plan.md aquí (default: stdout)")
    ap.add_argument("--json", help="escribir el plan como JSON aquí")
    args = ap.parse_args()

    # UTF-8 explícito: en Windows open() usa cp1252 y «→» o los acentos truenan o salen rotos.
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    with open(args.grafo, encoding="utf-8") as f:
        G = json.load(f)
    plan = compilar(G)
    md = render_md(G, plan)
    if args.out:
        with open(args.out, "w", encoding="utf-8", newline="\n") as f:
            f.write(md)
        print(f"✓ plan → {args.out} ({len(plan)} fases, "
              f"{sum(1 for p in plan if p['paralelizable'])} con paralelismo)")
    else:
        print(md)
    if args.json:
        with open(args.json, "w", encoding="utf-8", newline="\n") as f:
            json.dump({"slug": G["slug"], "fases": plan}, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
