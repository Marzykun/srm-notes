// Checks that every Drive link in data/notes.json is still publicly viewable.
// No login needed: a public link answers 200, a deleted/private one doesn't.
//
//   node scripts/check-links.js            # report broken links
//   node scripts/check-links.js --remove   # also delete them from data/notes.json

const fs = require('fs');
const path = require('path');

const NOTES = path.join(__dirname, '..', 'data', 'notes.json');
const notes = JSON.parse(fs.readFileSync(NOTES, 'utf8'));
const remove = process.argv.includes('--remove');

const checkUrl = item =>
  item.kind === 'folder'
    ? `https://drive.google.com/drive/folders/${item.id}`
    : `https://drive.google.com/file/d/${item.id}/view`;

async function isAlive(item, attempt = 0) {
  try {
    const res = await fetch(checkUrl(item), { redirect: 'manual' });
    if (res.status === 429 && attempt < 3) {
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      return isAlive(item, attempt + 1);
    }
    return res.status === 200;
  } catch (e) {
    return attempt < 2 ? isAlive(item, attempt + 1) : true; // network blip: don't flag
  }
}

(async () => {
  const entries = [];
  for (const [id, s] of Object.entries(notes.subjects)) {
    if (s.syllabus) entries.push({ subject: id, where: 'Syllabus', item: s.syllabus });
    for (const sec of s.sections) for (const item of sec.items) entries.push({ subject: id, where: sec.title, item });
  }

  const dead = [];
  for (let i = 0; i < entries.length; i += 10) {
    const batch = entries.slice(i, i + 10);
    const results = await Promise.all(batch.map(e => isAlive(e.item)));
    batch.forEach((e, k) => !results[k] && dead.push(e));
    process.stdout.write(`\rChecked ${Math.min(i + 10, entries.length)}/${entries.length}`);
  }
  console.log(`\n${dead.length} broken link(s)`);
  for (const e of dead) console.log(`  - ${notes.subjects[e.subject].name} / ${e.where} / ${e.item.name}`);

  if (remove && dead.length) {
    const deadItems = new Set(dead.map(e => e.item));
    for (const s of Object.values(notes.subjects)) {
      if (deadItems.has(s.syllabus)) s.syllabus = null;
      for (const sec of s.sections) sec.items = sec.items.filter(it => !deadItems.has(it));
      s.sections = s.sections.filter(sec => sec.items.length);
    }
    fs.writeFileSync(NOTES, JSON.stringify(notes, null, 1));
    console.log('Removed them from data/notes.json');
  }
  process.exitCode = dead.length && !remove ? 1 : 0;
})();
