// Go Pokédex: a static client for PokeAPI (https://pokeapi.co), hosted on GitHub Pages.
(function () {
  'use strict';

  const API = 'https://pokeapi.co/api/v2';
  const PAGE_SIZE = 24;
  const MAX_ID = 1025;

  const GENS = [
    { n: 0, label: 'All', from: 1, to: MAX_ID },
    { n: 1, label: 'I · Kanto', from: 1, to: 151 },
    { n: 2, label: 'II · Johto', from: 152, to: 251 },
    { n: 3, label: 'III · Hoenn', from: 252, to: 386 },
    { n: 4, label: 'IV · Sinnoh', from: 387, to: 493 },
    { n: 5, label: 'V · Unova', from: 494, to: 649 },
    { n: 6, label: 'VI · Kalos', from: 650, to: 721 },
    { n: 7, label: 'VII · Alola', from: 722, to: 809 },
    { n: 8, label: 'VIII · Galar', from: 810, to: 905 },
    { n: 9, label: 'IX · Paldea', from: 906, to: 1025 },
  ];
  const TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
    'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
  const STAT_NAMES = { hp: 'HP', attack: 'Atk', defense: 'Def', 'special-attack': 'Sp. Atk', 'special-defense': 'Sp. Def', speed: 'Speed' };

  const $ = (id) => document.getElementById(id);
  const grid = $('grid'), meta = $('meta'), more = $('more'), dialog = $('detail');

  const network = $('network');
  const state = { gen: 1, type: '', query: '', ids: [], shown: 0, loaded: [], view: savedView(), token: 0 };
  let current = null; // Pokémon open in the dialog
  let shiny = false;

  // ---- data -------------------------------------------------------------

  const cache = new Map();
  function getJSON(url) {
    if (!cache.has(url)) {
      cache.set(url, fetch(url).then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Not found' : 'PokeAPI returned ' + r.status);
        return r.json();
      }).catch((err) => { cache.delete(url); throw err; }));
    }
    return cache.get(url);
  }

  const idFromUrl = (url) => Number(url.split('/').filter(Boolean).pop());

  async function getPokemon(key) {
    const raw = await getJSON(API + '/pokemon/' + key);
    const art = raw.sprites.other && raw.sprites.other['official-artwork'];
    return {
      id: raw.id,
      name: raw.name,
      speciesId: idFromUrl(raw.species.url),
      types: raw.types.map((t) => t.type.name),
      abilities: raw.abilities.map((a) => ({ name: a.ability.name, hidden: a.is_hidden })),
      stats: raw.stats.map((s) => ({ name: s.stat.name, value: s.base_stat })),
      heightM: raw.height / 10,
      weightKg: raw.weight / 10,
      image: (art && art.front_default) || raw.sprites.front_default || '',
      sprite: raw.sprites.front_default || '',
      shinyImage: (art && art.front_shiny) || raw.sprites.front_shiny || '',
    };
  }

  async function getSpecies(id) {
    const raw = await getJSON(API + '/pokemon-species/' + id);
    const flavor = raw.flavor_text_entries.filter((f) => f.language.name === 'en').pop();
    const genus = raw.genera.find((g) => g.language.name === 'en');
    return {
      flavor: flavor ? flavor.flavor_text.replace(/[\f\n\r­]+/g, ' ') : '',
      genus: genus ? genus.genus : '',
    };
  }

  async function allNames() {
    const raw = await getJSON(API + '/pokemon?limit=' + MAX_ID);
    return raw.results.map((r) => ({ name: r.name, id: idFromUrl(r.url) }));
  }

  async function idsOfType(type) {
    const raw = await getJSON(API + '/type/' + type);
    return new Set(raw.pokemon.map((p) => idFromUrl(p.pokemon.url)));
  }

  // ---- helpers ----------------------------------------------------------

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const child of children || []) node.append(child);
    return node;
  }

  const titleCase = (s) => s.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const dexNo = (id) => '#' + String(id).padStart(4, '0');
  const typeBadge = (t) => el('span', { class: 'type t-' + t, text: titleCase(t) });

  // ---- list -------------------------------------------------------------

  async function computeIds() {
    if (state.query) {
      const q = state.query.toLowerCase();
      const names = await allNames();
      if (/^\d+$/.test(q)) {
        const n = Number(q);
        return names.filter((p) => p.id === n || String(p.id).startsWith(q)).map((p) => p.id);
      }
      return names.filter((p) => p.name.includes(q)).map((p) => p.id);
    }
    const gen = GENS.find((g) => g.n === state.gen);
    let ids = [];
    for (let i = gen.from; i <= gen.to; i++) ids.push(i);
    if (state.type) {
      const set = await idsOfType(state.type);
      ids = ids.filter((id) => set.has(id));
    }
    return ids;
  }

  async function refresh() {
    const token = ++state.token;
    grid.replaceChildren();
    state.loaded = [];
    more.hidden = true;
    meta.textContent = 'Loading…';
    try {
      const ids = await computeIds();
      if (token !== state.token) return;
      state.ids = ids;
      state.shown = 0;
      if (!ids.length) {
        meta.textContent = 'No matches';
        renderNetwork();
        grid.append(el('div', { class: 'empty' }, [
          el('p', { text: state.query ? 'No Pokémon match “' + state.query + '”.' : 'No Pokémon of this type in this generation.' }),
        ]));
        return;
      }
      await loadMore();
    } catch (err) {
      if (token === state.token) showError(err);
    }
  }

  async function loadMore() {
    const token = state.token;
    const batch = state.ids.slice(state.shown, state.shown + PAGE_SIZE);
    state.shown += batch.length;
    const placeholders = batch.map(() => skeleton());
    grid.append(...placeholders);
    updateMeta();
    more.hidden = true;

    const results = await Promise.all(batch.map(async (id, i) => {
      try {
        const p = await getPokemon(id);
        if (token === state.token) placeholders[i].replaceWith(card(p));
        return p;
      } catch (err) {
        placeholders[i].remove();
        return null;
      }
    }));
    if (token !== state.token) return;
    state.loaded.push(...results.filter(Boolean));
    more.hidden = state.shown >= state.ids.length;
    renderNetwork();
  }

  function updateMeta() {
    const parts = [state.ids.length + ' Pokémon'];
    if (state.query) parts.push('matching “' + state.query + '”');
    else {
      parts.push(GENS.find((g) => g.n === state.gen).label.replace(/^.* · /, '') || 'all generations');
      if (state.type) parts.push(titleCase(state.type) + ' type');
    }
    parts.push('showing ' + Math.min(state.shown, state.ids.length));
    meta.textContent = parts.join(' · ');
  }

  function showError(err) {
    meta.textContent = 'Could not reach PokeAPI';
    grid.replaceChildren(el('div', { class: 'empty' }, [
      el('p', { text: 'Could not load Pokémon (' + err.message + '). Check your connection and try again.' }),
      el('button', { class: 'btn', type: 'button', id: 'retry', text: 'Try again' }),
    ]));
    $('retry').addEventListener('click', refresh);
  }

  function skeleton() {
    return el('div', { class: 'card skeleton', 'aria-hidden': 'true' }, [
      el('div', { class: 'art' }),
      el('div', { class: 'card-body' }, [el('div', { class: 'line' }), el('div', { class: 'line short' })]),
    ]);
  }

  function card(p) {
    const img = el('img', { src: p.image, alt: '', loading: 'lazy', width: '200', height: '200' });
    const node = el('button', { class: 'card t-' + p.types[0], type: 'button', 'aria-label': titleCase(p.name) + ', ' + dexNo(p.id) }, [
      el('div', { class: 'art' }, [el('span', { class: 'dex', text: dexNo(p.id) }), img]),
      el('div', { class: 'card-body' }, [
        el('h2', { text: titleCase(p.name) }),
        el('div', { class: 'types' }, p.types.map(typeBadge)),
      ]),
    ]);
    node.addEventListener('click', () => openDetail(p.id));
    return node;
  }

  // ---- views -----------------------------------------------------------

  function savedView() {
    try { return localStorage.getItem('pokedex-view') === 'cards' ? 'cards' : 'network'; } catch (e) { return 'network'; }
  }

  function setView(view) {
    state.view = view;
    try { localStorage.setItem('pokedex-view', view); } catch (e) { /* storage unavailable */ }
    for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
    grid.hidden = view !== 'cards';
    network.hidden = view !== 'network';
    $('net-caption').hidden = view !== 'network';
    if (view === 'network') renderNetwork();
    else if (window.PokeNetwork) window.PokeNetwork.stop();
  }

  function renderNetwork() {
    if (state.view !== 'network') return;
    if (!window.d3 || !window.PokeNetwork) {
      network.classList.add('is-empty');
      network.querySelector('.net-empty').textContent = 'The network view could not load (d3.js was blocked). The cards view still works.';
      return;
    }
    window.PokeNetwork.render(network, state.loaded, { onSelect: openDetail });
  }

  // ---- detail dialog ----------------------------------------------------

  async function openDetail(id) {
    try {
      const p = await getPokemon(id);
      current = p;
      shiny = false;
      renderDetail(p);
      if (!dialog.open) dialog.showModal();
      history.replaceState(null, '', '#' + p.id);

      const s = await getSpecies(p.speciesId).catch(() => ({ flavor: '', genus: '' }));
      if (current && current.id === p.id) {
        $('d-flavor').textContent = s.flavor;
        $('d-genus').textContent = s.genus;
      }
    } catch (err) {
      meta.textContent = 'Could not load that Pokémon: ' + err.message;
    }
  }

  function renderDetail(p) {
    $('d-card').className = 'd-card t-' + p.types[0];
    $('d-id').textContent = dexNo(p.id);
    $('d-img').src = p.image;
    $('d-img').alt = titleCase(p.name) + ' artwork';
    $('d-shiny').setAttribute('aria-pressed', 'false');
    $('d-shiny').hidden = !p.shinyImage;
    $('d-name').textContent = titleCase(p.name);
    $('d-genus').textContent = '';
    $('d-flavor').textContent = '';
    $('d-types').replaceChildren(...p.types.map(typeBadge));
    $('d-height').textContent = p.heightM.toFixed(1) + ' m';
    $('d-weight').textContent = p.weightKg.toFixed(1) + ' kg';
    $('d-total').textContent = p.stats.reduce((sum, s) => sum + s.value, 0);

    $('d-abilities').replaceChildren(...p.abilities.flatMap((a, i) => {
      const parts = [];
      if (i) parts.push(' · ');
      parts.push(titleCase(a.name));
      if (a.hidden) parts.push(' ', el('em', { text: '(hidden)' }));
      return parts;
    }));

    $('d-stats').replaceChildren(...p.stats.map((s) => el('div', { class: 'stat' }, [
      el('span', { text: STAT_NAMES[s.name] || titleCase(s.name) }),
      el('span', { text: String(s.value) }),
      el('div', { class: 'bar' }, [el('i', { style: 'width:' + Math.min(100, Math.round(s.value / 2.55)) + '%' })]),
    ])));

    $('d-prev').disabled = p.id <= 1 || p.id > MAX_ID;
    $('d-next').disabled = p.id >= MAX_ID;
  }

  function step(delta) {
    if (current) openDetail(current.id + delta);
  }

  // ---- controls ---------------------------------------------------------

  function renderChips() {
    $('gens').replaceChildren(...GENS.map((g) => {
      const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(!state.query && g.n === state.gen), text: g.label });
      b.addEventListener('click', () => {
        state.gen = g.n; state.query = ''; $('search').value = '';
        renderChips(); refresh();
      });
      return b;
    }));
    $('types').replaceChildren(...TYPES.map((t) => {
      const b = el('button', { class: 'chip type-chip t-' + t, type: 'button', 'aria-pressed': String(!state.query && t === state.type), text: titleCase(t) });
      b.addEventListener('click', () => {
        state.type = state.type === t ? '' : t; state.query = ''; $('search').value = '';
        renderChips(); refresh();
      });
      return b;
    }));
  }

  $('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.query = $('search').value.trim();
    renderChips();
    refresh();
  });
  $('search').addEventListener('search', () => {
    if (!$('search').value && state.query) { state.query = ''; renderChips(); refresh(); }
  });
  $('random').addEventListener('click', () => openDetail(1 + Math.floor(Math.random() * MAX_ID)));
  more.addEventListener('click', loadMore);
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderNetwork, 200); });

  $('d-close').addEventListener('click', () => dialog.close());
  $('d-prev').addEventListener('click', () => step(-1));
  $('d-next').addEventListener('click', () => step(1));
  $('d-shiny').addEventListener('click', () => {
    if (!current) return;
    shiny = !shiny;
    $('d-img').src = shiny ? current.shinyImage : current.image;
    $('d-shiny').setAttribute('aria-pressed', String(shiny));
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { current = null; history.replaceState(null, '', location.pathname + location.search); });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  renderChips();
  setView(state.view);
  refresh();
  const deepLink = location.hash.slice(1);
  if (/^\d+$/.test(deepLink)) openDetail(Number(deepLink));
})();
