// Normalises the scraped source data into data/notes.json, the file the site reads.
// Each item keeps its original link in `src`; `url` is rewritten later by copy-to-drive.
const fs = require('fs');
const path = require('path');
const { sems, data } = require('./source-raw.json');

const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function parse(url) {
  url = (url || '').trim();
  if (!/^https?:\/\//.test(url)) return null; // skips blanks and "Coming Soon" placeholders
  let m;
  if ((m = url.match(/\/folders\/([-\w]+)/))) return { kind: 'folder', id: m[1] };
  if ((m = url.match(/\/file\/d\/([-\w]+)/))) return { kind: 'file', id: m[1] };
  if ((m = url.match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([-\w]+)/)))
    return { kind: { document: 'doc', presentation: 'slides', spreadsheets: 'sheet' }[m[1]], id: m[2] };
  if ((m = url.match(/[?&]id=([-\w]+)/))) return { kind: 'file', id: m[1] };
  return { kind: 'link', id: null };
}

function item(raw) {
  const p = parse(raw.url);
  if (!p) return null;
  return { name: raw.name.trim(), kind: p.kind, id: p.id, src: raw.url.trim(), url: raw.url.trim() };
}

const subjects = {};
const semesters = {};
for (const [sem, names] of Object.entries(sems)) {
  semesters[sem] = names.map(name => {
    const id = slug(name);
    const s = data[name] || {};
    if (!subjects[id]) {
      const syl = s.syllabus ? item({ name: 'Syllabus', url: s.syllabus }) : null;
      subjects[id] = {
        name,
        semesters: [],
        syllabus: syl,
        sections: [
          { key: 'pyqs', title: 'Previous Year Questions', items: (s.pyqs || []).map(item).filter(Boolean) },
          { key: 'notes', title: 'Study Notes', items: (s.notes || []).map(item).filter(Boolean) },
          { key: 'strategies', title: 'Exam Strategies', items: (s.examStrategies || []).map(item).filter(Boolean) },
        ].filter(sec => sec.items.length),
      };
    }
    subjects[id].semesters.push(Number(sem));
    return id;
  });
}

const out = { updated: new Date().toISOString().slice(0, 10), semesters, subjects };
fs.writeFileSync(path.join(__dirname, '..', 'data', 'notes.json'), JSON.stringify(out, null, 1));
const items = Object.values(subjects).flatMap(s => [s.syllabus, ...s.sections.flatMap(x => x.items)]).filter(Boolean);
const by = {};
items.forEach(i => (by[i.kind] = (by[i.kind] || 0) + 1));
console.log('subjects', Object.keys(subjects).length, 'items', items.length, by);
