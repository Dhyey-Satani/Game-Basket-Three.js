# Automated AI-Driven UI/UX & Frontend Testing Prompt

Use this prompt with any AI coding agent (opencode, Claude Code, Cursor, etc.) that has Playwright or browser-automation access. It makes the agent behave like a human QA tester: explore the site, find bugs, report them, then fix them and re-verify.

---

## ROLE

You are an expert QA + frontend engineer. You test the Basketball Arena game like a real human player, using browser automation (Playwright preferred). You think in terms of real user flows (clicks, drags, keyboards, resizing, fast interaction), not just DOM assertions.

## PROJECT

- URL to test: `https://4173-9373eba005ed49d2.monkeycode-ai.live` (or serve the repo locally with a static server)
- Repo: `/workspace` (Game-Basket-Three.js, a Three.js + Cannon.js 3D basketball game, vanilla JS, no build step)
- Main files: `index.html`, `style.css`, `script.js`, `dist/` (deploy copy - keep in sync with root)
- Recent changes to specifically verify:
  1. `#seo-footer` is visually hidden (position absolute, 1px, clipped) and must NOT block gameplay or capture clicks
  2. Bloom effect is OFF by default on first visit; settings toggle still turns it on/off
  3. `localStorage` settings key is `basketball_arena_settings_v2` (old `_v1` should be ignored)

## GAME MECHANICS (needed to test realistically)

- Menu has 7 modes: ARCADE, TIME ATTACK, MOVING HOOP, TRICK SHOT, CHALLENGE, HARD MODE, PRACTICE
- Gameplay: drag the ball upward with the mouse (pointer down on ball, drag up, release). Throw requires `dy > 0` and drag distance `> 25px`. Orbit camera controlled by dragging empty space.
- HUD during play: SCORE, timer, COMBO, power bar, shots/makes/miss/acc stats, pause/restart/settings/fullscreen buttons
- Settings: toggles for SFX, Music, Bloom, Aim guide; ball-skin picker; reset scores button
- Pause overlay: RESUME / RESTART / QUIT
- Game Over overlay: stats cards, leaderboard, PLAY AGAIN / MENU
- Leaderboard saved in `localStorage` key `basketball_arena_highscores_v1`

## SETUP

1. Serve the site locally (e.g. `python3 -m http.server 4173 --directory /workspace`) and use a real Chromium via Playwright.
2. Launch browser with WebGL enabled and a desktop viewport (1280x720) AND a mobile viewport (iPhone 13 / 390x844) for responsive checks.
3. Clear `localStorage` before the "first visit" tests so defaults are tested.
4. Use a helper that returns canvas element and can perform a realistic "drag to shoot" sequence: `mouse.move` to the ball center (query via canvas coordinate, e.g. center-lower area), `mouse.down`, `mouse.move` upward ~150-250px over several steps, `mouse.up`. Add small waits so the engine registers frames.
5. For canvas rendering assertions, capture screenshots and/or evaluate `renderer`/`state` globals via `page.evaluate` (script exposes globals like `state.screen`, `settings`).

## TEST PLAN (run all)

### A. First-visit defaults (fresh localStorage)
1. Page loads, no console errors, main menu visible with title, 7 mode buttons, SETTINGS, LEADERBOARD.
2. Bloom is OFF: `settings.bloomOn === false` AND `#set-bloom` checkbox unchecked AND the visual output matches non-bloom rendering (compare screenshot to a run with bloom on; the scene should not look "glowy").
3. Check `localStorage.getItem('basketball_arena_settings_v2')` exists after load; old `_v1` key is never read.

### B. SEO footer / gameplay blocking regression (critical)
1. Confirm `#seo-footer` is present in DOM but not visible (bounding box 0x0 or clipped).
2. Scroll: `window.scrollTo(0, document.body.scrollHeight)` - page should NOT scroll (body overflow hidden), footer must not push layout.
3. Start ARCADE mode. Verify the ball can be dragged and thrown WITHOUT the footer intercepting events. Verify footer is not in the topmost element under the pointer (elementFromPoint at bottom of screen returns canvas or HUD, never footer).
4. Confirm game canvas fills the full viewport height.

### C. Gameplay flows (each mode)
For each of the 7 modes:
1. Click mode button → menu hides, HUD shows, countdown 3-2-1 appears then game starts (`state.screen === 'playing'`).
2. Drag to shoot: ball launches, score/stat HUD updates when ball passes through hoop (may need to shoot several times; a miss is fine as long as stats increment).
3. Verify HUD elements relevant to mode (e.g., Challenge objectives box, power bar in Trick Shot, Moving Hoop moves).
4. End conditions: ARCADE timer counts down and triggers game over overlay with stats; verify score > 0 persisted to leaderboard.

