# SRM Notes Hub

Notes, PYQs and study material for every SRMIST semester, shared by seniors. Static site, hosted on GitHub Pages; every resource links straight to the original Google Drive files shared by seniors, or to files in [pandeydhruv2001/SRM-Notes-Repository](https://github.com/pandeydhruv2001/SRM-Notes-Repository) served through the jsDelivr CDN. Nothing is stored in this repo.

## How it works

- `data/notes.json` is the whole catalogue (semesters → subjects → sections → items). The site reads only this file.
- Each item has a Google Drive `id` and `url`. Files open in an in-page viewer (Drive preview), with an "Open in Drive" fallback.
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
   Use `"kind": "folder"` and a `/drive/folders/<id>` URL for folders.
3. Commit and push; GitHub Pages redeploys automatically.

## Scripts

- `node scripts/check-links.js` checks every link is still public (no login needed). Add `--remove` to drop broken ones from `data/notes.json`. A GitHub Action runs this every Monday and fails if anything broke, which emails the repo owner.
- `node scripts/import-github.js` pulls in files from the GitHub notes repo (pinned to its latest commit) and merges them into `data/notes.json`. Folders not matched to an existing subject go under *Electives & more*. Safe to re-run when that repo gets new files.
- `node scripts/build-catalog.js` rebuilds `data/notes.json` from `scripts/source-raw.json`, the original imported list. Running it overwrites manual edits, so only use it to start over.
