# Blog Automation

Daily 5-post SEO blog automation for Basketball Arena (https://dhyey.bond/blog/).

## Setup
1. `cd blog-automation && npm install`
2. Copy `.env.example` to `.env` and fill in your keys:
   - `OPENROUTER_API_KEY_1` / `OPENROUTER_API_KEY_2` — OpenRouter keys.
   - `PEXELS_API_KEY` — free key from https://www.pexels.com/api/
3. Run once: `npm run generate`

## Local usage
- `npm run generate` — generate today's 5 posts into `../blog/` (updates blog index + sitemap + state).
- `npm test` — unit tests (Node built-in test runner).
- `npm start` — DEV-ONLY Express server (status / manual generate / model ranking). Never run this in CI; CI runs `node src/cli.js --ci`.

## GitHub Actions (production)
The `.github/workflows/auto-blog.yml` workflow runs daily at 06:00 UTC (11:30 IST), generates 5 posts, commits + pushes to `main`, and dispatches the Pages deploy. Required repository secrets:
- `OPENROUTER_API_KEY_1`, `OPENROUTER_API_KEY_2`
- `PEXELS_API_KEY`
- `NOTIFY_WEBHOOK_URL` (optional, failure alerts)

## How it works
1. Pick the best OpenRouter model (recency + popularity + context + price, filtered by `MAX_COST_PER_1K_TOKENS`).
2. For each of 5 slots: news slots fetch an RSS headline (ESPN/MLB, esports, BBC) that the AI rewrites into an SEO article; evergreen slots are pure AI generation on a rotating topic.
3. Fetch a Pexels photo (photographer credited in the article `<figcaption>`), with a branded SVG fallback.
4. Write `blog/<slug>/index.html`, update `blog/index.html` and `sitemap.xml`, record slugs/headlines in `state.json`.
5. Failures are per-slot; a run that produces at least 1 post commits its successes.
