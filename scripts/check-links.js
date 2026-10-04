// Checks that every Drive and GitHub link in data/notes.json is still publicly viewable.
// No login needed: a public link answers 200, a deleted/private one doesn't.
//
//   node scripts/check-links.js            # report broken links
//   node scripts/check-links.js --remove   # also delete them from data/notes.json

const fs = require('fs');
const path = require('path');

const NOTES = path.join(__dirname, '..', 'data', 'notes.json');
const notes = JSON.parse(fs.readFileSync(NOTES, 'utf8'));
const remove = process.argv.includes('--remove');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DRIVE_KINDS = new Set(['file', 'folder', 'doc', 'slides', 'sheet']);

// Mirrors itemUrl() in app.js.
function checkUrl(item) {
  if (DRIVE_KINDS.has(item.kind)) {
    return item.kind === 'folder' ? `https://drive.google.com/drive/folders/${item.id}` : `https://drive.google.com/file/d/${item.id}/view`;
  }
  if (item.url) return item.url;
  const src = notes.sources[item.source];
  const filePath = item.id.split('/').map(encodeURIComponent).join('/');
  return (item.kind === 'office' || item.big ? src.raw : src.cdn) + filePath;
}
const isDrive = item => DRIVE_KINDS.has(item.kind);

// Returns true (works), false (broken) or null (couldn't tell, e.g. Google rate-limited us).
async function isAlive(item, attempt = 0) {
  try {
    const res = await fetch(checkUrl(item), { redirect: 'manual', method: isDrive(item) ? 'GET' : 'HEAD' });
    if (res.status === 200) return true;
    // Google answers bursts of requests with a redirect to its "unusual traffic" page.
    if (/google\.com\/sorry/.test(res.headers.get('location') || '')) return null;
    if (attempt < 2) {
      await sleep(2000 * (attempt + 1));
      return isAlive(item, attempt + 1);
    }
    return false;
  } catch (e) {
    return attempt < 2 ? isAlive(item, attempt + 1) : null;
  }
}

(async () => {
  const entries = [];
  for (const [id, s] of Object.entries(notes.subjects)) {
    if (s.syllabus) entries.push({ subject: id, where: 'Syllabus', item: s.syllabus });
    for (const sec of s.sections) for (const item of sec.items) entries.push({ subject: id, where: sec.title, item });
  }

  const dead = [];
  let unknown = 0;
  // Drive is checked gently (Google rate-limits bursts); the CDNs can take more at once.
  // External links (YouTube channels, Notion pages) aren't checked.
  const groups = [
    { entries: entries.filter(e => isDrive(e.item)), size: 3, pause: 400 },
    { entries: entries.filter(e => !isDrive(e.item) && e.item.kind !== 'link'), size: 10, pause: 0 },
  ];
  let done = 0;
  for (const g of groups) {
    for (let i = 0; i < g.entries.length; i += g.size) {
      const batch = g.entries.slice(i, i + g.size);
      const results = await Promise.all(batch.map(e => isAlive(e.item)));
      batch.forEach((e, k) => {
        if (results[k] === false) dead.push(e);
        else if (results[k] === null) unknown++;
      });
      done += batch.length;
      process.stdout.write(`\rChecked ${done}/${entries.length}`);
      if (g.pause) await sleep(g.pause);
    }
  }

  console.log(`\n${dead.length} broken link(s)${unknown ? `; ${unknown} couldn't be checked (rate-limited, re-run later)` : ''}`);
  for (const e of dead) console.log(`  - ${notes.subjects[e.subject].name} / ${e.where} / ${e.item.name}`);

  if (remove && dead.length) {
    const deadItems = new Set(dead.map(e => e.item));
    for (const s of Object.values(notes.subjects)) {
      if (deadItems.has(s.syllabus)) s.syllabus = null;
      for (const sec of s.sections) sec.items = sec.items.filter(it => !deadItems.has(it));
      s.sections = s.sections.filter(sec => sec.items.length);
    }
    fs.writeFileSync(NOTES, JSON.stringify(notes));
    console.log('Removed them from data/notes.json');
  }
  process.exitCode = dead.length && !remove ? 1 : 0;
})();
