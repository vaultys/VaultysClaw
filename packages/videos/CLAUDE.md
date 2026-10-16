# packages/videos — narrated demo videos of the console (Playwright)

**Not a test suite.** Each spec drives the real control plane, which runs on a stack of its own with a
live simulated estate, and renders a narrated video. This is the same pipeline as VaultysHub's
`packages/portal/e2e/videos` (screencast, TTS, Remotion intro/outro, ffmpeg mix), adapted here.
Keep the two pipelines close to each other: when a fix lands in one, port it to the other.

```bash
pnpm video:up                  # database (5436) + migrations + `next build` of the control plane
pnpm generate:videos           # every video → packages/videos/.generated-videos/<name>.<lang>.mp4 + .srt
pnpm generate:videos -g lang:en                  # one language
pnpm generate:videos console-tour                # one video
VIDEO_TTS=none pnpm generate:videos              # subtitles only, no voice credits: for pacing
VIDEO_KEEP_FLEET=1 pnpm generate:videos          # leave the fleet connected after the run
pnpm video:down                # stop the database ( video:nuke also deletes it, the fleet's identities and the admin )
```

## The stack: `docker/video.env`

The control plane is a production build, ports **3013 / ws 8093**, Postgres **5436**, under its own
compose project `vaultysclaw-video` (`docker/docker-compose.simulator.yml` reused with
`-p vaultysclaw-video`). It is deliberately not the simulator's stack: VaultysHub's video labs
hold 3003/8083 on a machine that records both products, and a recording must not disturb a
simulator demo. `docker/video.env` is the single source of truth (`stack.ts` parses it).

- **`next build` writes `packages/controlplane/.next`**, the same build the simulator stack serves.
  Both are built with `NEXT_PUBLIC_ALLOW_DEV_LOGIN=1`, so either works for both, but a rebuild while
  one of them runs breaks it.
- The config's `webServer` starts the control plane (`pnpm video:cp`), or reuses one already
  listening on 3013.

## Before each run: `setup/stack.setup.ts` (not filmed)

1. **A living estate.** It runs the simulator (`stack.ts` `spawnSimulator`) with 400 estate Actors
   and 1,000 agents, owned by 280 people, using `--duration 0`, so they stay connected while
   filming. `teardown.ts` stops it (pid in `.generated-videos/.fleet.pid`). The identities live in
   `.generated-videos/.simdata`, not the simulator's `.simdata`: certificates there were signed by
   another control plane. A first run takes about 3 min, a rerun is a reconnection (~20 s).
   - Call the simulator through `stack.ts`, **never through the root `pnpm simulator` script**:
     that script sources `docker/simulator.env` and would point the fleet at the other database.
   - The auto-approval only covers the first wave, so certification plateaus at about 83 %. The
     rest stays pending, and that is what the approval scene approves.
2. **The filmed admin, "Camille Laurent".** It is minted once by `pnpm simulator admin` (an
   ordinary human Actor with `admin_console_access`). Its VaultysID, taken from the snippet the
   command writes, is kept in `.generated-videos/.auth/admin.identity.json`, put into
   `localStorage`, then **"Sign in with a VaultysID in this browser"** is clicked, as a person
   would, and the session is saved (`admin.json`). If the volume has been nuked, the login fails
   and a new admin is minted.

## One video = two files with the same base name, one output per language

- `<name>.narration.json`: `title` (intro), `outro`, `lines` (spoken and subtitled), each as
  `{ "fr": …, "en": … }`. This is the file you proofread.
- `<name>.spec.ts`: `defineVideo(__filename, title, async (demo) => …, { languages })`, `fr` and
  `en` by default.
- **The console is English only**: a language changes the voice, the subtitles and the browser
  locale (dates), not the UI. That is why we select by role, accessible name or route
  (`nav a[href="/admin/map"]`). The console has almost no `data-testid`.
- `demo.say(id)`, `demo.click/hover/type/moveAt`, `demo.follow`, `demo.openBrowser`,
  `demo.label`, `demo.mark`: same API as in VaultysHub (see `director.ts`). Never call
  `locator.click()` directly, or the cursor jumps.

## Rules for every video

- **Look at the frames, not only at the passing test.** For example:
  `ffmpeg -i .generated-videos/x.fr.mp4 -vf "fps=1/3,scale=480:-1,tile=4x8" -frames:v 1 sheet.jpg`.
  Problems seen this way: the overview jumping down during a sentence, and the graph reduced to a
  tiny cluster at the bottom of the screen.
- **`demo.hover` / `demo.click` scroll** (`scrollIntoViewIfNeeded`), and `main` is the console's
  scroll container. To point at something without moving the page, use its `boundingBox()` and
  `demo.moveAt`.
- **The graph** (`/admin/graph`) frames all 1,500 nodes, so on screen it is just a speck, and its
  canvas starts below the filters. Search for a person (`Find by name or DID`): the camera flies to
  them. Then centre the canvas (`scrollIntoView({ block: "center" })`). The busiest owner,
  "Aurélie Dubois", is stable from run to run (ownership is assigned by DID hash).
- **Map**: the extent includes the overseas territories, so France is small; the narration says
  so ("from headquarters to overseas sites"). The OSM tiles require network access.
- **Marketing copy, never a promise the product does not keep**: a revocation takes effect on the
  client's next refresh, so we say "you can revoke it at any time", not "instantly".
- **Never an ellipsis at the start of a sentence** (`tts.ts` rejects it). Words the French voice
  must pronounce go through `PRONOUNCE` (`VaultysClaw` → « Voltisse Clô »).

## Voice, intro, music

- `tts.ts` is unchanged from VaultysHub: ElevenLabs (`ELEVENLABS_API_KEY` in
  `packages/videos/.env`, git-ignored; free plan: 10,000 characters per month, about 900 per
  language for the tour), `edge` (403 since October 2026), or `none`. The cache lives in
  `.generated-videos/.tts-cache/`: only lines that changed are regenerated.
- `intro/` (Remotion): a Vaultys scene (violet, `assets/vaultys.svg`), then a VaultysClaw scene
  (indigo `#4f46e5`, the console's primary-600). The logo is `docs-site/static/img/logo.svg`, in
  its own colours on a white tile, because the blue-to-violet shield would disappear on indigo.
  The outro mirrors it. Cached in `.generated-videos/.intro-cache/`. Preview:
  `pnpm --filter @vaultysclaw/videos studio`. Remotion licence: free for 3 people or fewer.
- Optional music (git-ignored, mind the licence): `music.mp3` (under the whole video),
  `intro/music.mp3`, `intro/outro-music.mp3`; otherwise `intro/jingle.ts` synthesizes one. Mixed
  to −14 LUFS.

## Videos

- **`console-tour/`**: the console in about 1 min 10 s (≈ 1 min 37 s with intro and outro).
  Overview and its counters, an approval (two capabilities checked on a pending registration), the
  map, the graph centred on its busiest owner, the certificate ledger, the audit log.
