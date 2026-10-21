import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame } from "remotion";
import { Bot, BrowserWindow, Chip, CLAMP, DISPLAY, ease, FONT, GOLD, Hacker, Headline, IdIcon, ORANGE, INK, KeyIcon, MIST, MIST_DIM, Link, LockIcon, Person, Place, Pop, RED, Rise, Shield, TEAL, Travel, usePop, NAVY } from "../explainer/kit";
import type { SceneProps } from "./types";

/** How VaultysClaw works: an employee's identity and rights, for every agent. */

/**
 * VaultysClaw's wordmark (intro/assets/claw-wordmark-light.png: the orange shield, "VAULTYS" in
 * white for the navy backdrop, "CLAW" in orange): the shield pops, then the name is wiped in from
 * behind it. `height` is the wordmark's; it is ~6 times as wide.
 */
export function Wordmark({ logo, height = 150, from }: { logo: string; height?: number; from: number }) {
  const frame = useCurrentFrame();
  const pop = usePop(from, { damping: 13, stiffness: 110 });
  // The shield is the first ~15 % of the image's width.
  const wipe = interpolate(frame, [from + 8, from + 30], [15, 100], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const width = (height * 1999) / 336;
  if (!logo) return <div style={{ fontFamily: DISPLAY, fontSize: height, color: INK }}>VaultysClaw</div>;
  return (
    <div style={{ width, height, opacity: Math.min(1, pop * 1.5), transform: `scale(${0.85 + pop * 0.15})`, filter: `drop-shadow(0 18px 40px rgba(0,0,0,0.45)) drop-shadow(0 0 50px ${ORANGE}44)` }}>
      <Img src={logo} style={{ width, height, clipPath: `inset(0 ${100 - wipe}% 0 0)` }} />
    </div>
  );
}

function IdentityCard({ from, avatar, name, role, kind, rights, rightsLabel, accent }: { from: number; avatar: React.ReactNode; name: string; role: string; kind: string; rights: string[]; rightsLabel: string; accent: string }) {
  const frame = useCurrentFrame();
  const p = usePop(from, { damping: 16, stiffness: 100 });
  return (
    <div
      style={{
        width: 560,
        borderRadius: 30,
        padding: 34,
        background: "linear-gradient(160deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
        border: `1.5px solid ${accent}66`,
        boxShadow: `0 40px 90px rgba(0,0,0,0.45), 0 0 50px ${accent}22`,
        opacity: Math.min(1, p * 1.4),
        transform: `translateY(${(1 - p) * 70}px) rotate(${(1 - p) * 4}deg)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
        <div style={{ width: 120, height: 120, borderRadius: 24, background: `${accent}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>{avatar}</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 4, color: accent, textTransform: "uppercase" }}>{kind}</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: INK, marginTop: 4 }}>{name}</div>
          <div style={{ fontSize: 24, fontWeight: 500, color: MIST }}>{role}</div>
        </div>
      </div>
      <div style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: MIST_DIM, letterSpacing: 3, textTransform: "uppercase", marginRight: 6 }}>{rightsLabel}</span>
        {rights.map((r, i) => (
          <span key={r} style={{ opacity: ease(frame, from + 18 + i * 6, from + 30 + i * 6) }}>
            <Chip color={accent} size={20}>
              {r}
            </Chip>
          </span>
        ))}
      </div>
    </div>
  );
}

export function SolutionScene({ t, at, logo }: SceneProps) {
  const frame = useCurrentFrame();
  const up = ease(frame, at("control", 0), at("control", 0.25), Easing.inOut(Easing.cubic));
  return (
    <AbsoluteFill>
      <Place x={960} y={interpolate(up, [0, 1], [420, 240])} style={{ transform: `translate(-50%, -50%) scale(${1 - up * 0.45})` }}>
        <Wordmark logo={logo} from={at("solution", 0)} />
      </Place>
      <Place x={960} y={interpolate(up, [0, 1], [700, 410])} style={{ transform: `translate(-50%, -50%) scale(${1 - up * 0.3})` }}>
        <Headline text={t.solution.title} from={at("solution", 0.3)} size={88} align="center" width={1600} accent={t.solution.accent} />
      </Place>
      <div style={{ position: "absolute", left: 0, right: 0, top: 540, display: "flex", justifyContent: "center", alignItems: "center", gap: 60, opacity: up }}>
        <IdentityCard from={at("control", 0.1)} avatar={<Person size={96} color={MIST} />} name={t.solution.employee.name} role={t.solution.employee.role} kind={t.solution.employee.kind} rights={["ERP", "CRM", "Mail"]} rightsLabel={t.solution.rights} accent={MIST} />
        <div style={{ fontFamily: DISPLAY, fontSize: 90, color: TEAL, opacity: ease(frame, at("control", 0.3), at("control", 0.4)) }}>=</div>
        <IdentityCard from={at("control", 0.25)} avatar={<Bot size={96} color={TEAL} />} name={t.solution.agent.name} role={t.solution.agent.role} kind={t.solution.agent.kind} rights={["file_read", "api_call"]} rightsLabel={t.solution.rights} accent={TEAL} />
      </div>
      <Place x={960} y={960}>
        <Rise from={at("control", 0.6)}>
          <div style={{ fontSize: 34, fontWeight: 600, color: MIST, letterSpacing: 1 }}>{t.solution.sub}</div>
        </Rise>
      </Place>
    </AbsoluteFill>
  );
}

