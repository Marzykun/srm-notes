// Rebuilds every imported resource in data/notes.json from external sources:
//   - public GitHub notes repos (linked via jsDelivr / raw GitHub, pinned to a commit)
//   - CampusVerse (Google Drive links read from scripts/source-campusverse.json)
//   - SRM's official end-semester papers (via the public SRM PYQ API)
// The original Drive catalogue (items without a `source`) is never touched.
// Safe to re-run: all imported items and subjects are removed and re-added.
//
//   GITHUB_TOKEN=... node scripts/import-sources.js        # token optional, avoids rate limits

const fs = require('fs');
const path = require('path');

const NOTES = path.join(__dirname, '..', 'data', 'notes.json');
const COURSE_NAMES = require('./course-names.json'); // course code -> name, from the SRM PYQ API
const PYQ_API = 'https://srm-pyq-api.onrender.com';

// ---------------------------------------------------------------------------
// Source definitions. `subject(parts)` turns a file path into
// { name, sem?, rest } or null to skip; `rename` maps folder names to subject names.
// ---------------------------------------------------------------------------
const top = rename => parts => ({ name: rename[parts[0]] ?? parts[0], rest: parts.slice(1) });

const REPOS = [
  {
    repo: 'pandeydhruv2001/SRM-Notes-Repository', label: 'pandeydhruv2001',
    subject: top({ 'French': 'Foreign Languages', 'Computer Architecture': 'Computer Organization And Architecture', 'Previous Question Years': 'Previous Year Papers (Mixed)', 'Computer communications': 'Computer Communications' }),
  },
  ...[3, 4, 5, 6].map(sem => ({
    repo: `pulkitshringi/SRM-Sem${sem === 4 ? '-4' : sem}-Notes-PYQS`, label: 'pulkitshringi', sem,
    subject: parts => {
      const rename = {
        COA: 'Computer Organization And Architecture', DSA: 'Data Structures And Algorithm', OOPS: 'Object Oriented Design And Programming',
        Electronics: 'Analog And Digital Electronics', MPE: 'Management Principles For Engineers', Maths: 'Transforms And Boundary Value Problems',
        Probability: 'Probability And Queueing Theory', 'Design & analysis of Algorithms': 'Design And Analysis Of Algorithms',
        CN: 'Computer Networks', FLA: 'Formal Language And Automata', 'Discrete Maths': 'Discrete Mathematics', ISM: 'Information Storage Management',
        GIS: 'Remote Sensing And GIS', 'Artificial Intellifence': 'Artificial Intelligence', DBMS: 'Database Management Systems', DMA: 'Data Mining & Analytics',
      };
      if (parts[0] === 'Rest' || parts[0] === 'mooc') return null; // personal reports / MOOC screenshots
      const p = parts[0] === 'Electives' ? parts.slice(1) : parts;
      const name = p[0].trim();
      return { name: rename[name] ?? name, rest: p.slice(1) };
    },
  })),
  {
    repo: 'kunalkeshan/SRMIST-B.Tech-ECE-Notes-2022-24', label: 'kunalkeshan (ECE)',
    subject: parts => {
      const m = /^Semester (\d)/.exec(parts[0]);
      if (!m || parts.length < 3) return null;
      const rename = {
        'Programming for Problem Solving (C)': 'Programming For Problem Solving', Japanese: 'Foreign Languages',
        'Basic Electrical and Electronics Engineering': 'Electrical And Electronics Engineering', English: 'Communicative English',
        'End Sem QP 2021-22': 'Previous Year Papers (Mixed)', 'SEPM Practical': 'Software Engineering & Project Management (SEPM)',
        'dbms experiments': 'Database Management Systems', 'Discrete Mathematics for Engineers': 'Discrete Mathematics',
        'Computer communication network': 'Computer Communications', CCN: 'Computer Communications', MOC: 'Microwave and Optical Communication',
      };
      if (/^(MOOCs|Internship|Minor Project|Notes)$/.test(parts[1])) return null;
      return { name: rename[parts[1]] ?? parts[1], sem: Number(m[1]), rest: parts.slice(2) };
    },
  },
  ...[1, 2, 3].map(n => ({
    repo: `BharathwajManoharan/SRM_CSE_NOTES_PART_0${n}`, label: 'BharathwajManoharan',
    subject: parts => {
      const code = (/^(\d{2}[A-Z]{3}\d{2}[\dX][A-Z])/.exec(parts[0]) || [])[1];
      if (!code || parts.length < 2) return null;
      if (/^18CSP/.test(code)) return null; // project reports
      const name = EXTRA_CODES[code] || COURSE_NAMES[code] || COURSE_NAMES[code.replace('X', '1')];
      return name ? { name, rest: parts.slice(1) } : null;
    },
  })),
  {
    repo: 'orbit-psd2/srm-notes-1st-year-2021-regulations', label: 'orbit-psd2', sem: 1,
    subject: parts => {
      if (parts.length < 2) return null;
      const rename = {
        'Maths - ACCA': 'Advanced Calculus And Complex Analysis', 'Maths - CLA': 'Calculus And Linear Algebra', POE: 'Philosophy Of Engineering',
        PPS: 'Programming For Problem Solving', OODP: 'Object Oriented Design And Programming', German: 'Foreign Languages',
        English: 'Communicative English', Physics: 'Semiconductor Physics And Computational Methods', 'Important question': 'Previous Year Papers (Mixed)',
      };
      return { name: rename[parts[0]] ?? parts[0], rest: parts.slice(1) };
    },
  },
  {
    repo: 'utkarshtambe10/SRM-Notes-18-Regulation', label: 'utkarshtambe10', sem: 1,
    subject: parts => {
      if (parts.length < 3) return null;
      const name = parts[1].replace(/^\d{2}[A-Z]{3}\d{3}[A-Z]-/, '').replace(/^German$/, 'Foreign Languages').replace(/^English$/, 'Communicative English');
      return { name: { 'Basic Electrical & Electronics Engineering': 'Electrical And Electronics Engineering', 'Semiconductor Physics': 'Semiconductor Physics And Computational Methods' }[name] ?? name, rest: parts.slice(2) };
    },
  },
  { repo: 'rajsrm2021/OS_NOTES_SRM', label: 'rajsrm2021', subject: parts => ({ name: 'Operating Systems', rest: parts }) },
  { repo: 'srikrithisanthanam/SRM_Notes', label: 'srikrithisanthanam', subject: parts => ({ name: 'Computer Networks', rest: parts.slice(1) }) },
];

