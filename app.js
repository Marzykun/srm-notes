(() => {
  'use strict';

  const app = document.getElementById('app');
  const searchInput = document.getElementById('search');
  const viewer = document.getElementById('viewer');
  const viewerFrame = document.getElementById('viewer-frame');
  const viewerTitle = document.getElementById('viewer-title');
  const viewerOpen = document.getElementById('viewer-open');

  const SECTION_LABEL = { official: 'Official', pyqs: 'PYQs', notes: 'Notes', videos: 'Links', strategies: 'Strategies' };
  const KIND_LABEL = { file: 'PDF / File', folder: 'Drive folder', doc: 'Google Doc', slides: 'Slides', sheet: 'Sheet', pdf: 'PDF', image: 'Image', link: 'External link' };
  const DRIVE_KINDS = new Set(['file', 'folder', 'doc', 'slides', 'sheet']);
  const isDrive = item => DRIVE_KINDS.has(item.kind);
  const sourceLabel = item => (data.sources[item.source || 'drive'] || {}).label || '';

  // GitHub items store only their path; the repo's CDN/raw base lives in data.sources.
  // jsDelivr refuses Office files and anything over 20 MB, so those come from raw GitHub.
  function itemUrl(item) {
    if (item.url) return item.url;
    const src = data.sources[item.source];
    const filePath = item.id.split('/').map(encodeURIComponent).join('/');
    return (item.kind === 'office' || item.big ? src.raw : src.cdn) + filePath;
  }
  // GitHub's own page for a file; it previews large PDFs that no embeddable viewer will.
  const githubPage = item => itemUrl(item).replace(/^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([0-9a-f]{40})\//, 'https://github.com/$1/blob/$2/');
  const kindLabel = item => (item.kind === 'office' ? item.ext.toUpperCase() : KIND_LABEL[item.kind] || 'Link') + (item.big ? ' (large, opens on GitHub)' : '');
  const semLabel = n => (n === 'electives' ? 'Electives & more' : `Semester ${n}`);
  const semShort = n => (n === 'electives' ? 'Electives' : `Sem ${n}`);
  const ICONS = {
    file: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    doc: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    slides: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    arrow: '<svg class="res-arrow" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/></svg>',
  };

  // Short forms students actually search with.
  const ALIASES = {
    'calculus-and-linear-algebra': 'cla calc', 'programming-for-problem-solving': 'pps c',
    'advanced-calculus-and-complex-analysis': 'acca', 'electrical-and-electronics-engineering': 'eee beee',
    'semiconductor-physics-and-computational-methods': 'spcm physics', 'object-oriented-design-and-programming': 'oodp cpp c++ oops',
    'data-structures-and-algorithm': 'dsa ds', 'computer-organization-and-architecture': 'coa',
    'operating-systems': 'os', 'transforms-and-boundary-value-problems': 'tbvp maths', 'advanced-programming-practice': 'app python',
    'design-thinking-and-methodology': 'dtm', 'digital-logic-design': 'dld', 'design-and-analysis-of-algorithms': 'daa',
    'database-management-systems': 'dbms sql', 'artificial-intelligence': 'ai', 'probability-and-queueing-theory': 'pqt maths',
    'discrete-mathematics': 'dm maths', 'full-stack-web-development': 'fswd web', 'formal-language-and-automata': 'flat toc',
    'computer-networks': 'cn', 'machine-learning': 'ml', 'data-science': 'ds', 'compiler-design': 'cd',
    'foundation-of-data-science-fds': 'fds', 'internet-of-things-iot': 'iot', 'numerical-methods-and-analysis': 'nma',
    'analog-and-digital-electronics': 'ade', 'management-principles-for-engineers': 'mpe', 'digital-signal-processing': 'dsp',
    'software-engineering-and-project-management-sepm': 'se software engineering', 'microprocessor-microcontrollers-and-interfacing-techniques': 'mpmc',
    'remote-sensing-and-gis': 'gis', 'information-storage-management': 'ism', 'data-mining-and-analytics': 'dma dm',
    'network-routing-algorithm': 'nra', 'wireless-mobile-communication': 'wmc', 'advances-risc-machine': 'arm',
  };

  let data = null;
  let flatIndex = [];

  // ---------- storage helpers (all optional) ----------
  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function countItems(subject) {
    const counts = {};
    for (const sec of subject.sections) counts[sec.key] = sec.items.length;
    return counts;
  }

  function chipsFor(subject) {
    const c = countItems(subject);
    const chips = Object.entries(c).map(([k, n]) => `<span class="chip ${k}">${n} ${SECTION_LABEL[k]}</span>`);
    return chips.length ? chips.join('') : '<span class="chip">Coming soon</span>';
  }

  // ---------- views ----------
  function viewHome() {
    const subjects = Object.values(data.subjects);
    const total = flatIndex.length;
    const pyqs = subjects.reduce((n, s) => n + (countItems(s).pyqs || 0) + (countItems(s).official || 0), 0);
    const recent = store.get('recent', []).map(r => ({ ...r, item: findItem(r.subject, r.sec, r.id) })).filter(r => r.item).slice(0, 6);

    app.innerHTML = `
      <section class="hero">
        <h1>Every SRM note, one tap away.</h1>
        <p>Official end-sem papers, PYQs, unit notes and exam tips for all 8 semesters, gathered from seniors' Drive folders and GitHub repos.</p>
        <div class="stats">
          <span><b>${total}</b> resources</span>
          <span><b>${pyqs}</b> question papers</span>
          <span><b>${subjects.length}</b> subjects</span>
        </div>
      </section>
      ${recent.length ? `
        <div class="section-label">Recently opened</div>
        <div class="recent-list">${recent.map(r => resourceButton(r.item, r.sec, r.subject, true)).join('')}</div>` : ''}
      <div class="section-label">Pick your semester</div>
      <div class="sem-grid">
        ${Object.entries(data.semesters).map(([n, ids]) => {
          const filled = ids.filter(id => data.subjects[id].sections.length).length;
          return `<a class="sem-card" href="#/sem/${n}">
            <span class="num">${n === 'electives' ? '+' : n}</span>
            <span class="label">${semLabel(n)}</span>
            <span class="meta">${filled} of ${ids.length} subjects have notes</span>
          </a>`;
        }).join('')}
      </div>`;
  }

  function semTabs(active) {
    return `<nav class="sem-tabs" aria-label="Semesters">
      ${Object.keys(data.semesters).map(n => `<a class="sem-tab" href="#/sem/${n}" ${String(n) === String(active) ? 'aria-current="page"' : ''}>${semShort(n)}</a>`).join('')}
    </nav>`;
  }

  function viewSemester(n) {
    const ids = data.semesters[n];
    if (!ids) return viewNotFound();
    // Subjects with material first, empty ones at the end.
    const sorted = [...ids].sort((a, b) => (data.subjects[b].sections.length > 0) - (data.subjects[a].sections.length > 0));
    app.innerHTML = `
      ${semTabs(n)}
      <div class="page-head">
        <div>
          <h1>${semLabel(n)}</h1>
          <div class="sub">${ids.length} subjects</div>
        </div>
      </div>
      <div class="subject-grid">
        ${sorted.map(id => {
          const s = data.subjects[id];
          return `<a class="subject-card ${s.sections.length ? '' : 'empty'}" href="#/s/${id}?sem=${n}">
            <h3>${esc(s.name)}</h3>
            <div class="chips">${chipsFor(s)}</div>
          </a>`;
        }).join('')}
      </div>`;
    const cur = app.querySelector('.sem-tab[aria-current]');
    if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function resourceButton(item, secKey, subjectId, showSubject) {
    const sub = showSubject ? data.subjects[subjectId].name : `${kindLabel(item)} · ${sourceLabel(item)}`;
    return `<button class="res" data-sec="${secKey}" data-subject="${subjectId}" data-id="${esc(item.id)}" data-key="${secKey}">
      <span class="res-icon">${ICONS[item.kind === 'office' && /^pptx?$/.test(item.ext) ? 'slides' : item.kind === 'office' ? 'doc' : item.kind] || ICONS.file}</span>
      <span class="res-text">
        <span class="res-name">${esc(item.name)}</span>
        <span class="res-kind">${esc(sub)}</span>
      </span>
      ${ICONS.arrow}
    </button>`;
  }

  function viewSubject(id, params) {
    const s = data.subjects[id];
    if (!s) return viewNotFound();
    const sem = params.get('sem') || s.semesters[0];
    const filter = params.get('f') || 'all';
    const sections = s.sections.filter(sec => filter === 'all' || sec.key === filter);

    app.innerHTML = `
      <div class="crumbs">
        <a href="#/">Home</a><span>/</span>
        <a href="#/sem/${sem}">${semLabel(sem)}</a>
      </div>
      <div class="page-head">
        <div>
          <h1>${esc(s.name)}</h1>
          <div class="sub">${s.semesters.length > 1 ? `Semesters ${s.semesters.join(', ')}` : semLabel(sem)}</div>
        </div>
        <div class="subject-actions">
          ${s.syllabus ? `<button class="btn" data-syllabus="${id}">${ICONS.book}Syllabus</button>` : ''}
        </div>
      </div>
      ${s.sections.length > 1 ? `
        <div class="filters" role="group" aria-label="Filter resources">
          <button class="filter" data-filter="all" aria-pressed="${filter === 'all'}">All</button>
          ${s.sections.map(sec => `<button class="filter" data-filter="${sec.key}" aria-pressed="${filter === sec.key}">${sec.title} · ${sec.items.length}</button>`).join('')}
        </div>` : ''}
      ${sections.length ? sections.map(sec => `
        <section class="res-section">
          <h2>${sec.title} <span class="count">${sec.items.length}</span></h2>
          <div class="res-list">${sec.items.map(it => resourceButton(it, sec.key, id)).join('')}</div>
        </section>`).join('') : `
        <div class="empty-state">
          <h3>Nothing here yet</h3>
          <p>Notes for this subject haven't been shared yet. Got some? Send them our way.</p>
        </div>`}`;
  }

  function viewSearch(q) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = text => terms.every(t => text.includes(t));
    const subjects = Object.entries(data.subjects).filter(([id, s]) => match(`${s.name} ${ALIASES[id] || ''}`.toLowerCase()));
    const items = flatIndex.filter(e => match(e.haystack)).slice(0, 60);
    const hl = text => {
      let out = esc(text);
      for (const t of terms) out = out.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
      return out;
    };

    if (!subjects.length && !items.length) {
      app.innerHTML = `<div class="empty-state"><h3>No results for “${esc(q)}”</h3><p>Try a subject name like “DBMS”, “Chemistry” or “PYQ 2024”.</p></div>`;
      return;
    }
    app.innerHTML = `
      ${subjects.length ? `<div class="search-group">
        <div class="section-label" style="margin-top:0">Subjects</div>
        <div class="subject-grid">${subjects.map(([id, s]) => `
          <a class="subject-card ${s.sections.length ? '' : 'empty'}" href="#/s/${id}?sem=${s.semesters[0]}">
            <h3>${hl(s.name)}</h3>
            <div class="chips"><span class="chip">${s.semesters.map(semShort).join(', ')}</span>${chipsFor(s)}</div>
          </a>`).join('')}</div>
      </div>` : ''}
      ${items.length ? `<div class="search-group">
        <div class="section-label" ${subjects.length ? '' : 'style="margin-top:0"'}>Resources</div>
        <div class="res-list">${items.map(e => resourceButton(e.item, e.sec, e.subject, true)).join('')}</div>
      </div>` : ''}`;
  }

  function viewNotFound() {
    app.innerHTML = `<div class="empty-state"><h3>Page not found</h3><p><a class="btn" href="#/">Go home</a></p></div>`;
  }

  // ---------- viewer ----------
  function findItem(subjectId, secKey, itemId) {
    const s = data.subjects[subjectId];
    if (!s) return null;
    if (secKey === 'syllabus') return s.syllabus;
    const sec = s.sections.find(x => x.key === secKey);
    return sec && sec.items.find(i => i.id === itemId);
  }

  // Phones can't render PDFs inside an iframe, so route them through Google's viewer.
  const canInlinePdf = navigator.pdfViewerEnabled && !matchMedia('(pointer: coarse)').matches;

  function previewUrl(item) {
    const url = itemUrl(item);
    if (item.kind === 'pdf') return canInlinePdf ? url : `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(url)}`;
    if (item.kind === 'office') return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    if (item.kind === 'image') return url;
    if (item.kind === 'folder') return `https://drive.google.com/embeddedfolderview?id=${item.id}#grid`;
    return `https://drive.google.com/file/d/${item.id}/preview`;
  }

  function openViewer(item, secKey, subjectId) {
    if (!item) return;
    if (secKey !== 'syllabus') {
      // Store references, not copies, so recents follow link updates in notes.json.
      const recent = store.get('recent', []).filter(r => r.id !== item.id);
      recent.unshift({ id: item.id, sec: secKey, subject: subjectId });
      store.set('recent', recent.slice(0, 12));
    }
    // External pages (YouTube channels, Notion) can't be framed; open them directly.
    if (item.kind === 'link' || item.big || typeof viewer.showModal !== 'function') {
      window.open(item.big ? githubPage(item) : itemUrl(item), '_blank', 'noopener');
      return;
    }
    viewerTitle.textContent = item.name;
    viewerOpen.href = itemUrl(item);
    viewerOpen.textContent = isDrive(item) ? 'Open in Drive' : 'Open file';
    viewerFrame.src = previewUrl(item);
    viewer.showModal();
  }

  function closeViewer() {
    viewer.close();
  }
  // The close event fires async; skip the reset if another file was opened meanwhile.
  viewer.addEventListener('close', () => { if (!viewer.open) viewerFrame.src = 'about:blank'; });
  viewer.querySelector('[data-close]').addEventListener('click', closeViewer);
  viewer.addEventListener('click', e => { if (e.target === viewer) closeViewer(); });

  // ---------- routing ----------
  function route() {
    if (!data) return;
    const q = searchInput.value.trim();
    if (q) return viewSearch(q);
    const [path, query] = location.hash.replace(/^#/, '').split('?');
    const params = new URLSearchParams(query || '');
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) viewHome();
    else if (parts[0] === 'sem') viewSemester(parts[1]);
    else if (parts[0] === 's') viewSubject(parts[1], params);
    else viewNotFound();
  }

  app.addEventListener('click', e => {
    const res = e.target.closest('.res');
    if (res) return openViewer(findItem(res.dataset.subject, res.dataset.key, res.dataset.id), res.dataset.key, res.dataset.subject);
    const syl = e.target.closest('[data-syllabus]');
    if (syl) return openViewer(data.subjects[syl.dataset.syllabus].syllabus, 'syllabus', syl.dataset.syllabus);
    const f = e.target.closest('[data-filter]');
    if (f) {
      const [path, query] = location.hash.split('?');
      const params = new URLSearchParams(query || '');
      if (f.dataset.filter === 'all') params.delete('f'); else params.set('f', f.dataset.filter);
      history.replaceState(null, '', `${path}?${params}`);
      route();
    }
  });

  window.addEventListener('hashchange', () => {
    if (searchInput.value) searchInput.value = '';
    route();
    window.scrollTo(0, 0);
  });

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(route, 120);
  });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { searchInput.value = ''; route(); searchInput.blur(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== searchInput && !viewer.open) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  // ---------- theme ----------
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  // ---------- boot ----------
  app.innerHTML = '<div class="empty-state">Loading notes…</div>';
  fetch('data/notes.json')
    .then(r => r.json())
    .then(json => {
      data = json;
      for (const [id, s] of Object.entries(data.subjects)) {
        for (const sec of s.sections) {
          for (const item of sec.items) {
            flatIndex.push({ item, sec: sec.key, subject: id, haystack: `${item.name} ${s.name} ${ALIASES[id] || ''} ${sec.title}`.toLowerCase() });
          }
        }
      }
      const seen = new Set();
      const credits = Object.values(data.sources || {}).filter(src => !seen.has(src.label) && seen.add(src.label));
      document.getElementById('credits').innerHTML = `Sources: ${credits.map(src => `<a href="${esc(src.home)}" target="_blank" rel="noopener">${esc(src.label)}</a>`).join(' · ')}`;
      route();
    })
    .catch(() => { app.innerHTML = '<div class="empty-state"><h3>Couldn\'t load notes</h3><p>Check your connection and refresh.</p></div>'; });
})();
