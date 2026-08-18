# Daily Blog Automation System — Design Spec

Date: 2026-08-18
Status: Approved (with review feedback baked in)

## 1. Overview

An automated system that publishes **5 SEO-friendly blog posts every day** to the Basketball Arena site (`https://dhyey.bond/blog/`), covering **baseball**, **esports**, and **current events**. Posts are real-news-driven where possible (RSS feeds rewritten by an AI model), use **real photos from the Pexels API**, are written by the **best model selected from OpenRouter**, and are posted to the site via a **daily GitHub Actions cron workflow** that commits to `main` and triggers the existing Pages deploy.

## 2. Constraints Anchors

The generated articles MUST be byte-compatible with the existing blog infrastructure so no client-side code changes are required:

- Match the exact HTML structure of existing articles (e.g. `blog/1v1-basketball-strategies/index.html`): head meta, Open Graph, Twitter Card, JSON-LD `Article` + `BreadcrumbList`, breadcrumb nav, `article-header`, `article-body` with `h2[id]` headings, hero `<figure>`, `.article-cta`, related section, footer, `blog.js` script tag.
- Follow `/blog/index.html` card conventions (`.article-card`, `data-search` attribute, badge, title, excerpt, meta with `<time>` and "N min read", image 1200×630).
- Keep `blog/js/blog.js` working: TOC generation requires every `<h2>` to have an `id`; search requires `data-search` on each card.
- Update `/sitemap.xml` with each new post URL.

## 3. Architecture

```
blog-automation/
  package.json          # deps: dotenv, rss-parser, express (dev server only)
  .env.example          # placeholder secret names (gitignored real .env)
  state.json            # dedup state, committed so it survives across CI runs
  config.js             # site config + categories + RSS URLs + cost caps + rotation
  src/
    models.js           # OpenRouter model discovery + composite ranking
    rss.js              # fetch + parse primary/fallback RSS feeds, dedup via state
    content.js          # build prompts, call OpenRouter chat completions, parse JSON
    images.js           # Pexels search/download + branded SVG fallback
    article.js          # render article HTML from content object
    index-updater.js    # update /blog/index.html and /sitemap.xml
    runner.js           # orchestrate 5-post pipeline with per-post try/catch
    cli.js              # CLI entry (one-shot, local testing)
  server.js             # DEV-ONLY Express API (status / generate / models)
  README.md             # setup, secrets, local usage, Pexels key signup
.github/workflows/
  auto-blog.yml         # daily cron workflow
```

- The workflow checks out the repo, runs `npm ci && npm run generate`, then commits whatever was generated and pushes to `main`. A push made with the default `GITHUB_TOKEN` does **not** auto-trigger the `on: push` deploy workflow, so the workflow ends by dispatching `deploy.yml` via `workflow_dispatch` (deploy.yml already accepts it with no required inputs).

## 4. Daily 5-Post Mix

A fixed 5-slot plan; slots 2 and 4 are evergreen and vary their topic by rotating on `dayOfYear % N` against topic pools. All other slots are news-driven.

| # | Type | Source | SEO angle |
|---|------|--------|-----------|
| 1 | Baseball news | RSS (primary + fallback) → AI rewrite | timely headline + keyword-rich meta |
| 2 | Baseball evergreen guide | AI (rotating topic pool: gear, drills, rules, positions) | long-tail SEO |
| 3 | Esports news | RSS (primary + fallback) → AI rewrite | trending esports news |
| 4 | Esports evergreen guide | AI (rotating topic pool: titles, mechanics, hardware, pro tips) | long-tail SEO |
| 5 | Current events / trending | RSS (primary + fallback) → AI rewrite | general trending + site link |

**RSS fallback:** each news category defines a **primary + at least one fallback** URL in `config.js` (see §8). If both feeds fail, the slot falls back to **pure AI-generated evergreen content** for that category instead of aborting.

**Internal linking:** every article ends with a "Related" / "See also" section auto-inserting at least **one internal link** to a recent post in the same category (drawn from `state.json.recentSlugs` or existing `/blog` articles). News articles also link the site home page. This is a required SEO signal, not optional.

## 5. Model Selection ("pick the top greatest model")

`models.js`:

