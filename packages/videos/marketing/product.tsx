import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { AMBER, Bot, BrowserWindow, Chip, CLAMP, Database, DISPLAY, ease, GOLD, Hacker, Headline, INK, MIST, MIST_DIM, LockIcon, Place, Pop, rand, RED, Rise, Shield, TEAL, Travel, usePop, NAVY } from "../explainer/kit";
import { FPS } from "../intro/Intro";
import { Wordmark } from "./solution";
import type { SceneProps } from "./types";

/** The product at work: the kill switch, the fleet and its log, post-quantum, frugal, the framework, the close. */

// ── Kill switch: the console, synced with a fleet that goes dark and comes back ──

export function KillswitchScene({ t, at, footage }: SceneProps) {
  const frame = useCurrentFrame();
  const open = at("killswitch", 0.08);
  // The clip starts 4 s before the switch is armed in it: the reason and "ARM" are typed on screen.
  const lead = 4;
  const start = footage ? footage.marks["killswitch-armed"] - lead : 0;
  const armedAt = open + lead * FPS;
  const disarmedAt = footage ? open + Math.round((footage.marks["killswitch-disarmed"] - start) * FPS) : at("restore", 0.4);
  const off = ease(frame, armedAt, armedAt + 10) * (1 - ease(frame, disarmedAt, disarmedAt + 14));
  return (
    <AbsoluteFill>
      <Place x={640} y={600}>
        <BrowserWindow clip={footage?.file} at={start} hold={(disarmedAt - open) / FPS + 2} from={open} width={1040} tilt={9} url="vaultysclaw / admin / settings" />
      </Place>
      <div style={{ position: "absolute", left: 1270, top: 170, width: 560 }}>
        <div style={{ position: "relative", height: 260 }}>
          <div style={{ position: "absolute", inset: 0, opacity: 1 - ease(frame, at("restore", 0), at("restore", 0.15)) }}>
            <Headline text={t.killswitch.title} from={at("killswitch", 0.05)} size={66} width={560} accent={[]} />
          </div>
          <div style={{ position: "absolute", inset: 0 }}>
            <Headline text={t.killswitch.restore} from={at("restore", 0.1)} size={66} width={560} accent={[]} color={TEAL} />
          </div>
        </div>
        {/* the fleet, suspended and restored as the switch is armed and disarmed on screen */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 22, marginTop: 40 }}>
          {Array.from({ length: 24 }, (_, i) => {
            const d = rand(i) * 8;
            const o = ease(frame, armedAt + d, armedAt + d + 8) * (1 - ease(frame, disarmedAt + d, disarmedAt + d + 10));
            return (
              <div key={i} style={{ opacity: ease(frame, open + i, open + i + 10), transform: `scale(${1 - o * 0.12})` }}>
                <Bot size={70} state={o > 0.5 ? "off" : "ok"} glow={o > 0.5 ? 0 : 0.3} />
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 40, height: 60 }}>
          <div style={{ opacity: off }}>
            <Chip color={RED} size={28}>
              {t.killswitch.armed}
            </Chip>
          </div>
          <div style={{ marginTop: -62, opacity: frame > disarmedAt ? ease(frame, disarmedAt + 6, disarmedAt + 18) : 0 }}>
            <Chip color={TEAL} size={28}>
              {t.killswitch.disarmed} ✓
            </Chip>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ── Visibility: the graph, then the signed log ────────────────────────────

export function VisibilityScene({ t, at, footage }: SceneProps) {
  const frame = useCurrentFrame();
  const second = at("audit", 0.02);
  const swap = ease(frame, second, second + 18, Easing.inOut(Easing.cubic));
  return (
    <AbsoluteFill>
      <Place x={960} y={170}>
        <div style={{ position: "relative", width: 1700, height: 110 }}>
          <div style={{ position: "absolute", inset: 0, opacity: 1 - swap }}>
            <Headline text={t.visibility.title} from={at("visibility", 0.02)} size={78} width={1700} align="center" accent={[]} />
          </div>
          <div style={{ position: "absolute", inset: 0, opacity: swap }}>
            <Headline text={t.visibility.audit} from={second + 4} size={78} width={1700} align="center" accent={[]} color={TEAL} />
          </div>
        </div>
      </Place>
      <Place x={interpolate(swap, [0, 1], [960, 620])} y={interpolate(swap, [0, 1], [610, 640])} style={{ transform: `translate(-50%, -50%) scale(${1 - swap * 0.18})`, opacity: 1 - swap * 0.45 }}>
        <BrowserWindow clip={footage?.file} at={footage ? footage.marks["graph-owner"] - 2.5 : undefined} hold={8} from={at("visibility", 0.05)} width={1180} tilt={0} url="vaultysclaw / admin / graph" />
      </Place>
      <Place x={1260} y={640}>
        <BrowserWindow clip={footage?.file} at={footage ? footage.marks["audit-table"] - 0.4 : undefined} hold={6} from={second} width={1040} tilt={-8} url="vaultysclaw / admin / audit" />
      </Place>
      {/* signatures, ticked down the log */}
      {[0, 1, 2, 3].map((i) => (
        <Pop key={i} x={1790} y={540 + i * 70} from={second + 24 + i * 8}>
          <Chip color={TEAL} size={20} solid>
            ✓ {t.visibility.signed}
          </Chip>
        </Pop>
      ))}
      <Place x={1260} y={1000}>
        <Rise from={at("audit", 0.55)}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ChainIcon />
            <span style={{ fontFamily: DISPLAY, fontSize: 44, color: INK, letterSpacing: 3, textTransform: "uppercase" }}>{t.visibility.ledger}</span>
          </div>
        </Rise>
      </Place>
    </AbsoluteFill>
  );
}

function ChainIcon() {
  return (
    <svg width={56} height={56} viewBox="0 0 64 64">
      <rect x={6} y={22} width={28} height={20} rx={10} fill="none" stroke={TEAL} strokeWidth={5} />
      <rect x={30} y={22} width={28} height={20} rx={10} fill="none" stroke={MIST} strokeWidth={5} />
    </svg>
  );
}

// ── Post-quantum: harvested now, decrypted later — except here ───────────

function Atom({ size = 160, color = RED }: { size?: number; color?: string }) {
  const frame = useCurrentFrame();
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" style={{ overflow: "visible", filter: `drop-shadow(0 0 16px ${color})` }}>
      {[0, 60, 120].map((a) => (
        <ellipse key={a} rx={44} ry={15} fill="none" stroke={color} strokeWidth={2.5} transform={`rotate(${a + frame * 0.8})`} />
      ))}
      <circle r={9} fill={color} />
    </svg>
  );
}

export function QuantumScene({ t, at }: SceneProps) {
  const frame = useCurrentFrame();
  const second = at("pqc", 0);
  const toShield = ease(frame, second, second + 20, Easing.inOut(Easing.cubic));
  const beam = at("pqc", 0.45);
  const beamP = ease(frame, beam, beam + 12);
  const deflect = ease(frame, beam + 12, beam + 30);
  const decrypt = ease(frame, at("harvest", 0.6), at("harvest", 0.8));
  return (
    <AbsoluteFill>
      <Place x={960} y={170}>
        <div style={{ position: "relative", width: 1700, height: 110 }}>
          <div style={{ position: "absolute", inset: 0, opacity: 1 - toShield }}>
            <Headline text={t.quantum.title} from={at("harvest", 0.02)} size={80} width={1700} align="center" accent={[]} accentColor={RED} />
          </div>
          <div style={{ position: "absolute", inset: 0, opacity: toShield }}>
            <Headline text={t.quantum.pqc} from={second + 6} size={80} width={1700} align="center" accent={[]} color={TEAL} />
          </div>
        </div>
      </Place>
      {/* harvest: encrypted traffic siphoned into the attacker's store */}
      <AbsoluteFill style={{ opacity: 1 - toShield }}>
        {Array.from({ length: 16 }, (_, i) => {
          const s = at("harvest", 0) + i * 7;
          return (
            <Travel key={i} from={[160, 520 + (i % 4) * 60 - 60]} to={[1330, 600]} start={s} end={s + 50} arc={60 + (i % 3) * 40}>
              <div style={{ width: 76, height: 76, borderRadius: 18, background: decrypt > 0.5 ? "#3a1420" : "#132a33", border: `2px solid ${decrypt > 0.5 ? RED : MIST}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <LockIcon size={36} color={decrypt > 0.5 ? RED : MIST} />
              </div>
            </Travel>
          );
        })}
        <Pop x={1420} y={620} from={at("harvest", 0.05)}>
          <Database size={190} tint={decrypt} />
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 24, fontWeight: 700, color: MIST }}>{t.quantum.stored}</div>
        </Pop>
        <Pop x={1640} y={480} from={at("harvest", 0.1)}>
          <Hacker size={130} />
        </Pop>
        <Pop x={1640} y={800} from={at("harvest", 0.55)}>
          <Atom size={150} />
        </Pop>
        <Place x={1640} y={930} style={{ opacity: ease(frame, at("harvest", 0.6), at("harvest", 0.7)) }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 40, color: RED, letterSpacing: 3 }}>20XX</div>
        </Place>
      </AbsoluteFill>
      {/* the hybrid shield: two layers, the quantum beam glancing off */}
      <AbsoluteFill style={{ opacity: toShield }}>
        <Place x={1000} y={610}>
          <div style={{ position: "relative", width: 420, height: 490, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", transform: `scale(${0.6 + usePop(second + 8) * 0.4})` }}>
              <Shield size={420} color={TEAL} fill={0.1} />
            </div>
            <div style={{ position: "absolute", transform: `scale(${0.5 + usePop(second + 16) * 0.5})` }}>
              <Shield size={280} color={MIST} fill={0.14}>
                <LockIcon size={90} color={INK} />
              </Shield>
            </div>
          </div>
        </Place>
        <Place x={1360} y={420} style={{ opacity: ease(frame, second + 26, second + 40) }}>
          <Chip color={TEAL} size={26}>
            {t.quantum.post}
          </Chip>
        </Place>
        <Place x={1330} y={520} style={{ opacity: ease(frame, second + 32, second + 46) }}>
          <Chip color={MIST} size={26}>
            {t.quantum.classic}
          </Chip>
        </Place>
        <Pop x={300} y={600} from={second + 10}>
          <Atom size={150} />
        </Pop>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          <line x1={360} y1={600} x2={360 + (420 * beamP)} y2={600} stroke={RED} strokeWidth={8} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 14px ${RED})` }} opacity={1 - deflect} />
          {[-1, 0, 1].map((k) => (
            <line key={k} x1={790} y1={600} x2={790 - 220 * deflect} y2={600 + k * 160 * deflect - 60 * deflect} stroke={RED} strokeWidth={5} strokeLinecap="round" opacity={deflect * (1 - ease(frame, beam + 34, beam + 50))} />
          ))}
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── Frugal, then sovereign ────────────────────────────────────────────────

export function FrugalScene({ t, at }: SceneProps) {
  const frame = useCurrentFrame();
  const rowAt = [0.2, 0.32, 0.5].map((k) => at("frugal", k));
  const stars = ease(frame, at("sovereign", 0.05), at("sovereign", 0.35), Easing.inOut(Easing.cubic));
  return (
    <AbsoluteFill>
      <Place x={110} y={200} style={{ transform: "translate(0, -50%)" }}>
        <Headline text={t.frugal.title} from={at("frugal", 0.02)} size={84} width={1200} accent={[]} />
      </Place>
      <div style={{ position: "absolute", left: 140, top: 330, width: 950 }}>
        <div style={{ display: "flex", gap: 30, marginBottom: 26, marginLeft: 280, fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", opacity: ease(frame, rowAt[0] - 10, rowAt[0]) }}>
          <span style={{ color: RED }}>■ {t.frugal.centralized}</span>
          <span style={{ color: TEAL }}>■ VaultysClaw</span>
        </div>
        {t.frugal.metrics.map((m, i) => {
          const p = ease(frame, rowAt[i], rowAt[i] + 26, Easing.out(Easing.cubic));
          return (
            <div key={m} style={{ display: "flex", alignItems: "center", gap: 30, marginBottom: 44, opacity: ease(frame, rowAt[i] - 6, rowAt[i] + 4) }}>
              <div style={{ width: 250, fontSize: 32, fontWeight: 700, color: INK }}>{m}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 560 * p, height: 30, borderRadius: 8, background: `linear-gradient(90deg, ${RED}aa, ${RED})` }} />
                  <span style={{ fontFamily: DISPLAY, fontSize: 30, color: RED }}>{t.frugal.high}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 110 * p, height: 30, borderRadius: 8, background: `linear-gradient(90deg, ${TEAL}aa, ${TEAL})`, boxShadow: `0 0 20px ${TEAL}55` }} />
                  <span style={{ fontFamily: DISPLAY, fontSize: 30, color: TEAL }}>{t.frugal.low}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* sovereign and European: the ring of stars, around the lock-free mark */}
      <Place x={1480} y={540} style={{ opacity: stars }}>
        <div style={{ position: "relative", width: 520, height: 520 }}>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
            const s = ease(frame, at("sovereign", 0.05) + i * 2, at("sovereign", 0.05) + i * 2 + 12);
            return (
              <div key={i} style={{ position: "absolute", left: 260 + Math.cos(a) * 220 - 22, top: 260 + Math.sin(a) * 220 - 22, transform: `scale(${s}) rotate(${frame}deg)` }}>
                <svg width={44} height={44} viewBox="-10 -10 20 20">
                  <path d="M0 -9 L2.6 -2.8 L9 -2.8 L3.8 1.2 L5.6 7.6 L0 3.8 L-5.6 7.6 L-3.8 1.2 L-9 -2.8 L-2.6 -2.8 Z" fill={GOLD} />
                </svg>
              </div>
            );
          })}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 54, color: INK, letterSpacing: 2, textTransform: "uppercase", width: 300, lineHeight: 1.05 }}>{t.frugal.sovereign}</div>
            <div style={{ marginTop: 14, fontSize: 24, fontWeight: 700, color: GOLD }}>{t.frugal.noLock}</div>
          </div>
        </div>
      </Place>
      <div style={{ position: "absolute", left: 0, right: 0, top: 940, display: "flex", justifyContent: "center", gap: 22 }}>
        {t.frugal.pills.map((p, i) => (
          <div key={p} style={{ opacity: ease(frame, at("sovereign", 0.3) + i * 5, at("sovereign", 0.3) + i * 5 + 12), transform: `translateY(${(1 - ease(frame, at("sovereign", 0.3) + i * 5, at("sovereign", 0.3) + i * 5 + 12)) * 30}px)` }}>
            <Chip color={i % 2 ? MIST : TEAL} size={26}>
              {p}
            </Chip>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

// ── The twelve domains of agent security ──────────────────────────────────

const STATUS: ("on" | "partial" | "next")[] = ["on", "on", "on", "on", "on", "on", "on", "partial", "partial", "partial", "partial", "next"];
const STATUS_COLOR = { on: "#1f7a5c", partial: "#8a5d12", next: "#2a5868" };
const STATUS_EDGE = { on: TEAL, partial: AMBER, next: MIST };

export function DomainsScene({ t, at }: SceneProps) {
  const frame = useCurrentFrame();
  const count = Math.round(interpolate(frame, [at("domains", 0.2), at("domains", 0.45)], [0, 7], CLAMP));
  return (
    <AbsoluteFill>
      <Place x={110} y={190} style={{ transform: "translate(0, -50%)" }}>
        <Headline text={t.domains.title} from={at("domains", 0)} size={72} width={1300} accent={[]} />
        <div style={{ marginTop: 10, fontSize: 24, fontWeight: 600, color: MIST_DIM, opacity: ease(frame, at("domains", 0.1), at("domains", 0.2)) }}>{t.domains.source}</div>
      </Place>
      <Place x={1690} y={200}>
        <div style={{ display: "flex", alignItems: "baseline", fontFamily: DISPLAY, color: TEAL, opacity: ease(frame, at("domains", 0.18), at("domains", 0.25)) }}>
          <span style={{ fontSize: 170 }}>{count}</span>
          <span style={{ fontSize: 80, color: MIST_DIM }}>/12</span>
        </div>
      </Place>
      <div style={{ position: "absolute", left: 160, top: 360, width: 1600, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, perspective: 1600 }}>
        {t.domains.names.map((name, i) => {
          const s = STATUS[i];
          const from = at("domains", 0.08) + i * 4;
          const flip = ease(frame, from, from + 18, Easing.out(Easing.back(1.4)));
          const lit = s === "on" ? ease(frame, at("domains", 0.2) + i * 3, at("domains", 0.2) + i * 3 + 8) : s === "partial" ? ease(frame, at("domains", 0.55), at("domains", 0.65)) : ease(frame, at("domains", 0.8), at("domains", 0.9));
          return (
            <div
              key={name}
              style={{
                height: 150,
                borderRadius: 18,
                padding: "20px 24px",
                background: lit > 0.5 ? STATUS_COLOR[s] : "rgba(255,255,255,0.06)",
                border: `2px solid ${lit > 0.5 ? STATUS_EDGE[s] : "rgba(255,255,255,0.12)"}`,
                boxShadow: lit > 0.5 && s === "on" ? `0 0 40px ${TEAL}33` : "none",
                transform: `rotateX(${(1 - flip) * 90}deg)`,
                opacity: flip,
              }}
            >
              <div style={{ fontFamily: DISPLAY, fontSize: 40, color: lit > 0.5 ? INK : MIST_DIM }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{ fontSize: 25, fontWeight: 700, color: INK, lineHeight: 1.2 }}>{name}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 160, top: 900, display: "flex", gap: 40, fontSize: 24, fontWeight: 700, opacity: ease(frame, at("domains", 0.6), at("domains", 0.75)) }}>
        {(["on", "partial", "next"] as const).map((s, i) => (
          <span key={s} style={{ color: STATUS_EDGE[s] }}>
            ■ {[7, 4, 1][i]} {t.domains.legend[i]}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
}

// ── Closing ───────────────────────────────────────────────────────────────

export function ClosingScene({ t, at, logo }: SceneProps) {
  const frame = useCurrentFrame();
  const ring = ease(frame, at("closing", 0), at("closing", 0.3));
  return (
    <AbsoluteFill>
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2 + frame / 200;
        return (
          <Place key={i} x={960 + Math.cos(a) * 830 * (0.6 + 0.4 * ring)} y={540 + Math.sin(a) * 420 * (0.6 + 0.4 * ring)} style={{ opacity: ring * 0.6 }}>
            <Bot size={60} state="ok" glow={0.4} />
          </Place>
        );
      })}
      <Place x={960} y={440}>
        <Wordmark logo={logo} height={170} from={at("closing", 0)} />
      </Place>
      <Place x={960} y={720}>
        <Headline text={t.closing.title} from={at("closing", 0.3)} size={96} align="center" width={1600} accent={t.closing.accent} />
      </Place>
      <Place x={960} y={880}>
        <Rise from={at("closing", 0.6)}>
          <Chip color={MIST} size={30} icon={<GitIcon />}>
            {t.closing.repo}
          </Chip>
        </Rise>
      </Place>
    </AbsoluteFill>
  );
}

function GitIcon() {
  return (
    <svg width={30} height={30} viewBox="0 0 64 64">
      <circle cx={20} cy={14} r={7} fill="none" stroke={INK} strokeWidth={5} />
      <circle cx={20} cy={50} r={7} fill="none" stroke={INK} strokeWidth={5} />
      <circle cx={46} cy={26} r={7} fill="none" stroke={INK} strokeWidth={5} />
      <path d="M20 21 V43 M46 33 C46 42 30 40 22 45" stroke={INK} strokeWidth={5} fill="none" />
    </svg>
  );
}