// Folder/file names with a registration number are personal submissions, not notes.
// Book folders hold full published textbooks, which we don't redistribute.
const SKIP_PATH = /(^|\/)(\.github|assets|node_modules)(\/|$)|(^|\/)[^/]*\b(text ?)?books?\b[^/]*\/|RA\d{10,}/i;
// Files jsDelivr refuses (found by the link check); these open on GitHub instead. Format "owner/repo:path".
const JSDELIVR_BLOCKED = new Set(require('./jsdelivr-blocked.json'));
const KINDS = { pdf: 'pdf', doc: 'office', docx: 'office', ppt: 'office', pptx: 'office', xls: 'office', xlsx: 'office', jpg: 'image', jpeg: 'image', png: 'image' };
const PYQ_RE = /end[\s_-]?sem|paper|\bqp\b|\bct[\s_-]?\d|\bct\b|clat|\bcla\b|cla[\s_-]?\d|answer|ans[\s_-]?key|\bkey\b|question|\bqb|qbes|mcq|maq|\bpyqs?\b|(dec|may|nov|jan|jul|april|june)[\s_-]?\d{2}|\bsem\b|prev year|sample|model/i;
const JSDELIVR_MAX = 20e6;

// ---------------------------------------------------------------------------
// Subject matching
// ---------------------------------------------------------------------------
const STOP = new Set(['and', 'of', 'the', 'for', 'in', 'to', 'with', 'using', 'a', 'an']);
const norm = name => name.toLowerCase().replace(/&/g, ' and ').replace(/\(.*?\)/g, ' ')
  .split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w))
  .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).join('');
const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

