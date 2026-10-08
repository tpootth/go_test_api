// Bubble network view: type hubs linked to the Pokémon of that type, laid out with a d3 force simulation.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const typeColors = new Map();
  let sim = null;
  const positions = new Map(); // node id -> {x, y}, so re-renders don't scatter the layout

  // Read type colours from the same CSS classes the cards use, so both views stay in sync.
  function typeColor(type) {
    if (!typeColors.has(type)) {
      const probe = document.createElement('span');
      probe.className = 't-' + type;
      document.body.append(probe);
      typeColors.set(type, getComputedStyle(probe).getPropertyValue('--type').trim() || '#a8a77a');
      probe.remove();
    }
    return typeColors.get(type);
  }

  const titleCase = (s) => s.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const total = (p) => p.stats.reduce((sum, s) => sum + s.value, 0);

  function stop() {
    if (sim) sim.stop();
  }

  function render(root, pokemon, opts) {
    stop();
    const svgEl = root.querySelector('svg');
    const tooltip = root.querySelector('.net-tooltip');
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    if (!pokemon.length) {
      root.classList.add('is-empty');
      return;
    }
    root.classList.remove('is-empty');

    const width = root.clientWidth;
    const height = Math.round(Math.max(440, Math.min(720, width * 0.68)));
    svg.attr('viewBox', [0, 0, width, height]).attr('height', height);

    // ---- nodes & links ----
    const compact = width < 600;
    const radius = d3.scaleSqrt().domain([180, 720]).range(compact ? [10, 22] : [12, 30]).clamp(true);
    const counts = d3.rollup(pokemon.flatMap((p) => p.types), (v) => v.length, (t) => t);

    const typeNodes = Array.from(counts, ([type, count]) => ({
      id: 'type:' + type, kind: 'type', type, count, r: Math.min(compact ? 32 : 46, (compact ? 11 : 14) + 5 * Math.sqrt(count)),
    }));
    const pokeNodes = pokemon.map((p) => ({ id: 'p:' + p.id, kind: 'pokemon', p, bst: total(p), r: radius(total(p)) }));
    const nodes = [...typeNodes, ...pokeNodes];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = pokeNodes.flatMap((n) => n.p.types.map((t) => ({ source: n.id, target: 'type:' + t })));

    for (const n of nodes) {
      const prev = positions.get(n.id);
      if (prev) { n.x = prev.x; n.y = prev.y; }
      else if (n.kind === 'pokemon') {
        const hub = positions.get('type:' + n.p.types[0]);
        n.x = (hub ? hub.x : width / 2) + (Math.random() - 0.5) * 60;
        n.y = (hub ? hub.y : height / 2) + (Math.random() - 0.5) * 60;
      }
    }

    // Who touches whom, for hover highlighting.
    const neighbours = new Map(nodes.map((n) => [n.id, new Set([n.id])]));
    for (const l of links) {
      neighbours.get(l.source).add(l.target);
      neighbours.get(l.target).add(l.source);
    }

    // ---- drawing ----
    const zoomLayer = svg.append('g');
    const defs = svg.append('defs');
    defs.selectAll('clipPath').data(pokeNodes).join('clipPath')
      .attr('id', (d) => 'clip-' + d.p.id)
      .append('circle').attr('r', (d) => d.r - 1.5);

    const link = zoomLayer.append('g').attr('class', 'net-links')
      .selectAll('line').data(links).join('line');

    const node = zoomLayer.append('g').selectAll('g').data(nodes, (d) => d.id).join('g')
      .attr('class', (d) => 'net-node net-' + d.kind)
      .attr('tabindex', (d) => (d.kind === 'pokemon' ? 0 : null))
      .attr('role', (d) => (d.kind === 'pokemon' ? 'button' : null))
      .attr('aria-label', (d) => (d.kind === 'pokemon'
        ? titleCase(d.p.name) + ', ' + d.p.types.map(titleCase).join(' and ') + ' type, base stat total ' + d.bst
        : titleCase(d.type) + ' type, ' + d.count + ' Pokémon'));

    const hubs = node.filter((d) => d.kind === 'type');
    hubs.append('circle').attr('r', (d) => d.r).attr('fill', (d) => typeColor(d.type));
    hubs.append('text').attr('class', 'net-count').attr('dy', '0.35em').text((d) => d.count);

    // Hub names live in their own top layer so Pokémon bubbles never cover them.
    const labels = zoomLayer.append('g').attr('class', 'net-labels')
      .selectAll('text').data(typeNodes).join('text')
      .attr('class', 'net-label').text((d) => titleCase(d.type));

    const bubbles = node.filter((d) => d.kind === 'pokemon');
    bubbles.append('circle').attr('class', 'net-ring').attr('r', (d) => d.r)
      .attr('stroke', (d) => typeColor(d.p.types[0]));
    bubbles.append('image')
      .attr('href', (d) => d.p.sprite || d.p.image)
      .attr('x', (d) => -d.r * 1.3).attr('y', (d) => -d.r * 1.35)
      .attr('width', (d) => d.r * 2.6).attr('height', (d) => d.r * 2.6)
      .attr('clip-path', (d) => 'url(#clip-' + d.p.id + ')');

    // ---- interaction ----
    function highlight(d) {
      const near = d ? neighbours.get(d.id) : null;
      node.classed('is-dim', (n) => near && !near.has(n.id));
      labels.classed('is-dim', (n) => near && !near.has(n.id));
      link.classed('is-dim', (l) => near && !(near.has(l.source.id) && near.has(l.target.id) && (l.source.id === d.id || l.target.id === d.id)));
    }

    function showTooltip(event, d) {
      tooltip.replaceChildren();
      const title = document.createElement('strong');
      const detail = document.createElement('span');
      if (d.kind === 'pokemon') {
        title.textContent = titleCase(d.p.name) + ' #' + String(d.p.id).padStart(4, '0');
        detail.textContent = d.p.types.map(titleCase).join(' / ') + ' · Base total ' + d.bst;
      } else {
        title.textContent = titleCase(d.type);
        detail.textContent = d.count + ' Pokémon in view';
      }
      tooltip.append(title, detail);
      tooltip.hidden = false;
      const box = root.getBoundingClientRect();
      const x = event.clientX - box.left, y = event.clientY - box.top;
      const tipW = tooltip.offsetWidth;
      tooltip.style.left = Math.min(Math.max(8, x - tipW / 2), box.width - tipW - 8) + 'px';
      tooltip.style.top = Math.max(8, y - tooltip.offsetHeight - 14) + 'px';
    }

    function hideTooltip() {
      tooltip.hidden = true;
      highlight(null);
    }

    node
      .on('pointerenter', (event, d) => { highlight(d); showTooltip(event, d); })
      .on('pointermove', showTooltip)
      .on('pointerleave', hideTooltip)
      .on('focus', (event, d) => {
        highlight(d);
        const r = event.currentTarget.getBoundingClientRect();
        showTooltip({ clientX: r.left + r.width / 2, clientY: r.top }, d);
      })
      .on('blur', hideTooltip);

    bubbles
      .on('click', (event, d) => { if (!event.defaultPrevented) opts.onSelect(d.p.id); })
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); opts.onSelect(d.p.id); }
      });

    node.call(d3.drag()
      .on('start', (event, d) => {
        if (!event.active && !reduceMotion) sim.alphaTarget(0.25).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x; d.fy = event.y;
        if (reduceMotion) { d.x = event.x; d.y = event.y; draw(); }
      })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      }));

    // Wheel zooms only with Ctrl/⌘ so the page still scrolls normally.
    const zoom = d3.zoom().scaleExtent([0.4, 4])
      .filter((event) => (event.type === 'wheel' ? event.ctrlKey || event.metaKey : !event.button))
      .on('zoom', (event) => zoomLayer.attr('transform', event.transform));
    svg.call(zoom).on('dblclick.zoom', null);
    root.querySelector('[data-zoom="in"]').onclick = () => svg.transition().duration(200).call(zoom.scaleBy, 1.4);
    root.querySelector('[data-zoom="out"]').onclick = () => svg.transition().duration(200).call(zoom.scaleBy, 1 / 1.4);
    root.querySelector('[data-zoom="reset"]').onclick = () => svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity);

    // ---- simulation ----
    function draw() {
      for (const n of nodes) {
        const pad = n.r + (n.kind === 'type' ? 18 : 2);
        n.x = Math.max(pad, Math.min(width - pad, n.x));
        n.y = Math.max(n.r + 2, Math.min(height - pad, n.y));
      }
      link
        .attr('x1', (l) => l.source.x).attr('y1', (l) => l.source.y)
        .attr('x2', (l) => l.target.x).attr('y2', (l) => l.target.y);
      node.attr('transform', (d) => 'translate(' + d.x + ',' + d.y + ')');
      labels.attr('x', (d) => d.x).attr('y', (d) => d.y + d.r + 14);
      for (const n of nodes) positions.set(n.id, { x: n.x, y: n.y });
    }

    sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id)
        .distance((l) => l.source.r + l.target.r + 24)
        .strength((l) => 0.5 / byId.get(l.source.id || l.source).p.types.length))
      .force('charge', d3.forceManyBody().strength((d) => (d.kind === 'type' ? (compact ? -260 : -700) : -50)))
      .force('collide', d3.forceCollide((d) => d.r + 3).iterations(2))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(compact ? 0.03 : 0.06))
      .on('tick', draw);

    if (reduceMotion) {
      sim.stop();
      for (let i = 0; i < 300; i++) sim.tick();
      draw();
    }
  }

  window.PokeNetwork = { render, stop };
})();
