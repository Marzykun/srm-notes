// Merges files from a public GitHub notes repo into data/notes.json.
// Files are linked through jsDelivr (or raw GitHub for Office files), pinned to a commit, so nothing is copied.
// Safe to re-run: previously imported items from the same repo are replaced.
//
//   node scripts/import-github.js            # pin to the repo's latest commit
//   node scripts/import-github.js <sha>      # pin to a specific commit

const fs = require('fs');
const path = require('path');

const REPO = 'pandeydhruv2001/SRM-Notes-Repository';
const NOTES = path.join(__dirname, '..', 'data', 'notes.json');

// Repo folder -> existing subject id. Folders not listed become new subjects under Electives.
const MERGE_INTO = {
  'Advanced Calculus and Complex Analysis': 'advanced-calculus-and-complex-analysis',
  'Artificial Intelligence': 'artificial-intelligence',
  'Compiler Design': 'compiler-design',
  'Computer Architecture': 'computer-organization-and-architecture',
  'Computer Network': 'computer-networks',
  'Database Management System': 'database-management-systems',
  'Design and Analysis of Algorithm': 'design-and-analysis-of-algorithms',
  'Discrete Mathematics': 'discrete-mathematics',
  'Formal Language & Automata': 'formal-language-and-automata',
  'French': 'foreign-languages',
  'Probability and Queueing Theory': 'probability-and-queueing-theory',
  'Transforms and Boundary Value Problems': 'transforms-and-boundary-value-problems',
};
const RENAME = { 'Previous Question Years': 'Previous Year Papers (Mixed)', 'Computer communications': 'Computer Communications' };

const KINDS = { pdf: 'pdf', doc: 'office', docx: 'office', ppt: 'office', pptx: 'office', jpg: 'image', jpeg: 'image', png: 'image' };
// Question papers, CT papers, answer keys, question banks and MCQs count as PYQs; the rest are notes.
const PYQ_RE = /end[\s_-]?sem|paper|\bqp\b|\bct[\s_-]?\d|clat|\bcla\b|cla[\s_-]?\d|answer|ans[\s_-]?key|\bkey|question|\bqb|mcq|maq|\b(19|22)\b|\d{2}sem|(dec|may|nov)[\s_-]?\d{2}|\bsem\b|5 to 7 sem|prev year|sample/i;

const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function gh(url) {
  const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  const res = await fetch(`https://api.github.com/repos/${REPO}${url}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
  return res.json();
}

(async () => {
  const sha = process.argv[2] || (await gh('/commits/HEAD')).sha;
  const tree = await gh(`/git/trees/${sha}?recursive=1`);
  if (tree.truncated) throw new Error('Tree truncated; repo too large for a single listing');
  const notes = JSON.parse(fs.readFileSync(NOTES, 'utf8'));
  const source = `github:${REPO}`;

  // Drop anything imported before from this repo, so re-runs don't duplicate.
  for (const [id, s] of Object.entries(notes.subjects)) {
    for (const sec of s.sections) sec.items = sec.items.filter(i => i.source !== source);
    s.sections = s.sections.filter(sec => sec.items.length);
    if (s.source === source) delete notes.subjects[id];
  }
  notes.semesters.electives = (notes.semesters.electives || []).filter(id => notes.subjects[id]);

  let added = 0;
  const files = tree.tree.filter(f => f.type === 'blob' && f.path.includes('/'));
  for (const f of files) {
    const ext = (f.path.match(/\.([^./]+)$/) || [])[1]?.toLowerCase();
    const kind = KINDS[ext];
    if (!kind) continue;
    const [folder, ...rest] = f.path.split('/');

    let subjectId = MERGE_INTO[folder];
    if (!subjectId) {
      const name = RENAME[folder] || folder;
      subjectId = slug(name);
      if (!notes.subjects[subjectId]) {
        notes.subjects[subjectId] = { name, semesters: ['electives'], syllabus: null, sections: [], source };
        notes.semesters.electives.push(subjectId);
      }
    }
    const subject = notes.subjects[subjectId];

    const fileName = rest.join(' / ').replace(/\.[^.]+$/, '').replace(/\.(docx|pptx)$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
    const isSyllabus = /syl+a?bus/i.test(fileName);
    const secKey = PYQ_RE.test(fileName) && !isSyllabus ? 'pyqs' : 'notes';
    // jsDelivr serves PDFs/images with the right type but refuses Office files; those come from raw GitHub.
    const filePath = f.path.split('/').map(encodeURIComponent).join('/');
    const url = kind === 'office'
      ? `https://raw.githubusercontent.com/${REPO}/${sha}/${filePath}`
      : `https://cdn.jsdelivr.net/gh/${REPO}@${sha}/${filePath}`;
    const item = { name: fileName, kind, ext, id: f.path, url, source };

    if (isSyllabus && !subject.syllabus) { subject.syllabus = item; added++; continue; }
    let sec = subject.sections.find(x => x.key === secKey);
    if (!sec) {
      sec = { key: secKey, title: secKey === 'pyqs' ? 'Previous Year Questions' : 'Study Notes', items: [] };
      subject.sections.push(sec);
      subject.sections.sort((a, b) => ['pyqs', 'notes', 'strategies'].indexOf(a.key) - ['pyqs', 'notes', 'strategies'].indexOf(b.key));
    }
    sec.items.push(item);
    added++;
  }

  // Natural sort imported items within each section, after the original Drive items.
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  for (const s of Object.values(notes.subjects)) {
    for (const sec of s.sections) {
      const own = sec.items.filter(i => i.source !== source);
      const imported = sec.items.filter(i => i.source === source).sort((a, b) => collator.compare(a.name, b.name));
      sec.items = [...own, ...imported];
    }
  }
  notes.semesters.electives.sort((a, b) => collator.compare(notes.subjects[a].name, notes.subjects[b].name));

  notes.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 1));
  console.log(`Imported ${added} files from ${REPO}@${sha.slice(0, 7)}; ${notes.semesters.electives.length} elective subjects.`);
})().catch(e => { console.error(e.message); process.exit(1); });
