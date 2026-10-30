/* Conectoma — renderer estándar: UN renderer, N grafos (grafos/<slug>.json).
   Nodos = artefactos · aristas = transformaciones tipadas (script/agente/manual/mixta)
   · lazos = comparadores montados sobre nodos o aristas.
   Estados: cubierta/activo (morado) · fragil (ámbar) · hueco/faltante (gris).
   La UI es espejo (AI-first): el grafo se edita hablando con Levy, aquí se contempla. */
/* global dagre */
(function () {
  'use strict';

  const COLORS = { cubierta: '#a968f7', fragil: '#e0a63c', hueco: '#55555f' };
  const DASH = { script: '', agente: '7 5', manual: '2 6', mixta: '11 4 2 4' };
  const TIPO_LABEL = {
    script: 'script determinista',
    agente: 'agente (juicio)',
    manual: 'manual (dueño)',
    mixta: 'mixta (script + agente)',
  };
  const CAT_LABEL = { media: 'media', texto: 'texto', edicion: 'edición', diseno: 'diseño', entrega: 'entrega',
    dominio: 'dominio', superficie: 'superficie', mundo: 'mundo', dueno: 'el dueño',
    s1: 'S1 · opera', s2: 'S2 · amortigua', s3: 'S3 · reparte', s3e: 'S3★ · audita',
    s4: 'S4 · radar', s5: 'S5 · identidad', sensor: 'sensor', algedonico: 'algedónico' };

  const $ = (id) => document.getElementById(id);
  const svgNS = 'http://www.w3.org/2000/svg';

  try {
    if (window.self !== window.top) document.body.classList.add('embedded');
  } catch { document.body.classList.add('embedded'); }

  const params = new URLSearchParams(location.search);
  const slug = params.get('g');

  if (!slug) {
    renderIndex();
  } else {
    fetch(`grafos/${encodeURIComponent(slug)}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`grafo "${slug}" no encontrado (${r.status})`);
        return r.json();
      })
      .then(renderGrafo)
      .catch((e) => {
        $('viewport').innerHTML = '';
        const d = document.createElement('div');
        d.id = 'msg';
        d.textContent = `⚠ ${e.message}`;
        $('viewport').appendChild(d);
      });
  }

  /* ---------------- índice (sin ?g) ---------------- */
  function renderIndex() {
    $('titulo').textContent = 'Conectomas';
    $('subtitulo').textContent = 'La topología de cada sistema: nodos, aristas y lazos.';
    $('viewport').hidden = true;
    const iv = $('indexView');
    iv.hidden = false;
    fetch('grafos/index.json')
      .then((r) => r.json())
      .then((data) => {
        const grid = document.createElement('div');
        grid.className = 'grid';
        for (const g of data.grafos) {
          const a = document.createElement('a');
          a.className = 'gcard';
          a.href = `?g=${encodeURIComponent(g.slug)}`;
          a.innerHTML = `<div class="gt"></div><div class="gs"></div>`;
          a.querySelector('.gt').textContent = g.titulo;
          a.querySelector('.gs').textContent = g.subtitulo;
          grid.appendChild(a);
        }
        iv.appendChild(grid);
      })
      .catch(() => {
        iv.textContent = '⚠ no pude leer grafos/index.json';
      });
  }

  /* ---------------- grafo ---------------- */
  function renderGrafo(G) {
    document.title = `Conectoma — ${G.titulo}`;
    $('titulo').textContent = G.titulo;
    $('subtitulo').textContent = G.subtitulo || '';

    /* frescura VISIBLE (11 ago 2026): `actualizado` es el changelog del mapa y
       nunca se mostraba — un mapa que confiesa su edad no puede mentir en silencio */
    if (G.actualizado) {
      let act = $('actualizado');
      if (!act) {
        act = document.createElement('div');
        act.id = 'actualizado';
        $('hdr').insertBefore(act, $('stats'));
      }
      act.textContent = `⟳ ${G.actualizado}`;
      act.title = G.actualizado;
    }

    const nodesEl = $('nodes');
    const edgesSvg = $('edges');

    /* 1. medir nodos y chips reales (DOM oculto) para el layout */
    const meas = document.createElement('div');
    meas.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0';
    document.body.appendChild(meas);

    const nodeDivs = new Map();
    for (const n of G.nodos) {
      const d = document.createElement('div');
      d.className = 'nodo' + (n.grafo ? ' hasgrafo' : '');
      d.dataset.cat = n.cat || '';
      d.innerHTML = `<div class="ncat"></div><div class="nlabel"></div>`;
      d.querySelector('.ncat').textContent = (CAT_LABEL[n.cat] || n.cat || 'artefacto') + (n.grafo ? ' · ⊞ grafo' : '');
      /* doble-click en un nodo ⊞ = descender directo a su conectoma (pedido del dueño 3 ago);
         el camino de 2 clicks (ficha → link) sigue vivo para descubrir. */
      if (n.grafo) {
        d.title = 'doble click: abrir su conectoma';
        d.addEventListener('dblclick', (ev) => {
          ev.stopPropagation();
          location.href = `?g=${encodeURIComponent(n.grafo)}`;
        });
      }
      d.querySelector('.nlabel').textContent = n.label;
      meas.appendChild(d);
      nodeDivs.set(n.id, d);
    }
    const chipDivs = new Map();
    for (const a of G.aristas) {
      const c = document.createElement('div');
      c.className = 'echip';
      c.dataset.estado = a.estado;
      c.textContent = a.label;
      meas.appendChild(c);
      chipDivs.set(a.id, c);
    }

    /* 2. layout dagre — compound si el grafo declara grupos (los miembros de un
       grupo quedan CONTIGUOS y dagre reporta el bbox del cluster tras el layout) */
    const grupos = G.grupos || [];
    const g = new dagre.graphlib.Graph({ multigraph: true, compound: grupos.length > 0 });
    g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 74, edgesep: 18, marginx: 50, marginy: 50 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of G.nodos) {
      const d = nodeDivs.get(n.id);
      g.setNode(n.id, { width: d.offsetWidth, height: d.offsetHeight });
    }
    for (const gr of grupos) {
      g.setNode(`grp:${gr.id}`, {});
      for (const nid of gr.nodos || []) {
        if (g.hasNode(nid)) g.setParent(nid, `grp:${gr.id}`);
      }
    }
    for (const a of G.aristas) {
      const c = chipDivs.get(a.id);
      g.setEdge(a.from, a.to, { width: c.offsetWidth + 14, height: c.offsetHeight + 26, labelpos: 'c' }, a.id);
    }
    dagre.layout(g);
    meas.remove();

    const W = Math.ceil(g.graph().width);
    const H = Math.ceil(g.graph().height);
    edgesSvg.setAttribute('width', W);
    edgesSvg.setAttribute('height', H);
    edgesSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    $('camera').style.width = `${W}px`;
    $('camera').style.height = `${H}px`;

    /* 2.5. territorios de GRUPO (actos) — el bbox lo reporta dagre tras el layout.
       Se pintan PRIMERO (DOM abajo) para que nodos/chips/lazos queden encima. */
    const selectable = [];
    for (const gr of grupos) {
      const cl = g.node(`grp:${gr.id}`);
      if (!cl || !Number.isFinite(cl.x)) continue;
      const pad = 14;
      const t = document.createElement('div');
      t.className = 'grupo';
      t.style.left = `${cl.x - cl.width / 2 - pad}px`;
      t.style.top = `${cl.y - cl.height / 2 - pad}px`;
      t.style.width = `${cl.width + pad * 2}px`;
      t.style.height = `${cl.height + pad * 2}px`;
      const lbl = document.createElement('div');
      lbl.className = 'glabel';
      lbl.textContent = gr.label || gr.id;
      t.appendChild(lbl);
      nodesEl.appendChild(t);
      const el = { kind: 'grupo', data: { ...gr, label: gr.label || gr.id, resumen: gr.resumen || '' }, doms: [t] };
      selectable.push(el);
      lbl.addEventListener('click', (ev) => { ev.stopPropagation(); select(el); });
    }

    /* 3. defs: flechas por estado */
    const defs = document.createElementNS(svgNS, 'defs');
    for (const [estado, color] of Object.entries(COLORS)) {
      const m = document.createElementNS(svgNS, 'marker');
      m.setAttribute('id', `arr-${estado}`);
      m.setAttribute('viewBox', '0 0 10 10');
      m.setAttribute('refX', '9');
      m.setAttribute('refY', '5');
      m.setAttribute('markerWidth', '7');
      m.setAttribute('markerHeight', '7');
      m.setAttribute('orient', 'auto-start-reverse');
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', 'M0,0 L10,5 L0,10 z');
      p.setAttribute('fill', color);
      m.appendChild(p);
      defs.appendChild(m);
    }
    edgesSvg.appendChild(defs);

    /* 4. aristas: path + hit-area + chip */
    for (const a of G.aristas) {
      const e = g.edge(a.from, a.to, a.id);
      const dPath = smoothPath(e.points);
      const color = COLORS[a.estado] || COLORS.hueco;

      const hit = document.createElementNS(svgNS, 'path');
      hit.setAttribute('d', dPath);
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'rgba(0,0,0,0)');
      hit.setAttribute('stroke-width', '16');
      hit.style.cursor = 'pointer';
      edgesSvg.appendChild(hit);

      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', dPath);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', a.estado === 'hueco' ? '1.6' : '2');
      path.setAttribute('marker-end', `url(#arr-${a.estado in COLORS ? a.estado : 'hueco'})`);
      path.setAttribute('opacity', a.estado === 'hueco' ? '0.75' : '0.9');
      const dash = DASH[a.tipo] || '';
      if (dash) path.setAttribute('stroke-dasharray', dash);
      edgesSvg.appendChild(path);

      const chip = chipDivs.get(a.id);
      chip.style.left = `${e.x}px`;
      chip.style.top = `${e.y}px`;
      nodesEl.appendChild(chip);

      const el = { kind: 'arista', data: a, doms: [chip], paths: [path] };
      selectable.push(el);
      chip.addEventListener('click', (ev) => { ev.stopPropagation(); select(el); });
      hit.addEventListener('click', (ev) => { ev.stopPropagation(); select(el); });
    }

    /* 5. nodos */
    for (const n of G.nodos) {
      const nd = g.node(n.id);
      const d = nodeDivs.get(n.id);
      d.style.left = `${nd.x - nd.width / 2}px`;
      d.style.top = `${nd.y - nd.height / 2}px`;
      nodesEl.appendChild(d);
      const el = { kind: 'nodo', data: n, doms: [d] };
      selectable.push(el);
      d.addEventListener('click', (ev) => { ev.stopPropagation(); select(el); });
    }

    /* 6. lazos anclados a nodo o arista */
    for (const l of G.lazos || []) {
      const b = document.createElement('div');
      b.className = 'lazo';
      b.dataset.estado = l.estado;
      b.textContent = '↻';
      b.title = l.label;
      const [kind, ref] = String(l.sobre || '').split(':');
      let x = 0, y = 0;
      if (kind === 'nodo' && g.node(ref)) {
        const nd = g.node(ref);
        x = nd.x + nd.width / 2 - 7;
        y = nd.y - nd.height / 2 + 3;
      } else if (kind === 'arista') {
        const a = G.aristas.find((ar) => ar.id === ref);
        const e = a && g.edge(a.from, a.to, a.id);
        if (e) { x = e.x; y = e.y - 30; }
      }
      if (!x && !y) continue;
      b.style.left = `${x}px`;
      b.style.top = `${y}px`;
      nodesEl.appendChild(b);
      const el = { kind: 'lazo', data: l, doms: [b] };
      selectable.push(el);
      b.addEventListener('click', (ev) => { ev.stopPropagation(); select(el); });
    }

    /* 6.5. notas — anotaciones humanas sobre el mapa (11 ago 2026).
       Se ANCLAN a un nodo o arista (sobre: "nodo:x" | "arista:y") para sobrevivir
       cualquier re-layout de dagre: la nota viaja con su elemento, jamás con
       coordenadas absolutas. Sin `sobre` = nota libre, apilada en el margen.
       Se editan hablándole a Levy (una pluma) — aquí solo se contemplan. */
    let freeNotes = null;
    for (const nt of G.notas || []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nota';
      b.textContent = '✎';
      b.title = nt.titulo || 'Abrir nota';
      b.setAttribute('aria-label', nt.titulo || 'Abrir nota');
      let x = null, y = null;
      const [kind, ref] = String(nt.sobre || '').split(':');
      if (kind === 'nodo' && g.node(ref)) {
        const nd = g.node(ref);
        x = nd.x - nd.width / 2 + 8;
        y = nd.y + nd.height / 2 + 10;
      } else if (kind === 'arista') {
        const a = G.aristas.find((ar) => ar.id === ref);
        const e = a && g.edge(a.from, a.to, a.id);
        if (e) { x = e.x + 12; y = e.y + 24; }
      }
      if (x == null) {
        /* nota LIBRE: vive en el MARGEN del viewport (no en el espacio del mapa) —
           no pertenece a ningún lugar del grafo, así que no pan/zoomea con él ni
           puede taparle un nodo. Columna pegada al borde izquierdo. */
        if (!freeNotes) {
          freeNotes = document.createElement('div');
          freeNotes.id = 'freenotas';
          $('viewport').appendChild(freeNotes);
        }
        b.classList.add('libre');
        freeNotes.appendChild(b);
      } else {
        b.style.left = `${x}px`;
        b.style.top = `${y}px`;
        nodesEl.appendChild(b);
      }
      const el = { kind: 'nota', data: { ...nt, label: nt.titulo || 'Nota', resumen: nt.texto || '' }, doms: [b] };
      selectable.push(el);
      b.addEventListener('click', (ev) => { ev.stopPropagation(); select(el); });
    }

    /* 6.7. vecindad al HOVER (11 ago 2026): pasar el mouse por un nodo ilumina sus
       aristas y vecinos y atenúa el resto — legibilidad en grafos densos. */
    const nodeDomById = new Map(G.nodos.map((n) => [n.id, nodeDivs.get(n.id)]));
    const camEl = $('camera');
    const focusSet = (items) => {
      camEl.classList.add('focus');
      items.forEach((x) => x && x.classList && x.classList.add('lit'));
    };
    const clearFocus = () => {
      camEl.classList.remove('focus');
      camEl.querySelectorAll('.lit').forEach((x) => x.classList.remove('lit'));
    };
    const vecindad = new Map(G.nodos.map((n) => [n.id, [nodeDomById.get(n.id)]]));
    for (const el of selectable) {
      if (el.kind !== 'arista') continue;
      const a = el.data;
      const chip = el.doms[0];
      const path = el.paths && el.paths[0];
      const fd = nodeDomById.get(a.from), td = nodeDomById.get(a.to);
      if (vecindad.has(a.from)) vecindad.get(a.from).push(chip, path, td);
      if (vecindad.has(a.to)) vecindad.get(a.to).push(chip, path, fd);
      const propio = [chip, path, fd, td];
      chip.addEventListener('mouseenter', () => focusSet(propio));
      chip.addEventListener('mouseleave', clearFocus);
    }
    for (const el of selectable) {
      if (el.kind !== 'lazo') continue;
      const [k, ref] = String(el.data.sobre || '').split(':');
      if (k === 'nodo' && vecindad.has(ref)) vecindad.get(ref).push(el.doms[0]);
      else if (k === 'arista') {
        const a = G.aristas.find((ar) => ar.id === ref);
        if (a) {
          if (vecindad.has(a.from)) vecindad.get(a.from).push(el.doms[0]);
          if (vecindad.has(a.to)) vecindad.get(a.to).push(el.doms[0]);
        }
      }
    }
    for (const [id, items] of vecindad) {
      const dom = nodeDomById.get(id);
      if (!dom) continue;
      dom.addEventListener('mouseenter', () => focusSet(items));
      dom.addEventListener('mouseleave', clearFocus);
    }

    /* 7. stats + leyenda */
    renderStats(G);
    renderLeyenda();

    /* 8. selección + ficha */
    let selected = null;
    function select(el) {
      if (selected) selected.doms.forEach((d) => d.classList.remove('sel'));
      selected = el;
      el.doms.forEach((d) => d.classList.add('sel'));
      renderFicha(el);
    }
    function deselect() {
      if (selected) selected.doms.forEach((d) => d.classList.remove('sel'));
      selected = null;
      renderOverview();   // vuelve a la narrativa del mapa, no a vacío
    }
    /* un paneo NO es un click: si el puntero se movió, no deseleccionar */
    $('viewport').addEventListener('click', () => {
      if (window.__camMoved) { window.__camMoved = false; return; }
      deselect();
    });
    /* La × CIERRA de verdad (bug cazado 3 ago con el grafo vsm): antes llamaba a
       deselect() → renderOverview(), que RE-PINTABA la narrativa en el mismo frame —
       estando en la narrativa, la × era incerrable por construcción. Tras un cierre
       explícito la narrativa queda descartada (no resucita con clicks al fondo);
       vuelve al recargar o al cambiar de grafo. */
    $('fclose').addEventListener('click', (ev) => {
      ev.stopPropagation();
      overviewDismissed = true;
      if (selected) { selected.doms.forEach((d) => d.classList.remove('sel')); selected = null; }
      $('ficha').hidden = true;
      refitIfIdle();   // recuperar el ancho completo al cerrar el panel
    });
    $('ficha').addEventListener('click', (ev) => ev.stopPropagation());
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (selected) { deselect(); return; }
      overviewDismissed = true;
      $('ficha').hidden = true;
      refitIfIdle();
    });

    /* 9. cámara */
    initCamera(W, H);

    /* 10. al cargar, muestra la NARRATIVA del mapa (para la audiencia) */
    renderOverview();
    const clean = document.createElement('button');
    clean.id = 'cleanView'; clean.type = 'button'; clean.textContent = 'Vista limpia';
    clean.setAttribute('aria-pressed', 'false');
    clean.addEventListener('click', () => {
      const on = document.body.classList.toggle('clean-view');
      clean.textContent = on ? 'Mostrar información' : 'Vista limpia';
      clean.setAttribute('aria-pressed', String(on));
      requestAnimationFrame(() => refitIfIdle());
    });
    document.body.appendChild(clean);
  }

  /* ---------------- ficha ---------------- */
  function renderFicha(el) {
    const f = $('ficha');
    const d = el.data;
    const rows = [];
    const chip = (cls, txt) => `<span class="chip2 ${cls}">${esc(txt)}</span>`;
    let kicker = '';
    let chips = '';
    let desc = '';

    if (el.kind === 'nodo') {
      kicker = 'Nodo · artefacto';
      chips = chip('tipo', CAT_LABEL[d.cat] || d.cat || 'artefacto');
      desc = d.desc || '';
      if (d.ruta) rows.push(['Ruta', `<code>${esc(d.ruta)}</code>`]);
      if (d.grafo) rows.push(['Sub-grafo', `<a class="glink" href="?g=${encodeURIComponent(d.grafo)}">⊞ abrir su conectoma →</a>`]);
    } else if (el.kind === 'arista') {
      kicker = 'Arista · transformación';
      chips = chip(d.estado, d.estado) + chip('tipo', TIPO_LABEL[d.tipo] || d.tipo);
      if (d.frente) chips += chip('frente', `frente ${d.frente} · fase 2`);
      desc = d.detalle || '';
      rows.push(['Flujo', `${esc(nodeLabel(d.from))} → ${esc(nodeLabel(d.to))}`]);
    } else if (el.kind === 'nota') {
      kicker = 'Nota · anotación';
      chips = chip('tipo', d.autor || 'Dueño');
      desc = d.detalle || '';
      if (d.sobre) {
        const [k, ref] = String(d.sobre).split(':');
        rows.push(['Sobre', k === 'nodo' ? esc(nodeLabel(ref)) : esc(ref)]);
      }
    } else if (el.kind === 'grupo') {
      kicker = 'Grupo · acto';
      chips = chip('tipo', `${(d.nodos || []).length} nodos`);
      desc = d.detalle || '';
    } else {
      kicker = 'Lazo · comparador';
      chips = chip(d.estado, d.estado);
      if (d.frente) chips += chip('frente', `frente ${d.frente} · fase 2`);
      desc = d.detalle || '';
      if (d.sensor) rows.push(['Sensor', esc(d.sensor)]);
      if (d.comparador) rows.push(['Comparador', esc(d.comparador)]);
      if (d.referencia) rows.push(['Referencia', esc(d.referencia)]);
    }

    // DOS CAPAS (estándar 22 jul): 'resumen' = en palabras humanas (lo que ve la audiencia,
    // prominente arriba); 'detalle' = el tecnicismo para los agentes (debajo, etiquetado).
    const resumen = d.resumen || '';
    f.querySelector('.fkicker').textContent = kicker;
    f.querySelector('h2').textContent = d.label;
    f.querySelector('.chips').innerHTML = chips;
    const fres = f.querySelector('.fresumen');
    fres.textContent = resumen;
    fres.style.display = resumen ? '' : 'none';
    const ftech = f.querySelector('.ftechlabel');
    ftech.style.display = (resumen && desc) ? '' : 'none';   // etiqueta solo si hay ambas capas
    const fdesc = f.querySelector('.fdesc');
    fdesc.textContent = desc;
    fdesc.style.display = desc ? '' : 'none';
    f.querySelector('.frows').innerHTML = rows
      .map(([k, v]) => `<div class="frow"><div class="fk">${k}</div><div class="fv">${v}</div></div>`)
      .join('');
    f.hidden = false;
  }

  /* overview: la NARRATIVA del grafo en palabras humanas — se muestra al cargar y al deseleccionar,
     para que quien mira (la audiencia) entienda de qué va el mapa sin clickear nada. */
  function renderOverview() {
    const G = grafoCache;
    if (!G || !G.narrativa || overviewDismissed) { $('ficha').hidden = true; return; }
    const f = $('ficha');
    f.querySelector('.fkicker').textContent = 'El mapa · en palabras';
    f.querySelector('h2').textContent = G.titulo;
    f.querySelector('.chips').innerHTML = '';
    const fres = f.querySelector('.fresumen');
    fres.textContent = G.narrativa;
    fres.style.display = '';
    f.querySelector('.ftechlabel').style.display = 'none';
    f.querySelector('.fdesc').style.display = 'none';
    f.querySelector('.frows').innerHTML = '';
    f.hidden = false;
    refitIfIdle();   // el grafo se centra en el espacio que deja el panel
  }

  let grafoCache = null;
  /* true tras un cierre EXPLÍCITO de la narrativa (× o Escape sin selección):
     renderOverview() la respeta y no re-abre. Se resetea al recargar/cambiar de grafo. */
  let overviewDismissed = false;
  /* re-encuadre perezoso: lo asigna initCamera; se dispara al abrir/cerrar la ficha
     para que el grafo se acomode al espacio REAL — pero solo mientras el usuario
     no haya tomado la cámara con sus manos (respetar su paneo es ley). */
  let refitIfIdle = () => {};
  /* espacio horizontal que la ficha le come al viewport (panel lateral desktop).
     En modo bottom-sheet (<900px) no reserva nada. */
  function fichaReserve(vw) {
    const f = $('ficha');
    if (!f || f.hidden || document.body.classList.contains('clean-view')) return 0;
    if (vw < 900) return 0;
    return Math.min(362, Math.round(vw * 0.38)) + 24;
  }
  function nodeLabel(id) {
    if (!grafoCache) return id;
    const n = grafoCache.nodos.find((x) => x.id === id);
    return n ? n.label : id;
  }

  /* ---------------- stats + leyenda ---------------- */
  function renderStats(G) {
    grafoCache = G;
    const count = (arr, estado) => arr.filter((x) => x.estado === estado).length;
    const a = G.aristas;
    const l = G.lazos || [];
    const notas = (G.notas || []).length;
    $('stats').innerHTML = [
      pill('morado', `${count(a, 'cubierta')} cubiertas`),
      pill('ambar', `${count(a, 'fragil')} frágiles`),
      pill('gris', `${count(a, 'hueco')} huecos`),
      pill('oro', `${count(l, 'activo')} lazos activos`),
      pill('gris', `${count(l, 'faltante') + count(l, 'fragil')} lazos por cerrar`),
      notas ? pill('ambar', `${notas} nota${notas === 1 ? '' : 's'}`) : '',
    ].filter(Boolean).join('');
    function pill(dot, txt) {
      return `<span class="pill"><span class="dot ${dot}"></span>${esc(txt)}</span>`;
    }
  }

  function renderLeyenda() {
    const line = (color, dash, txt) =>
      `<span class="lg"><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="${color}" stroke-width="2"${dash ? ` stroke-dasharray="${dash}"` : ''}/></svg>${txt}</span>`;
    $('leyenda').innerHTML = [
      line(COLORS.cubierta, '', 'cubierta (la dinámica existe)'),
      line(COLORS.fragil, '', 'frágil'),
      line(COLORS.hueco, '', 'hueco (sin dinámica)'),
      line('#8b8b96', '7 5', 'agente'),
      line('#8b8b96', '2 6', 'manual'),
      `<span class="lg"><span style="display:inline-flex;width:14px;height:14px;border-radius:50%;background:var(--oro);color:#1a1005;font-size:9px;align-items:center;justify-content:center">↻</span>lazo (comparador) · click en todo para su ficha</span>`,
    ].join('');
  }

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* Catmull-Rom → Bézier: curva suave por los puntos de dagre */
  function smoothPath(points) {
    if (!points || points.length < 2) return '';
    if (points.length === 2) return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
    const p = points;
    let d = `M${p[0].x},${p[0].y}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[Math.max(0, i - 1)];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[Math.min(p.length - 1, i + 2)];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
    }
    return d;
  }

  /* ---------------- cámara (patrón maquina.html + touch pinch) ---------------- */
  function initCamera(W, H) {
    const vp = $('viewport');
    const cam = $('camera');
    let s = 1, tx = 0, ty = 0;

    const apply = () => {
      const m = 120;
      const vw = vp.clientWidth, vh = vp.clientHeight;
      tx = Math.min(vw - m, Math.max(m - W * s, tx));
      ty = Math.min(vh - m, Math.max(m - H * s, ty));
      cam.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    };
    const zoomAt = (cx, cy, factor) => {
      const next = Math.min(2.5, Math.max(0.12, s * factor));
      tx = cx - (cx - tx) * (next / s);
      ty = cy - (cy - ty) * (next / s);
      s = next;
      apply();
    };
    /* dos encuadres: BANDA (fit a la altura, anclado al inicio — se RECORRE la línea
       de ensamblaje paneando) y TODO (el grafo completo). ⌘0 alterna. Un grafo muy
       apaisado arranca en banda; uno compacto arranca completo. */
    let fitMode = 'banda';
    const fitAll = () => {
      const vw = vp.clientWidth, vh = vp.clientHeight;
      /* el encuadre TODO respeta la ficha abierta: el grafo se centra en el
         espacio que queda a su izquierda, no escondido detrás del panel */
      const availW = Math.max(240, vw - fichaReserve(vw));
      s = Math.max(0.12, Math.min(availW / (W + 40), vh / (H + 40), 1.15));
      tx = (availW - W * s) / 2;
      ty = (vh - H * s) / 2;
      apply();
    };
    const fitBanda = () => {
      const vh = vp.clientHeight;
      s = Math.max(0.12, Math.min(vh / (H + 60), 1.1));
      tx = 24;
      ty = (vh - H * s) / 2;
      apply();
    };
    const fit = () => (fitMode === 'banda' ? fitBanda() : fitAll());
    const toggleFit = () => {
      fitMode = fitMode === 'banda' ? 'todo' : 'banda';
      fit();
    };
    if (W / Math.max(H, 1) < 2.2) fitMode = 'todo';

    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      else { tx -= e.deltaX; ty -= e.deltaY; apply(); }
    }, { passive: false });

    /* pinch de trackpad (WKWebView/Safari) — solo si no hay pinch táctil activo */
    let base = 1, gx = 0, gy = 0;
    vp.addEventListener('gesturestart', (e) => {
      if (pointers.size >= 2) return;
      e.preventDefault(); base = s; gx = e.clientX; gy = e.clientY;
    });
    vp.addEventListener('gesturechange', (e) => {
      if (pointers.size >= 2) return;
      e.preventDefault(); zoomAt(gx, gy, (base * e.scale) / s);
    });
    vp.addEventListener('gestureend', (e) => e.preventDefault());

    /* pan por arrastre + pinch de dos dedos (pointer events) */
    const pointers = new Map();
    let pinchD = 0, moved = 0;
    vp.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.nodo, .echip, .lazo, .nota, #ficha, #camctl')) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      vp.setPointerCapture(e.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      }
      moved = 0;
      window.__camMoved = false;
      vp.classList.add('dragging');
    });
    vp.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      if (pointers.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD > 0 && d > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchD);
        pinchD = d;
        moved += 10;
      } else {
        moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
        tx += e.clientX - p.x;
        ty += e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        apply();
      }
      if (moved > 5) window.__camMoved = true;
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      pinchD = 0;
      if (!pointers.size) vp.classList.remove('dragging');
    };
    vp.addEventListener('pointerup', up);
    vp.addEventListener('pointercancel', up);

    addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); toggleFit(); } });
    /* el iframe de la Biblioteca puede montar con alto 0 (overlay): re-encuadrar
       cuando el viewport tome su tamaño real, hasta que el usuario interactúe */
    let interacted = false;
    const markInteract = () => { interacted = true; };
    vp.addEventListener('pointerdown', markInteract);
    vp.addEventListener('wheel', markInteract, { passive: true });
    new ResizeObserver(() => (interacted ? apply() : fit())).observe(vp);

    /* controles VISIBLES de cámara (− ⛶ +): el paneo/pinch existe desde el día 1
       pero era invisible — "se sale del mapa y no puedo cambiar eso" (el dueño,
       11 ago 2026). ⛶ alterna banda/todo (lo mismo que ⌘0) y re-arma el auto-fit. */
    const ctl = document.createElement('div');
    ctl.id = 'camctl';
    ctl.innerHTML =
      '<button type="button" data-a="out" title="Alejar">−</button>' +
      '<button type="button" data-a="fit" title="Encuadrar (⌘0 alterna banda/todo)">⛶</button>' +
      '<button type="button" data-a="in" title="Acercar">+</button>';
    vp.appendChild(ctl);
    ctl.addEventListener('pointerdown', (e) => e.stopPropagation());
    ctl.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.stopPropagation();
      const cx = vp.clientWidth / 2, cy = vp.clientHeight / 2;
      if (btn.dataset.a === 'in') { interacted = true; zoomAt(cx, cy, 1.3); }
      else if (btn.dataset.a === 'out') { interacted = true; zoomAt(cx, cy, 1 / 1.3); }
      else { interacted = false; toggleFit(); }
    });

    refitIfIdle = () => { if (!interacted) fit(); };
    fit();
  }
})();