// ── Identity: a key born on the agent, a public identity going out ────────

function Strike({ from, text }: { from: number; text: string }) {
  const frame = useCurrentFrame();
  const p = ease(frame, from, from + 14);
  const s = ease(frame, from + 14, from + 26);
  return (
    <div style={{ position: "relative", opacity: p, transform: `translateX(${(1 - p) * 40}px)`, display: "inline-flex", alignItems: "center", gap: 18, padding: "16px 30px", borderRadius: 18, background: "rgba(255,77,109,0.08)", border: `1.5px solid ${RED}55` }}>
      <LockIcon size={34} color={`${RED}cc`} />
      <span style={{ fontSize: 34, fontWeight: 700, color: s > 0.5 ? "rgba(241,236,250,0.5)" : INK }}>{text}</span>
      <div style={{ position: "absolute", left: 16, right: 16, top: "50%", height: 5, borderRadius: 3, background: RED, transform: `scaleX(${s})`, transformOrigin: "left", boxShadow: `0 0 14px ${RED}` }} />
    </div>
  );
}

export function IdentityScene({ t, at }: SceneProps) {
  const frame = useCurrentFrame();
  const key = ease(frame, at("identity", 0.2), at("identity", 0.35));
  const ring = ease(frame, at("identity", 0.62), at("identity", 0.8));
  const idOut = at("identity", 0.42);
  return (
    <AbsoluteFill>
      <Place x={110} y={200} style={{ transform: "translate(0, -50%)" }}>
        <Headline text={t.identity.title} from={at("identity", 0.02)} size={76} width={1700} accent={[]} />
      </Place>
      <Pop x={620} y={600} from={at("identity", 0)}>
        <Bot size={300} color={MIST} glow={key * 0.6} />
      </Pop>
      {/* the secret key: inside the agent, behind a ring it never crosses */}
      <Place x={620} y={640} style={{ opacity: key, transform: `translate(-50%, -50%) scale(${0.4 + key * 0.6})` }}>
        <KeyIcon size={110} rotate={-20 + frame / 3} />
      </Place>
      <Place x={620} y={605} style={{ opacity: ring }}>
        <svg width={520} height={520} viewBox="-260 -260 520 520" style={{ transform: `rotate(${frame / 2}deg)` }}>
          <circle r={240} fill="none" stroke={GOLD} strokeWidth={3} strokeDasharray="14 12" opacity={0.8} />
        </svg>
      </Place>
      <Place x={620} y={900}>
        <Rise from={at("identity", 0.62)}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: GOLD }}>{t.identity.key}</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: MIST }}>{t.identity.keyNote}</div>
          </div>
        </Rise>
      </Place>
      <Travel from={[700, 560]} to={[1340, 470]} start={idOut} end={idOut + 26} stay>
        <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "26px 34px", borderRadius: 26, background: "rgba(46,230,182,0.08)", border: `2px solid ${TEAL}`, boxShadow: `0 0 50px ${TEAL}33` }}>
          <IdIcon size={110} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: TEAL, letterSpacing: 4, textTransform: "uppercase" }}>{t.identity.id}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 56, color: INK, letterSpacing: 1 }}>VaultysID</div>
            <div style={{ fontFamily: "monospace", fontSize: 20, color: MIST_DIM }}>did:vaultys:3f9a…c21e</div>
          </div>
        </div>
      </Travel>
      <div style={{ position: "absolute", left: 1110, top: 690, display: "flex", flexDirection: "column", gap: 24 }}>
        <Strike from={at("nopassword", 0.05)} text={t.identity.password} />
        <Strike from={at("nopassword", 0.35)} text={t.identity.database} />
      </div>
    </AbsoluteFill>
  );
}

// ── Rights: chosen by an admin, sealed in a certificate ───────────────────

