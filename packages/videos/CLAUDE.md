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
pnpm generate:marketing        # the animated marketing video (see below): no stack needed, only the footage already recorded
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

- `tts.ts` is the same as VaultysHub's, except that the default French voice is **Manon**
  (`m5U7XCsc8v988k2RJAqN`, a native voice from the library: it needs a paid plan). Providers: ElevenLabs (`ELEVENLABS_API_KEY` in
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

## The marketing video (`marketing/`): animated, narrated, with console footage

Around 3 minutes, **entirely animated in Remotion**, in the style of the investor deck (deep violet,
lavender, teal for what is protected, red for the attacker, the condensed **Anton** typeface for
headlines, **Montserrat** for body text, both loaded with `@remotion/google-fonts`). It is not a
console recording: the console only appears inside browser windows (`BrowserWindow`), as clips cut
out of a single recording.

```bash
pnpm generate:videos marketing-screens            # 1. the console footage (stack running): screens/marketing-screens.en.mp4 + marks
pnpm generate:marketing                           # 2. → .generated-videos/marketing.fr.mp4 / .en.mp4 + .srt
pnpm --filter @vaultysclaw/videos generate:marketing en
VIDEO_TTS=none pnpm --filter @vaultysclaw/videos generate:marketing --check   # → marketing-check.jpg, 4 frames per line, no credits
pnpm --filter @vaultysclaw/videos studio:marketing                            # preview (estimated durations)
```

- **The engine** (`explainer/`) is VaultysHub's: `timeline()` lays the lines end to end on the
  length of the voice clips, and each scene times its animations on its own lines
  (`at("line", fraction)`). The pictures therefore follow the voice in both languages, with no
  manual timing. `explainer/render.ts`: synthesis, a silent Remotion render, then the shared
  `render.ts` (intro, outro, mix, `.srt`). `kit.tsx` was restyled after the deck (palette,
  backdrop, chapter labels in spaced capitals, `Bot`, `Shield`, `Headline` word by word,
  `BrowserWindow`…).
- **The narration** (`marketing.narration.json`) follows vaultys.com/fr/product/vaultysclaw and
  the deck, **with none of the deck's financial figures** (it is meant for investors). Fourteen
  scenes (`Marketing.tsx` `SCENES`): the hook, the three questions and Shadow AI, the central
  directory as a single target, the agent-as-employee model, identity, rights and certificate,
  control plane plus peer to peer, no single target, the kill switch, visibility and audit,
  post-quantum, frugal and sovereign, the access domains, the closing. The
  on-screen text is in `texts.ts`; the scenes are in `problem.tsx`, `solution.tsx` and
  `product.tsx`.
- **What we may say, checked against the code**: the agent's identity is generated on the agent
  (the simulator, like the SDK, creates its VaultysId locally); the certificate is a signed
  artefact that `packages/policy` verifies with no network; the kill switch suspends without
  touching the ledger and is reversible with no reissuance (`lib/kill-switch.ts`); the PQC option
  exists (`software-pqc`, `dilithium_ed25519`). The figures ("20 to 80 agents per employee by
  2031", frugality) come from the deck. **Do not promise** an instant revocation: a client learns
  about it on its next `cert_status_request`.
- **The domains scene is about VaultysClaw's scope, not a score against a framework.** VaultysClaw
  focuses on securing access, so the video no longer claims "7 of Anthropic's 12 domains": it shows
  the twelve domains of AI agent security (Anthropic's framework, credited on screen only), picks
  out the six about access, and gives VaultysClaw's status on those: identity & authentication,
  access control, resource scope, observability & audit, tool access covered; credential
  protection in progress (statuses from the deck). The selection and the statuses are `ACCESS` in
  `product.tsx`; change them there, and the counter and the narration's `coverage` line with them.
- **The footage** (`marketing-screens/`, `screensOnly`, English only because the console is):
  one recording with a mark per shot (`approve`, `certificates`, `graph-owner`, `killswitch-armed`,
  `audit-table`…), set once its screen has loaded. The kill switch is armed and then disarmed
  on screen (always disarmed in a `finally`: an armed switch left in the database suspends the
  whole fleet), and the scene's robots go dark and come back **in sync with the clip**, through
  those marks.
  - The fleet's auto-approval leaves nothing pending after a restart: `setup/` therefore adds
    six "newcomers" (fresh identities, never approved) on every run, so the approval scene always
    has someone to approve.
- **"Control plane" is never translated** in French (neither on screen nor in the narration), and is said the English way: `pronounce` in the narration (« kontrol plèïne »).
- **The French voice is Manon** (`voice.elevenlabs.fr` in the narration, and the default); the
  English voice stays Sarah. A narration of about 2,600 characters per language.