1. Fetch `https://openrouter.ai/api/v1/models` and the `frontend/models/find?fmt=cards&order=most-popular` popularity feed (technique reused from the existing commit-writer system).
2. **Filter candidates before ranking** (order matters — cost guardrail first):
   - text modality only (exclude image/vision/audio/video),
   - `context_length` >= a configurable minimum,
   - **`price_per_1k_tokens <= MAX_COST_PER_1K_TOKENS`** (config.js) — computed from `pricing.prompt + pricing.completion`. This is a hard filter, not a soft preference.
3. Rank survivors by a composite score: **recency** (`created`), **popularity**, **context length** bonus, **price** bonus. Deterministic, logged with the score breakdown.
4. If the API fails, fall back to a curated fallback list in `config.js`.

**Dual-key failover:** the two OpenRouter keys are tried in order; on `401`/`429`/network error the request retries with the second key. Keys load from `OPENROUTER_API_KEY_1` / `OPENROUTER_API_KEY_2` (GitHub secrets / `.env` locally).

## 6. Images (Pexels + SVG fallback)

`images.js`:

1. Request an image search query from the AI (returned with the content).
2. Call Pexels `/v1/search` (`PEXELS_API_KEY`), pick the best landscape result, download the large/1200×630 crop to `blog/images/<slug>.<ext>`.
3. **Attribution (license requirement):** the Pexels response's `photographer` and `photographer_url` are written into the article HTML as a `<figcaption>` under the hero image (and any in-body image). Skipping this is a license violation.
4. **Fallback:** if Pexels fails, is missing a key, or returns nothing usable, generate a branded SVG illustration (dark court gradient + neon accent, matching the existing `blog/images/*.svg` style) at 1200×630.
5. Omit "Pexels" wording from visible UI; plain credit link only.

## 7. Posting Pipeline

1. `runner.js` loads config + secrets + `state.json`.
2. For each of the 5 slots (sequential, per-post `try/catch` — **partial failures are tolerated**): resolve content source → generate via OpenRouter → fetch image → render article → write `blog/<slug>/index.html`. A failure in one slot logs and continues; successes accumulate.
3. If **0 of 5** succeeded, the run exits non-zero (so the failure notification fires) and nothing is committed.
4. Otherwise update `blog/index.html` (insert new cards, newest becomes `.featured`) and `sitemap.xml`, then commit **only the successful posts** + index/sitemap/state changes.
5. The workflow pushes to `main` and dispatches the deploy workflow.

## 8. RSS Feeds (Primary + Fallback per Category)

Configured in `config.js`, each news category has `feeds: [primary, fallback, ...]`, tried in order until one parses non-empty:

- Baseball: ESPN MLB news RSS; fallback MLB.com or CBS Sports MLB.
- Esports: ESPN esports RSS; fallbacks HLTV / Dexerto / Dot Esports.
- Current events: BBC News top stories; fallback BBC Sport or Google News RSS.

`rss.js` uses `rss-parser` and enforces a fetch timeout.

## 9. Deduplication (state.json)

`blog-automation/state.json` (committed so it persists between CI runs) stores:

```json
{
  "recentHeadlines": [ {"title": "...", "category": "baseball", "date": "2026-08-18"} ],
  "recentSlugs": ["...", "..."]
}
```

- `rss.js` skips any headline whose normalized title matches one already covered in the last **N = 30** days.
- `runner.js` skips any slug already present in `state.json`.
- After a successful run, new headlines + slugs are appended and the list is trimmed to the window.
- Since `state.json` lives in the repo, CI runs read the previous day's state.

## 10. GitHub Actions Workflow (auto-blog.yml)

```yaml
name: Daily Blog Generation
on:
  schedule:
    # 06:00 UTC daily == 11:30 IST (cron runs in UTC by default)
    - cron: '0 6 * * *'
  workflow_dispatch:

concurrency:
  group: blog-generation
  cancel-in-progress: false   # queue, never cancel -> serializes cron vs manual runs

permissions:
  contents: write

jobs:
  generate-and-post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: blog-automation/package-lock.json }
      - name: Install & generate
        env:
          OPENROUTER_API_KEY_1: ${{ secrets.OPENROUTER_API_KEY_1 }}
          OPENROUTER_API_KEY_2: ${{ secrets.OPENROUTER_API_KEY_2 }}
          PEXELS_API_KEY: ${{ secrets.PEXELS_API_KEY }}
        run: |
          cd blog-automation && npm ci && node src/cli.js --ci
      - name: Commit & push (if changes)
        run: |
          git config user.name "blog-bot"
          git config user.email "blog-bot@users.noreply.github.com"
          git add -A
          git diff --cached --quiet || (git commit -m "feat(blog): daily automated posts $(date -u +%F)" && git push)
      - name: Trigger Pages deploy
        run: gh workflow run deploy.yml --repo "$GITHUB_REPOSITORY"
        env:
          GH_TOKEN: ${{ github.token }}

  notify-failure:
    needs: generate-and-post
    if: failure()
    runs-on: ubuntu-latest
    steps:
      - name: Notify
        run: |
          curl -fsS -X POST "${{ secrets.NOTIFY_WEBHOOK_URL }}" \
            -H 'Content-Type: application/json' \
            -d "{\"content\":\"Daily blog automation FAILED on $(date -u +%F). See $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID\"}" \
            || true
```