const CAPS = ["file_read", "api_call", "internet_access"];

export function RightsScene({ t, at, footage }: SceneProps) {
  const frame = useCurrentFrame();
  const capAt = [0.55, 0.7, 0.86].map((k) => at("rights", k));
  const cert = at("certificate", 0.02);
  const seal = at("certificate", 0.55);
  const sealP = usePop(seal, { damping: 10, stiffness: 160 });
  return (
    <AbsoluteFill>
      <Place x={110} y={200} style={{ transform: "translate(0, -50%)" }}>
        <Headline text={t.rights.title} from={at("rights", 0.02)} size={80} width={900} accent={[]} />
      </Place>
      <Place x={600} y={610}>
        <BrowserWindow clip={footage?.file} at={footage ? footage.marks.approve - 0.5 : undefined} hold={footage ? footage.marks.certificates - footage.marks.approve - 1.2 : undefined} from={at("rights", 0.15)} width={960} tilt={9} url="vaultysclaw / admin / actors" />
      </Place>
      <Pop x={1460} y={600} from={cert}>
        <div style={{ width: 600, height: 560, borderRadius: 28, padding: "34px 40px", background: "linear-gradient(165deg, #fdfbf8, #eef2f4)", boxShadow: "0 50px 100px rgba(0,0,0,0.5)", color: NAVY, position: "relative" }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 4, color: NAVY, textTransform: "uppercase" }}>{t.rights.cert}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
            <Bot size={56} color={NAVY} />
            <div style={{ fontSize: 30, fontWeight: 800 }}>openclaw-00477</div>
          </div>
          <div style={{ height: 210 }} />
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 10, columnGap: 22, fontSize: 22, opacity: ease(frame, cert + 20, cert + 34) }}>
            <span style={{ fontWeight: 700, color: "#6a8590" }}>{t.rights.scope}</span>
            <span style={{ fontWeight: 700 }}>{t.rights.scopeValue}</span>
            <span style={{ fontWeight: 700, color: "#6a8590" }}>{t.rights.expires}</span>
            <span style={{ fontWeight: 700 }}>{t.rights.expiresValue}</span>
          </div>
          <div style={{ position: "absolute", left: 40, bottom: 30, fontSize: 19, fontWeight: 600, color: "#6a8590", opacity: ease(frame, seal, seal + 12) }}>{t.rights.signed}</div>
          {/* the seal */}
          <div style={{ position: "absolute", right: 34, bottom: 30, opacity: Math.min(1, sealP * 2), transform: `scale(${2.2 - sealP * 1.2}) rotate(${-18 + sealP * 6}deg)` }}>
            <svg width={130} height={130} viewBox="-65 -65 130 130">
              <circle r={60} fill={ORANGE} />
              <circle r={50} fill="none" stroke="white" strokeWidth={2} strokeDasharray="4 5" opacity={0.7} />
              <path d="M-22 2 L-6 18 L24 -16" stroke={TEAL} strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </Pop>
      {/* the capabilities ticked on screen, gathered on the right, then sealed into the certificate
          (drawn after it, so they land on it) */}
      {CAPS.map((c, i) => {
        const land = cert + 10 + i * 5;
        const p = usePop(capAt[i]);
        const travel = interpolate(frame, [land, land + 16], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
        const [x0, y0] = [1460, 380 + i * 92];
        const [x1, y1] = [1340 + (i % 2) * 230, 720 + Math.floor(i / 2) * 64 - 200];
        return (
          <Place key={c} x={x0 + (x1 - x0) * travel} y={y0 + (y1 - y0) * travel} style={{ opacity: Math.min(1, p * 1.5), transform: `translate(-50%, -50%) scale(${(0.6 + 0.4 * p) * (1 - 0.22 * travel)})` }}>
            <Chip color={TEAL} size={30} solid={travel > 0.5}>
              {c}
            </Chip>
          </Place>
        );
      })}
      <Place x={1460} y={960}>
        <Rise from={at("certificate", 0.82)}>
          <Chip color={GOLD} size={28} icon={<OfflineIcon />}>
            {t.rights.offline}
          </Chip>
        </Rise>
      </Place>
    </AbsoluteFill>
  );
}

function OfflineIcon() {
  return (
    <svg width={30} height={30} viewBox="0 0 64 64">
      <path d="M8 24 C22 10 42 10 56 24 M16 34 C26 24 38 24 48 34 M25 44 C29 40 35 40 39 44" stroke={GOLD} strokeWidth={6} fill="none" strokeLinecap="round" />
      <circle cx={32} cy={53} r={4} fill={GOLD} />
      <line x1={10} y1={8} x2={54} y2={58} stroke={GOLD} strokeWidth={6} strokeLinecap="round" />
    </svg>
  );
}