### D. HUD buttons during play
1. Pause → PAUSED overlay with RESUME/RESTART/QUIT; RESUME resumes countdown+game, RESTART resets score, QUIT returns to menu.
2. Restart button (R) resets current run.
3. Settings button opens settings overlay mid-game and game is paused/blocked behind it.
4. Fullscreen button toggles `document.fullscreenElement` (desktop only).

### E. Settings behavior
1. Toggle SFX/Music/Bloom/Aim guide off and on; each change persists in `localStorage` and reflects in `settings` object immediately.
2. Bloom: toggling ON re-enables composer render path (`composer.render()` used), toggling OFF uses plain `renderer.render`. No console errors when toggling during active gameplay.
3. Ball skin picker: click each skin → ball mesh color/url changes in `currentBall`.
4. RESET scores: after having a high score, reset → leaderboard clears and menu best resets.
5. Close Settings via DONE → returns to previous screen without losing game state.

### F. Leaderboard
1. From menu, LEADERBOARD opens; empty state shows no entries (or "no scores").
2. After a scored game, leaderboard shows the new entry with correct score.
3. BACK closes cleanly.

### G. Responsive / mobile viewport (390x844)
1. Menu, settings, pause, game-over overlays all fit within viewport, no horizontal scrollbar, no clipped buttons.
2. HUD elements do not overlap each other or the canvas controls.
3. Touch-equivalent interaction: pointer events work (Playwright mouse drag works on desktop; verify layout only for mobile).
4. Tap targets are reasonably sized (> 24px).

### H. Accessibility & UX polish (report, even if not fixable)
1. All buttons have accessible names (aria-label / text). Dialogs have role="dialog" + aria-modal + aria-labelledby.
2. Keyboard: focus is visible; Escape closes settings/pause/gameover where applicable; menu can be navigated with Tab.
3. Contrast of text on overlays is readable.
4. `prefers-reduced-motion` is respected.

### I. Performance / stability (report)
1. Load page and watch for console errors/warnings over 30s.
2. Play 60s of active drag/shoot; record FPS via `page.evaluate` requestAnimationFrame counter. Flag if < 30 FPS on desktop.
3. Repeatedly toggle settings/fullscreen/pause 10x in a row; no leaks in listeners (no growing event-listener count, no errors).
4. Rapid clicking a mode button multiple times → should not start multiple concurrent games (state guarded).

## BUG REPORT FORMAT

For every bug, output a markdown section:

```md
### BUG-###: Short Title
- **Severity**: (Blocker / High / Medium / Low)
- **Category**: (Gameplay / UI / UX / Responsive / Accessibility / Performance / Regression)
- **Steps to reproduce**: numbered, exact actions
- **Expected**: what should happen
- **Actual**: what happened (include screenshot path and console errors)
- **Affected browser/viewport**: e.g. Chromium 1280x720
- **Root cause (if found)**: file:line and explanation
```

## FIXING WORKFLOW

1. Fix the highest-severity bugs first (Blockers then High), then Medium, then Low if time permits.
2. Always apply fixes to BOTH `/workspace/script.js`/`style.css`/`index.html` AND the matching files in `/workspace/dist/` so they stay identical.
3. Follow existing code style. Do NOT add comments unless necessary. Do not break existing features.
4. After each fix, re-run the failing test(s) to confirm the bug is resolved and run a quick smoke test of main flows (menu → play → pause → game over) to ensure no regression.
5. If a bug cannot be fixed (e.g., browser-only quirk), document why and mark it "Won't fix / needs decision".

## DELIVERABLES

1. A list of ALL bugs found (even minor), each in the format above, ordered by severity.
2. For each fixed bug: the code change (file + before/after snippet) and the verification result.
3. A summary table: Bug ID | Severity | Status (Fixed / Open / Won't fix).
4. Confirmation that the three recent changes still hold (seo-footer hidden, bloom default off, settings v2).
5. Final screenshot set: menu, in-game HUD, settings, game over, mobile viewport.

## CONSTRAINTS

- Do not modify production data. Use a fresh browser profile / clear localStorage for each test run.
- Do not skip the regression checks in section B and the settings-v2 check - these protect recent fixes.
- Keep total runtime reasonable; prefer targeted, deterministic tests over long waits.
- If using Playwright test runner, add `test.describe.configure({ mode: 'parallel' })` ONLY for independent suites (A, B, F) to save time; keep gameplay suites serial.
