# VaultysClaw Demo — Narration Script

## Target: 50 seconds | Audience: Enterprise Architects & Developers

---

### Pre-recording checklist

- [ ] Control plane running at http://localhost:3300
- [ ] 3 demo agents running (`./demo/setup.sh`)
- [ ] All 3 agents approved and online in the dashboard
- [ ] Agent graph populated (at least 3 nodes + edges visible)
- [ ] Screen resolution: 1920×1080, browser zoom 100%
- [ ] Recording tool ready (Screen Studio / OBS)
- [ ] Mic tested

---

## Scene-by-scene script

---

### SCENE 1 — The Problem [0s–5s]

**Visual**: Slide/text overlay on black background.

> **VO**: _"Enterprise AI is here. But most teams are building agents they can't audit, can't govern, and can't trust."_

**Text on screen**:

```
NO IDENTITY.  NO POLICY.  NO CONTROL.
```

**Cut to**: VaultysClaw logo fading in.

---

### SCENE 2 — Register an Agent [5s–18s]

**Visual**: Control plane dashboard (http://localhost:3300).
Show the **Registrations** panel with one pending agent ("Research Agent").

**Mouse action**: Click "Approve" on the pending registration.
In the capability selector, check `internet_access`. Click Confirm.

**Visual**: Agent status flips from `pending` → `online` (green dot).

> **VO**: _"In VaultysClaw, every agent has a cryptographic identity — verified on connection, never assumed. You approve it once, you own who's in your mesh."_

**Text overlay (bottom)**:

```
ZERO-TRUST  ·  CRYPTOGRAPHIC IDENTITY  ·  ONE CLICK ONBOARDING
```

---

### SCENE 3 — Assign Policy [18s–27s]

**Visual**: Click on the "Research Agent" row → Policy Editor opens.
Show `internet_access` already checked. Scroll to show `requiresApproval: true` on the `http_request` tool.

> **VO**: _"Every capability is policy-gated. Need a tool to require human approval before it fires? One toggle. Every execution is signed and auditable."_

**Text overlay**:

```
FINE-GRAINED POLICY  ·  APPROVAL GATES  ·  SIGNED EXECUTION
```

---

### SCENE 4 — Send an Intent, Watch it Execute [27s–38s]

**Visual**: Open the **Chat** panel. Select "Research Agent".
Type: `Research microservices security best practices and summarize the top 5 risks.`
Press Enter.

**Visual**: Show the **Tool Approval** popup appear:

```
⚠  Research Agent wants to call: http_request
   url: https://owasp.org/www-project-top-ten/
   [Approve]  [Reject]
```

Click **Approve**.

**Visual**: Streaming response appears in chat. Result shows signed summary.

> **VO**: _"Intent delivered in milliseconds over a persistent, authenticated WebSocket. The agent executes, the tool fires only after you approve — and every result comes back cryptographically signed."_

**Text overlay**:

```
REAL-TIME  ·  SIGNED RESULTS  ·  HUMAN IN THE LOOP
```

---

### SCENE 5 — The Agent Graph [38s–46s]

**Visual**: Navigate to the **Graph** view. Animated 3D force-directed graph shows:

- `Control Plane` (center)
- `Research Agent` — `Code Agent` — `Report Agent` (orbiting)
- Edges labelled with capabilities
- Delegation arrow from Research Agent → Code Agent (faint, animated)

Slow zoom in on the graph. Let it breathe for 2–3 seconds.

> **VO**: _"Full observability of your entire agent mesh — who delegates to whom, what capabilities flow where. At a glance."_

**Text overlay**:

```
AGENT MESH  ·  DELEGATION GRAPH  ·  FULL OBSERVABILITY
```

---

### SCENE 6 — Call to Action [46s–50s]

**Visual**: Fade to black. VaultysClaw logo + tagline.

```
VaultysClaw
Orchestrate with trust.

github.com/fxthoorens/VaultysClaw
```

> **VO**: _"VaultysClaw — the open enterprise foundation for AI agent orchestration."_

---

## Timing summary

| Scene                | Duration | Key visual                           |
| -------------------- | -------- | ------------------------------------ |
| 1. Problem           | 5s       | Text slide                           |
| 2. Register          | 13s      | Pending → Online (green dot)         |
| 3. Policy            | 9s       | Policy editor, approval toggle       |
| 4. Intent + Approval | 11s      | Chat → Tool approval → Signed result |
| 5. Graph             | 8s       | 3D agent mesh                        |
| 6. CTA               | 4s       | Logo + URL                           |
| **Total**            | **50s**  |                                      |

---

## Voice-over notes

- Pace: calm, confident. No rush. Let the UI breathe.
- Emphasise **cryptographic**, **signed**, **approved** — these are the differentiators.
- Avoid buzzwords like "revolutionary" or "game-changing".
- Record VO separately and sync in post for clean audio.

---

## Post-production checklist

- [ ] Speed up mouse movement between panels 1.5×
- [ ] Slow down (0.7×) during graph scene
- [ ] Zoom/highlight cursor on the "Approve" click
- [ ] Bold keyword text overlay: white on dark, 2s hold each
- [ ] Ambient background music: low-key, no vocals (Epidemic Sound: "Focus" category)
- [ ] Export: MP4 H.264, 1920×1080, 24fps
- [ ] Add captions for silent autoplay (LinkedIn/Twitter)