// ── Architecture: rights down, signed logs up, data peer to peer ─────────

const NODES = [
  { x: 400, kind: "agent" },
  { x: 773, kind: "user" },
  { x: 1146, kind: "agent" },
  { x: 1520, kind: "agent" },
] as const;
const NODE_Y = 660;
const PLANE: [number, number] = [960, 300];

export function ArchitectureScene({ t, at }: SceneProps) {
  const frame = useCurrentFrame();
  const p2p = at("p2p", 0.1);
  const pairs: [number, number, number][] = [
    [0, 1, 150],
    [1, 2, 150],
    [2, 3, 150],
    [0, 2, 240],
    [1, 3, 240],
  ];
  return (
    <AbsoluteFill>
      <Pop x={PLANE[0]} y={PLANE[1]} from={at("plane", 0)}>
        <div style={{ width: 720, padding: "30px 40px", borderRadius: 26, textAlign: "center", background: "linear-gradient(160deg, rgba(185,208,217,0.18), rgba(185,208,217,0.06))", border: `2px solid ${MIST}`, boxShadow: `0 30px 80px rgba(0,0,0,0.4), 0 0 60px ${MIST}33` }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 64, color: INK, letterSpacing: 2, textTransform: "uppercase" }}>{t.architecture.plane}</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: MIST, marginTop: 6 }}>{t.architecture.planeSub}</div>
        </div>
      </Pop>
      {NODES.map((n, i) => (
        <Link key={i} a={[PLANE[0] + (n.x - 960) * 0.35, PLANE[1] + 80]} b={[n.x, NODE_Y - 85]} from={at("plane", 0.1) + i * 4} color="rgba(185,208,217,0.45)" width={2.5} />
      ))}
      {/* rights going down, then signed logs coming back up */}
      {NODES.map((n, i) => (
        <React.Fragment key={i}>
          <Travel from={[PLANE[0] + (n.x - 960) * 0.35, PLANE[1] + 90]} to={[n.x, NODE_Y - 100]} start={at("plane", 0.25) + i * 5} end={at("plane", 0.25) + i * 5 + 30}>
            <Chip color={GOLD} size={20} icon={<KeyIcon size={22} />}>
              {t.architecture.rights}
            </Chip>
          </Travel>
          <Travel from={[n.x, NODE_Y - 100]} to={[PLANE[0] + (n.x - 960) * 0.35, PLANE[1] + 90]} start={at("plane", 0.62) + i * 5} end={at("plane", 0.62) + i * 5 + 30}>
            <Chip color={MIST} size={20}>
              {t.architecture.logs} ✓
            </Chip>
          </Travel>
        </React.Fragment>
      ))}
      {pairs.map(([a, b, bend], i) => (
        <Link key={i} a={[NODES[a].x, NODE_Y + 70]} b={[NODES[b].x, NODE_Y + 70]} bend={bend} from={p2p + i * 5} color={TEAL} width={4} glow />
      ))}
      {pairs.map(([a, b, bend], i) => (
        <Travel key={i} from={[NODES[a].x, NODE_Y + 70]} to={[NODES[b].x, NODE_Y + 70]} start={at("p2p", 0.35) + i * 9} end={at("p2p", 0.35) + i * 9 + 34} arc={-bend / 2}>
          <div style={{ width: 46, height: 46, borderRadius: 23, background: "#0f2a22", border: `2px solid ${TEAL}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 20px ${TEAL}` }}>
            <LockIcon size={22} />
          </div>
        </Travel>
      ))}
      {NODES.map((n, i) => {
        const user = n.kind === "user";
        const c = user ? MIST : TEAL;
        return (
          <Pop key={i} x={n.x} y={NODE_Y} from={at("plane", 0.05) + i * 4}>
            <div style={{ width: 170, height: 170, borderRadius: 85, background: user ? "#203f4c" : "#123a30", border: `3px solid ${c}`, boxShadow: `0 0 40px ${c}44`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
              {user ? <Person size={64} color={c} /> : <Bot size={64} color={c} />}
              <div style={{ fontSize: 24, fontWeight: 800, color: INK }}>{user ? t.architecture.user : t.architecture.agent}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: c }}>VaultysID</div>
            </div>
          </Pop>
        );
      })}
      <Place x={960} y={970}>
        <Rise from={at("p2p", 0.55)}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 52, color: TEAL, letterSpacing: 3, textTransform: "uppercase" }}>{t.architecture.p2p}</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: MIST }}>{t.architecture.p2pSub}</div>
          </div>
        </Rise>
      </Place>
    </AbsoluteFill>
  );
}

