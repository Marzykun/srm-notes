# SRM Notes Hub

Notes, PYQs and study material for every SRMIST semester, shared by seniors. Static site, hosted on GitHub Pages. Nothing is stored in this repo: every resource links to where it already lives:

- **THE HELPER**: the original Drive catalogue (`scripts/source-raw.json`)
- **GitHub notes repos**: pandeydhruv2001, pulkitshringi (sem 3–6), kunalkeshan (ECE), BharathwajManoharan (CSE, 2018 reg.), orbit-psd2, utkarshtambe10, rajsrm2021, srikrithisanthanam. Linked through jsDelivr (PDFs/images) or raw GitHub (Office files, files over 20 MB), pinned to a commit.
- **CampusVerse**: extra Drive links and lecture channels (`scripts/source-campusverse.json`)
- **SRM official end-sem papers**: from SRM's library archive, via the public [SRM PYQ API](https://srm-api-docs.vercel.app), which mirrors the PDFs to public storage

## How it works

- `data/notes.json` is the whole catalogue (semesters → subjects → sections → items). The site reads only this file.
- Drive items carry an `id` and `url`; GitHub items carry their repo `source` and file path as `id`, and the URL is built from `data.sources`. Files open in an in-page viewer (Drive preview, the browser's PDF viewer, Google's viewer on phones, Office's viewer for Word/PowerPoint). Files over 20 MB open on GitHub instead.
- No build step: `index.html`, `styles.css`, `app.js`.

## Run locally

```bash
python -m http.server 5180
```

Then open http://localhost:5180.

## Adding notes

1. Make sure the Drive file or folder is shared as "Anyone with the link can view" and copy its ID from the link.
2. Add an entry to the right subject in `data/notes.json`:
   ```json
   { "name": "PYQ May 2026", "kind": "file", "id": "<drive file id>", "url": "https://drive.google.com/file/d/<id>/view" }
   ```
   Leave out `source` so the importer never removes it.
   Use `"kind": "folder"` and a `/drive/folders/<id>` URL for folders.
3. Commit and push; GitHub Pages redeploys automatically.

## Scripts

- `node scripts/check-links.js` checks every link is still public (no login needed). Add `--remove` to drop broken ones from `data/notes.json`. A GitHub Action runs this every Monday and fails if anything broke, which emails the repo owner.
- `node scripts/import-sources.js` rebuilds everything imported from the sources above (latest commit of each repo, CampusVerse links, official papers) and merges it into `data/notes.json`. Subjects are matched by name; unmatched ones are added to their semester, or *Electives & more* when the semester is unknown. Re-run it whenever the sources get new files. Set `GITHUB_TOKEN` to avoid GitHub's API rate limit.
- `node scripts/build-catalog.js` rebuilds `data/notes.json` from `scripts/source-raw.json`, the original imported list. Running it overwrites manual edits, so only use it to start over.