// Other sources' spellings of subjects we already have (typos included, as they appear upstream).
const ALIASES = {
  'Basic Electrical and Electronics Engineering': 'Electrical And Electronics Engineering', 'Biologay': 'Biology', CN101: 'Computer Networks',
  'Computer organization and achitecture': 'Computer Organization And Architecture', 'Discrete Mathematics For Engineers': 'Discrete Mathematics',
  English: 'Communicative English', 'Physics: Semiconductor Physics': 'Semiconductor Physics And Computational Methods',
  'Probability and Queuing Theory': 'Probability And Queueing Theory', 'Mathematics Semester I': 'Calculus And Linear Algebra',
  'Civil and Mechanical Workshop': 'Basic Civil & Mechanical Workshop', 'Basic Civil And Mechanical Lab': 'Basic Civil & Mechanical Workshop',
  'Engineering Graphics': 'Engineering Graphics & Design', 'Engineering Graphics and Design': 'Engineering Graphics & Design',
};
// Course codes the PYQ API has no name for.
const EXTRA_CODES = {
  '18LEM101T': 'Professional Skills and Studies', '18LEM102J': 'Professional Skills and Studies', '18MES101L': 'Engineering Graphics & Design',
  '18MES103L': 'Basic Civil & Mechanical Workshop', '18PDM101L': 'Professional Skills and Studies', '18CYM101T': 'Environmental Science',
  '18PDM202L': 'Critical and Creative Thinking Skills', '18CSC350T': 'Comprehension', '18LEM109T': 'Indian Traditional Knowledge',
  '18LEM110L': 'Indian Art Form', '18PDM301L': 'Analytical and Logical Thinking Skills',
};