// ── Immunity: one agent struck, the rest untouched ───────────────────────

const MESH: [number, number][] = [
  [520, 430], [800, 360], [1100, 400], [1400, 360],
  [640, 640], [960, 600], [1260, 620], [1560, 590],
  [480, 840], [820, 860], [1120, 850], [1440, 830],
];
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 6], [3, 7], [4, 5], [5, 6], [6, 7], [4, 8], [5, 9], [6, 10], [7, 11], [8, 9], [9, 10], [10, 11], [1, 4], [2, 5], [6, 11],
];
const STRUCK = 5;

export function ImmunityScene({ t, at }: SceneProps) {
  const frame = useCurrentFrame();
  const hit = at("notarget", 0.62);
  const struck = frame > hit;
  const tries = at("contained", 0.05);
  const cut = ease(frame, at("contained", 0.45), at("contained", 0.6));
  const neighbours = EDGES.filter((e) => e.includes(STRUCK)).map(([a, b]) => (a === STRUCK ? b : a));
  return (
    <AbsoluteFill>
      <Place x={110} y={200} style={{ transform: "translate(0, -50%)" }}>
        <Headline text={t.immunity.title} from={at("notarget", 0.02)} size={84} width={1200} accent={[]} />
      </Place>
      {EDGES.map(([a, b], i) => {
        const touches = a === STRUCK || b === STRUCK;
        return <Link key={i} a={MESH[a]} b={MESH[b]} from={at("notarget", 0.05) + i} color={touches && struck ? RED : `${TEAL}88`} width={2.5} flow={!touches || !struck} opacity={touches ? 1 - cut : 1} />;
      })}
      {/* the attacker's tries at the neighbours, each bouncing off */}
      {neighbours.map((n, i) => {
        const start = tries + i * 7;
        const [x0, y0] = MESH[STRUCK];
        const [x1, y1] = MESH[n];
        const p = interpolate(frame, [start, start + 16, start + 26], [0, 0.72, 0.5], CLAMP);
        const vis = interpolate(frame, [start, start + 4, start + 22, start + 30], [0, 1, 1, 0], CLAMP);
        return <div key={n} style={{ position: "absolute", left: x0 + (x1 - x0) * p - 10, top: y0 + (y1 - y0) * p - 10, width: 20, height: 20, borderRadius: 10, background: RED, boxShadow: `0 0 20px ${RED}`, opacity: vis }} />;
      })}
      {MESH.map(([x, y], i) => {
        const shield = neighbours.includes(i) ? ease(frame, tries + neighbours.indexOf(i) * 7 + 12, tries + neighbours.indexOf(i) * 7 + 20) : 0;
        return (
          <Pop key={i} x={x} y={y} from={at("notarget", 0) + i * 2}>
            <div style={{ position: "relative" }}>
              {shield > 0 && (
                <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -54%) scale(${0.8 + shield * 0.3})`, opacity: shield * (1 - ease(frame, at("contained", 0.9), at("contained", 1)) * 0.6) }}>
                  <Shield size={120} fill={0.12} />
                </div>
              )}
              <Bot size={82} state={i === STRUCK && struck ? "danger" : "ok"} glow={i === STRUCK && struck ? 1 : 0.3} />
            </div>
          </Pop>
        );
      })}
      <Pop x={200} y={600} from={at("notarget", 0.35)}>
        <Hacker size={150} />
      </Pop>
      <Travel from={[260, 600]} to={MESH[STRUCK]} start={at("notarget", 0.48)} end={hit}>
        <div style={{ width: 80, height: 8, borderRadius: 4, background: `linear-gradient(90deg, transparent, ${RED})`, boxShadow: `0 0 20px ${RED}` }} />
      </Travel>
      {/* the struck agent, isolated */}
      <Place x={MESH[STRUCK][0]} y={MESH[STRUCK][1]} style={{ opacity: cut }}>
        <svg width={220} height={220} viewBox="-110 -110 220 220" style={{ transform: `rotate(${frame}deg)` }}>
          <circle r={95} fill="none" stroke={RED} strokeWidth={3} strokeDasharray="10 10" />
        </svg>
      </Place>
      <Place x={960} y={995}>
        <Rise from={at("contained", 0.5)}>
          <div style={{ fontFamily: DISPLAY, fontSize: 56, color: TEAL, letterSpacing: 3, textTransform: "uppercase" }}>{t.immunity.contained}</div>
        </Rise>
      </Place>
    </AbsoluteFill>
  );
}