Notes:
- **Cron timezone:** GitHub cron is UTC. `'0 6 * * *'` = 06:00 UTC = 11:30 IST, noted explicitly in the workflow comment.
- **Concurrency:** `cancel-in-progress: false` queues overlapping runs instead of cancelling, preventing git push conflicts between a manual `/api/generate` and the cron run. (GitHub Actions jobs in the same `concurrency` group run sequentially; the `commit` step is the serialization point.)
- **`notify-failure`:** pings `NOTIFY_WEBHOOK_URL` (Discord/Slack/any webhook) when the main job fails. `|| true` so the notification itself never fails the job.
- The commit step uses `git diff --cached --quiet` to skip empty commits when nothing was generated.
- `deploy.yml` accepts `workflow_dispatch` with **no required inputs**, so `gh workflow run deploy.yml` works with no parameters.

## 11. Secrets

| Name | Purpose |
|---|---|
| `OPENROUTER_API_KEY_1` | Primary OpenRouter key (user-provided) |
| `OPENROUTER_API_KEY_2` | Failover OpenRouter key (user-provided) |
| `PEXELS_API_KEY` | Pexels photo search (user signs up free at pexels.com/api) |
| `NOTIFY_WEBHOOK_URL` | Optional; failure notification webhook |

Locally these come from `blog-automation/.env` (gitignored); `.env.example` documents the names with placeholders. **No real key values are committed anywhere.**

## 12. Dev-Only Express Server

`blog-automation/server.js` provides `GET /api/status`, `POST /api/generate` (manual run), and `GET /api/models` (current ranking). It is:
- explicitly documented in the README as **dev-only**,
- **excluded from the Actions workflow** (CI uses `node src/cli.js --ci`, never the server),
- a thin convenience wrapper around `runner.js`, not a separate code path.

## 13. Cost Guardrails

- `MAX_COST_PER_1K_TOKENS` in `config.js` hard-filters candidates **before** ranking (§5).
- `MAX_OUTPUT_TOKENS` caps every generation call.
- News slots generate from a supplied headline (short context); evergreen slots are single-call, full-article generations (no multi-turn retries).

## 14. Failure Handling Summary

| Failure | Behavior |
|---|---|
| One of 5 slots fails | Log, continue; commit the other posts (partial success) |
| All 5 fail | Exit non-zero, no commit, `notify-failure` fires |
| RSS primary fails | Try fallback feed; then evergreen AI content |
| Both OpenRouter keys fail | Retry with backoff (2 attempts); then slot fails (handled above) |
| Pexels fails / no key | SVG fallback image |
| Overlapping runs | `concurrency` group queues them |
| No changes generated | Commit step skipped; deploy still dispatched (harmless) |

## 15. Testing & Verification

1. Run the pipeline locally once with the provided OpenRouter keys and a local Pexels key: `cd blog-automation && npm run generate`.
2. Verify: 5 valid `blog/<slug>/index.html` files (validate against the existing template), hero `<figure>` with credit `<figcaption>`, updated `blog/index.html` (5 new cards, newest featured), updated `sitemap.xml`, updated `state.json`.
3. Verify `blog.js` TOC + search still function (H2 `id`s present, `data-search` present).
4. Verify model ranking output is logged with score breakdown.
5. Manual trigger path: `node src/cli.js` and (optionally) `POST /api/generate`.
6. **Nothing is pushed to git automatically during this session** — the user reviews and commits; the daily automation runs thereafter.

## 16. Out of Scope

- Multi-language content.
- Social media auto-posting.
- Commenting/discussion features.
- On-page A/B or analytics instrumentation beyond the existing Google tag.
- Generating posts for the old `dist/` build (the deploy workflow serves the repo root, not `dist`).