let notes;
function findSubject(name) {
  name = ALIASES[name.trim()] || name;
  const n = norm(name);
  if (!n) return null;
  for (const [id, s] of Object.entries(notes.subjects)) if (norm(s.name) === n) return id;
  return null;
}
function ensureSubject(name, sem, source) {
  const found = findSubject(name);
  if (found) return found;
  name = ALIASES[name.trim()] || name;
  let id = slug(name);
  while (notes.subjects[id]) id += '-x';
  const key = sem ? String(sem) : 'electives';
  notes.subjects[id] = { name: name.trim(), semesters: [isNaN(key) ? key : Number(key)], syllabus: null, sections: [], source };
  (notes.semesters[key] = notes.semesters[key] || []).push(id);
  return id;
}
const ORDER = ['official', 'pyqs', 'notes', 'videos', 'strategies'];
const TITLES = { official: 'Official End-Sem Papers', pyqs: 'Previous Year Questions', notes: 'Study Notes', videos: 'Videos & Links', strategies: 'Exam Strategies' };
function addItem(subjectId, key, item) {
  const s = notes.subjects[subjectId];
  let sec = s.sections.find(x => x.key === key);
  if (!sec) {
    sec = { key, title: TITLES[key], items: [] };
    s.sections.push(sec);
    s.sections.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  }
  if (sec.items.some(i => i.id === item.id && i.source === item.source)) return false;
  sec.items.push(item);
  return true;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------
async function getJSON(url, headers = {}, attempt = 0) {
  try {
    const res = await fetch(url, { headers });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${url}`), { fatal: true });
    return await res.json();
  } catch (e) {
    if (e.fatal || attempt >= 4) throw e;
    await new Promise(r => setTimeout(r, 1500 * 2 ** attempt));
    return getJSON(url, headers, attempt + 1);
  }
}
const gh = url => getJSON(`https://api.github.com${url}`, process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {});

const cleanName = rest => rest.join(' / ').replace(/\.[^./]+$/, '').replace(/\.(docx?|pptx?)$/i, '')
  .replace(/_+/g, ' ').replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').trim();

// ---------------------------------------------------------------------------
// Importers
// ---------------------------------------------------------------------------
async function importRepo(cfg) {
  const meta = await gh(`/repos/${cfg.repo}`);
  const sha = (await gh(`/repos/${cfg.repo}/commits/${meta.default_branch}`)).sha;
  const tree = await gh(`/repos/${cfg.repo}/git/trees/${sha}?recursive=1`);
  const key = `gh:${cfg.repo}`;
  notes.sources[key] = {
    label: cfg.label, home: `https://github.com/${cfg.repo}`,
    cdn: `https://cdn.jsdelivr.net/gh/${cfg.repo}@${sha}/`, raw: `https://raw.githubusercontent.com/${cfg.repo}/${sha}/`,
  };
  let added = 0, skipped = 0;
  for (const f of tree.tree) {
    if (f.type !== 'blob' || SKIP_PATH.test(f.path)) continue;
    const ext = (f.path.match(/\.([^./]+)$/) || [])[1]?.toLowerCase();
    if (!KINDS[ext]) continue;
    const info = cfg.subject(f.path.split('/'));
    if (!info || !info.name || !info.rest.length) { skipped++; continue; }
    const subjectId = ensureSubject(info.name, info.sem ?? cfg.sem, key);
    const name = cleanName(info.rest);
    const isSyllabus = /syl+a?bus/i.test(name);
    const item = { name, kind: KINDS[ext], ext, id: f.path, source: key };
    if (f.size > JSDELIVR_MAX || JSDELIVR_BLOCKED.has(`${cfg.repo}:${f.path}`)) item.big = true;
    const s = notes.subjects[subjectId];
    if (isSyllabus && !s.syllabus) { s.syllabus = item; added++; continue; }
    if (addItem(subjectId, PYQ_RE.test(name) && !isSyllabus ? 'pyqs' : 'notes', item)) added++;
  }
  console.log(`  ${cfg.repo}@${sha.slice(0, 7)}: ${added} files${tree.truncated ? ' (TREE TRUNCATED)' : ''}${skipped ? `, ${skipped} skipped` : ''}`);
}

function importCampusVerse() {
  const { sems, data } = require('./source-campusverse.json');
  const key = 'campusverse';
  notes.sources[key] = { label: 'CampusVerse', home: 'https://campusverse-srm.vercel.app/' };
  const have = new Set();
  for (const s of Object.values(notes.subjects)) for (const sec of s.sections) for (const i of sec.items) if (!i.source) have.add(i.id);

  // CampusVerse keeps the display name in its semester list; the data object has the links.
  const names = {};
  for (const [sem, list] of Object.entries(sems)) for (const e of list) names[e.id] = names[e.id] || { name: e.name, sem: Number(sem) };
  let added = 0;
  for (const [cvId, subj] of Object.entries(data)) {
    const info = names[cvId] || { name: subj.name };
    const lists = [['pyqs', subj.pyqs], ['notes', subj.studyMaterials], ['videos', subj.youtube]];
    for (const [secKey, list] of lists) {
      for (const e of list || []) {
        const url = (e.link || '').trim();
        let m, item;
        if ((m = url.match(/\/file\/d\/([-\w]+)/))) item = { kind: 'file', id: m[1] };
        else if ((m = url.match(/\/folders\/([-\w]+)/))) item = { kind: 'folder', id: m[1] };
        else if ((m = url.match(/docs\.google\.com\/(document|presentation)\/d\/([-\w]+)/))) item = { kind: m[1] === 'document' ? 'doc' : 'slides', id: m[2] };
        else if (/youtube\.com|notion\.site/.test(url)) item = { kind: 'link', id: url };
        else continue; // GitHub-wrapped links are covered by the repo import; Studocu is paywalled
        if (have.has(item.id)) continue;
        Object.assign(item, { name: e.name.trim(), url, source: key });
        const subjectId = ensureSubject(info.name, info.sem, key);
        if (addItem(subjectId, item.kind === 'link' ? 'videos' : secKey, item)) { added++; have.add(item.id); }
      }
    }
  }
  console.log(`  CampusVerse: ${added} new links`);
}

async function importOfficial() {
  const key = 'srm-official';
  notes.sources[key] = { label: 'SRM official', home: 'https://srm-pyq-explorer.vercel.app/' };
  // Map our subject names to course codes; prefer the 2021 regulation, fall back to 2018.
  const byName = {};
  for (const [code, name] of Object.entries(COURSE_NAMES)) (byName[norm(name)] = byName[norm(name)] || []).push(code);
  const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let added = 0, subjects = 0;
  for (const [id, s] of Object.entries(notes.subjects)) {
    const codes = byName[norm(s.name)] || [];
    const pick = codes.filter(c => c.startsWith('21')).length ? codes.filter(c => c.startsWith('21')) : codes.filter(c => c.startsWith('18'));
    const papers = [];
    for (const code of pick) {
      const r = await getJSON(`${PYQ_API}/v1/courses/${code}/papers?limit=200`).catch(() => ({ data: [] }));
      for (const p of r.data || []) papers.push({ ...p, code });
    }
    for (const p of papers) {
      const files = await getJSON(`${PYQ_API}/v1/papers/${p.id}/files`).catch(() => ({ data: [] }));
      for (const f of files.data || []) {
        if (!f.public_url) continue;
        const when = [p.exam_month ? months[p.exam_month] : p.session_label, p.exam_year].filter(Boolean).join(' ');
        const name = `End Sem ${when}${pick.length > 1 ? ` (${p.code})` : ''}`.trim();
        if (addItem(id, 'official', { name, kind: 'pdf', id: f.id, url: f.public_url, source: key, sort: `${p.exam_year || 0}-${String(p.exam_month || 0).padStart(2, '0')}` })) added++;
      }
    }
    if (papers.length) subjects++;
  }
  // Newest first.
  for (const s of Object.values(notes.subjects)) {
    const sec = s.sections.find(x => x.key === 'official');
    if (sec) { sec.items.sort((a, b) => b.sort.localeCompare(a.sort)); sec.items.forEach(i => delete i.sort); }
  }
  console.log(`  SRM official papers: ${added} papers across ${subjects} subjects`);
}

// ---------------------------------------------------------------------------
(async () => {
  notes = JSON.parse(fs.readFileSync(NOTES, 'utf8'));

  // Strip everything previously imported.
  for (const [id, s] of Object.entries(notes.subjects)) {
    if (s.source) { delete notes.subjects[id]; continue; }
    if (s.syllabus && s.syllabus.source) s.syllabus = null;
    for (const sec of s.sections) sec.items = sec.items.filter(i => !i.source);
    s.sections = s.sections.filter(sec => sec.items.length);
  }
  for (const k of Object.keys(notes.semesters)) {
    notes.semesters[k] = notes.semesters[k].filter(id => notes.subjects[id]);
    if (!notes.semesters[k].length && isNaN(k)) delete notes.semesters[k];
  }
  notes.sources = { drive: { label: 'THE HELPER', home: 'https://www.thehelpers.tech/' } };

  console.log('GitHub repos:');
  for (const cfg of REPOS) {
    try { await importRepo(cfg); } catch (e) { console.log(`  ${cfg.repo}: FAILED ${e.message}`); }
  }
  console.log('Websites:');
  importCampusVerse();
  await importOfficial();

  // Tidy: natural-sort imported items after the original ones, and order semester lists.
  for (const s of Object.values(notes.subjects)) {
    for (const sec of s.sections) {
      if (sec.key === 'official') continue;
      const own = sec.items.filter(i => !i.source);
      const imported = sec.items.filter(i => i.source).sort((a, b) => collator.compare(a.name, b.name));
      sec.items = [...own, ...imported];
    }
  }
  for (const [k, ids] of Object.entries(notes.semesters)) {
    const created = ids.filter(id => notes.subjects[id].source).sort((a, b) => collator.compare(notes.subjects[a].name, notes.subjects[b].name));
    notes.semesters[k] = [...ids.filter(id => !notes.subjects[id].source), ...created];
  }
  const ordered = {};
  for (const k of Object.keys(notes.semesters).sort((a, b) => (isNaN(a) ? 99 : a) - (isNaN(b) ? 99 : b))) ordered[k] = notes.semesters[k];
  notes.semesters = ordered;

  notes.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(NOTES, JSON.stringify(notes));
  const total = Object.values(notes.subjects).reduce((n, s) => n + s.sections.reduce((m, x) => m + x.items.length, 0), 0);
  console.log(`\n${Object.keys(notes.subjects).length} subjects, ${total} resources, notes.json ${(fs.statSync(NOTES).size / 1e6).toFixed(2)} MB`);
})().catch(e => { console.error(e); process.exit(1); });
