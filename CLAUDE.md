# Google Contacts Refiner — Dev Notes

## Local Dev
- Dashboard: `cd dashboard && GOOGLE_APPLICATION_CREDENTIALS=/tmp/dashboard-reader-key.json pnpm dev`
- SA key may expire — restore with: `gcloud iam service-accounts keys create /tmp/dashboard-reader-key.json --iam-account=dashboard-reader@contacts-refiner.iam.gserviceaccount.com --project=contacts-refiner`
- Python pipeline: `uv run python main.py analyze` / `uv run python main.py fix --auto`
- Full Python CLI: `backup`, `analyze`, `fix`, `fix --auto`, `ai-review`, `followup`, `ltns`, `tag-activity`
- Dashboard build: `cd dashboard && pnpm build` / `pnpm preview` (test prod locally)
- **Dev server cleanup**: Global PreToolUse hook auto-kills stale Nuxt processes before starting new `pnpm dev`

## Deploy
- Render auto-deploys dashboard on push to main (~5min)
- Cloud Build auto-deploys Cloud Run Job on push to main (~15min)
- GA4 Measurement ID: `G-QFW0D3J3KV` (in nuxt.config.ts head scripts)

## GCP Auth
- gcloud auth opens Safari by default — must manually copy URL to Chrome (Chrome-only policy)
- GCS SA role: needs **Object Admin** (not Object Creator) for file overwrites
- Cloud Run Job name: `contacts-refiner` (NOT `contacts-refiner-job`)
- Cloud Build auto-deploys on push to main, takes ~15min — don't trigger job immediately after push

## Code Conventions
- All system text in English — rules, reasons, logs, errors, git messages
- Contact data is Slovak (SK) — do not treat as Polish
- Error messages returned to client must be generic (no internal details)
- Corrupt decision files go to `data/failed/` (not retried)

## Key Architecture
- Pipeline phases: 0 (review feedback) → 1 (backup, analyze, fix HIGH) → 2 (AI review MEDIUM) → 3 (activity tagging) → 4 (FollowUp scoring)
- Phase 4 gated by `ENABLE_FOLLOWUP_SCORING` env var (**enabled** in Cloud Run since 2026-03-23)
- GCS is the message bus: workplan → analyze → queue → review → export → apply
- Review sessions in `data/review_sessions/`, decisions in `data/review_decisions_*.json`
- Feedback learning in `data/feedback.jsonl`
- `readJson` returns null ONLY on 404 — throws for all other GCS errors (auth, permissions, etc.)
- Emergency stop: `data/pipeline_paused.json` (written by dashboard, checked by entrypoint.py)

## Dashboard Patterns
- Name resolution: `getContactNameMap()` in gcs.ts — resolves resourceName → displayName from workplan + LinkedIn signals
- Cache: 60s TTL in-memory Map; `clearCache()` exposed via POST /api/cache-clear
- Demo masking: `demo.ts` — must handle ALL PII fields including `field === 'contact'` (tobedeleted names)
- API sub-routes: use directory structure (e.g., `api/config/index.get.ts` + `api/config/pause.post.ts`)
- Nuxt API routes with `isDemoMode()` guard for write endpoints
- GCS upload: use `upload_file_to_gcs()` from `utils.py` — shared by linkedin_scanner and followup_scorer
- Bug report: user-controlled screenshots only (paste/upload) — NEVER use DOM-scraping libraries (html2canvas etc.)
- Bug report API: sanitize all user input, wrap text in code blocks, validate screenshot as image data URL
- GITHUB_TOKEN on Render: fine-grained PAT, Issues RW only, scoped to repo, 90-day expiry
