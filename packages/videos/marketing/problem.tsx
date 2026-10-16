import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Bot, CLAMP, Database, DISPLAY, ease, FONT, Hacker, Headline, INK, LAV, LAV_DIM, Link, Person, Place, Pop, rand, RED, Rise, TEAL, Travel } from "../explainer/kit";
import type { SceneProps } from "./types";

/** The problem: agents everywhere, nobody knows what they do, and one directory holds the keys. */

// ── Hook: one employee, then dozens of agents around them, then a whole company of it ──

const RINGS = [
  { r: 240, n: 8 },
  { r: 400, n: 14 },
];

function Swarm({ count, spin, packets }: { count: number; spin: number; packets: boolean }) {
  const frame = useCurrentFrame();
  let k = 0;
  return (
    <>
      {RINGS.flatMap(({ r, n }, ring) =>
        Array.from({ length: n }, (_, i) => {
          const index = k++;
          if (index >= count) return null;
          const angle = (i / n) * Math.PI * 2 + spin * (ring ? -1 : 1) + ring * 0.2;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r * 0.82;
          const p = Math.min(1, (count - index) / 1.5);
          // An operation going out and back along the spoke.
          const q = ((frame + index * 11) % 40) / 40;
          return (
            <React.Fragment key={`${ring}-${i}`}>
              {packets && (
                <div style={{ position: "absolute", left: x * q - 4, top: y * q - 4, width: 8, height: 8, borderRadius: 4, background: ring ? LAV : TEAL, opacity: 0.8 * p * Math.sin(Math.PI * q), boxShadow: `0 0 10px ${TEAL}` }} />
              )}
              <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -50%) scale(${0.5 + 0.5 * p})`, opacity: p }}>
                <Bot size={ring ? 70 : 80} color={ring ? LAV_DIM : LAV} />
              </div>
            </React.Fragment>
          );
        }),
      )}
    </>
  );
}

function Cluster({ x, y, count, spin, packets = true, personSize = 150 }: { x: number; y: number; count: number; spin: number; packets?: boolean; personSize?: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y }}>
      <Swarm count={count} spin={spin} packets={packets} />
      <div style={{ position: "absolute", left: 0, top: 0, transform: "translate(-50%, -50%)" }}>
        <Person size={personSize} color={INK} />
      </div>
    </div>
  );
}

export function HookScene({ t, at }: SceneProps) {
  const frame = useCurrentFrame();
  const total = RINGS.reduce((s, r) => s + r.n, 0);
  const count = interpolate(frame, [at("hook1", 0.05), at("hook1", 0.9)], [0, total], { ...CLAMP, easing: Easing.inOut(Easing.quad) });
  const spin = frame / 260;
  const zoom = ease(frame, at("hook2", 0.05), at("hook2", 0.6), Easing.inOut(Easing.cubic));
  const scale = 1 - zoom * 0.76;
  const ops = Math.round(interpolate(frame, [at("hook1", 0), at("hook2", 1)], [0, 48_720], { ...CLAMP, easing: Easing.out(Easing.quad) }));
  const headOut = ease(frame, at("hook2", 0), at("hook2", 0.15));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: "960px 600px" }}>
        <Cluster x={960} y={600} count={count} spin={spin} />
        {/* The rest of the company, outside the frame until the camera pulls back. */}
        {zoom > 0 &&
          [-2, -1, 0, 1, 2].flatMap((cx) =>
            [-1, 0, 1].map((cy) =>
              cx === 0 && cy === 0 ? null : (
                <div key={`${cx}${cy}`} style={{ opacity: ease(frame, at("hook2", 0.2) + (Math.abs(cx) + Math.abs(cy)) * 5, at("hook2", 0.45) + (Math.abs(cx) + Math.abs(cy)) * 5) }}>
                  <Cluster x={960 + cx * 980} y={600 + cy * 860} count={total * (0.6 + 0.4 * rand(cx * 7 + cy))} spin={spin + cx} packets={false} />
                </div>
              ),
            ),
          )}
      </AbsoluteFill>
      <Place x={960} y={180} style={{ opacity: 1 - headOut }}>
        <Headline text={t.hook.title} from={at("hook1", 0.05)} size={84} align="center" width={1600} />
      </Place>
      <Place x={960} y={285} style={{ opacity: ease(frame, at("hook1", 0.3), at("hook1", 0.45)) * (1 - headOut) }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18, fontFamily: FONT }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 64, color: TEAL, fontVariantNumeric: "tabular-nums", letterSpacing: 2 }}>{ops.toLocaleString("fr-FR")}</span>
          <span style={{ fontSize: 26, fontWeight: 600, color: LAV }}>{t.hook.ops}</span>
        </div>
      </Place>
      <Place x={960} y={930}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 22, opacity: ease(frame, at("hook2", 0.4), at("hook2", 0.6)) }}>
          <Headline text={t.hook.fleet} from={at("hook2", 0.4)} size={76} align="center" width={1500} accent={t.hook.fleet.split(" ").filter((w) => /\d/.test(w))} />
        </div>
        <div style={{ textAlign: "center", marginTop: 6, fontSize: 24, fontWeight: 600, color: LAV_DIM, letterSpacing: 4, textTransform: "uppercase", opacity: ease(frame, at("hook2", 0.7), at("hook2", 0.85)) }}>{t.hook.fleetNote}</div>
      </Place>
    </AbsoluteFill>
  );
}

// ── The three questions, then Shadow AI ───────────────────────────────────

function PinIcon() {
  return (
    <svg width={70} height={70} viewBox="0 0 64 64">
      <path d="M32 6 C21 6 13 14 13 25 C13 39 32 58 32 58 C32 58 51 39 51 25 C51 14 43 6 32 6 Z" fill="none" stroke={TEAL} strokeWidth={4.5} />
      <circle cx={32} cy={25} r={7} fill={TEAL} />
    </svg>
  );
}
function NetIcon() {
  return (
    <svg width={70} height={70} viewBox="0 0 64 64">
      {[
        [32, 12],
        [12, 46],
        [52, 46],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={7} fill="none" stroke={TEAL} strokeWidth={4.5} />
      ))}
      <path d="M28 18 L16 40 M36 18 L48 40 M19 46 H45" stroke={TEAL} strokeWidth={4} strokeLinecap="round" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width={70} height={70} viewBox="0 0 64 64">
      <circle cx={32} cy={32} r={10} fill="none" stroke={TEAL} strokeWidth={4.5} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <line key={i} x1={32 + Math.cos(a) * 16} y1={32 + Math.sin(a) * 16} x2={32 + Math.cos(a) * 25} y2={32 + Math.sin(a) * 25} stroke={TEAL} strokeWidth={6} strokeLinecap="round" />;
      })}
    </svg>
  );
}

export function QuestionsScene({ t, at }: SceneProps) {
  const frame = useCurrentFrame();
  const shadow = ease(frame, at("shadow", 0.05), at("shadow", 0.4));
  const icons = [<PinIcon key="p" />, <NetIcon key="n" />, <GearIcon key="g" />];
  const when = [0.08, 0.35, 0.62];
  return (
    <AbsoluteFill>
      {/* the agents nobody inventoried, coming out of the dark */}
      <AbsoluteFill style={{ opacity: shadow }}>
        <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 55%, rgba(8,4,12,0.2), rgba(8,4,12,0.9) 75%)" }} />
        {Array.from({ length: 34 }, (_, i) => {
          const x = 120 + rand(i * 3) * 1680;
          const y = 160 + rand(i * 5 + 1) * 820;
          if (Math.abs(x - 960) < 420 && Math.abs(y - 540) < 150) return null;
          const appear = ease(frame, at("shadow", 0.05) + rand(i) * 30, at("shadow", 0.05) + rand(i) * 30 + 14);
          const bob = Math.sin((frame + i * 13) / 18) * 6;
          return (
            <Place key={i} x={x} y={y + bob} style={{ opacity: appear * (0.45 + rand(i + 11) * 0.55) }}>
              <Bot size={44 + rand(i + 4) * 40} state="shadow" />
              {i % 3 === 0 && <div style={{ position: "absolute", top: -26, right: -14, fontFamily: DISPLAY, fontSize: 34, color: RED, opacity: 0.8 }}>?</div>}
            </Place>
          );
        })}
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 360, display: "flex", justifyContent: "center", gap: 46, opacity: 1 - shadow, transform: `translateY(${-shadow * 60}px) scale(${1 - shadow * 0.08})` }}>
        {t.questions.cards.map((q, i) => (
          <Card key={q} from={at("questions", when[i])} icon={icons[i]} n={i + 1} text={q} />
        ))}
      </div>
      <Place x={960} y={540} style={{ opacity: shadow }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 210, color: INK, letterSpacing: 6, textTransform: "uppercase", textShadow: `0 0 60px ${RED}88`, transform: `translateX(${Math.sin(frame * 1.7) * (frame % 23 < 2 ? 8 : 0)}px)` }}>{t.questions.shadow}</div>
      </Place>
    </AbsoluteFill>
  );
}

function Card({ from, icon, n, text }: { from: number; icon: React.ReactNode; n: number; text: string }) {
  const frame = useCurrentFrame();
  const p = ease(frame, from, from + 18);
  return (
    <div
      style={{
        width: 470,
        height: 330,
        borderRadius: 28,
        padding: "40px 38px",
        background: "linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))",
        border: "1px solid rgba(255,255,255,0.16)",
        boxShadow: "0 40px 80px rgba(0,0,0,0.35)",
        backdropFilter: "blur(6px)",
        opacity: p,
        transform: `translateY(${(1 - p) * 60}px) rotateX(${(1 - p) * 30}deg)`,
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {icon}
        <span style={{ fontFamily: DISPLAY, fontSize: 80, color: "rgba(201,184,236,0.35)" }}>0{n}</span>
      </div>
      <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 700, lineHeight: 1.2, color: INK }}>{text}</div>
    </div>
  );
}

// ── The central directory, struck, and the attack spreading ──────────────

const SPOKES = 12;
const spoke = (i: number): [number, number] => {
  const a = (i / SPOKES) * Math.PI * 2 - Math.PI / 2;
  return [1040 + Math.cos(a) * 400, 600 + Math.sin(a) * 300];
};

export function CentralScene({ t, at }: SceneProps) {
  const frame = useCurrentFrame();
  const hit = at("spread", 0.12);
  const struck = ease(frame, hit, hit + 8);
  const aim = ease(frame, at("central", 0.55), at("central", 0.8));
  return (
    <AbsoluteFill>
      <Place x={960} y={190}>
        <Headline text={t.central.title} from={at("central", 0.02)} size={80} align="center" width={1700} accent={[]} />
      </Place>
      {Array.from({ length: SPOKES }, (_, i) => {
        const reach = hit + 10 + i * 3;
        const red = ease(frame, reach, reach + 10);
        return <Link key={i} a={[1040, 600]} b={spoke(i)} from={at("central", 0.1) + i} color={red > 0.5 ? RED : "rgba(201,184,236,0.35)"} width={red > 0.5 ? 4 : 2.5} glow={red > 0.5} />;
      })}
      {Array.from({ length: SPOKES }, (_, i) => {
        const reach = hit + 22 + i * 3;
        const [x, y] = spoke(i);
        return (
          <Pop key={i} x={x} y={y} from={at("central", 0.1) + i * 2}>
            <Bot size={76} state={frame > reach ? "danger" : "neutral"} glow={frame > reach ? 1 : 0} />
          </Pop>
        );
      })}
      <Pop x={1040} y={600} from={at("central", 0)}>
        <Database size={210} tint={struck} shake={struck * (1 - ease(frame, hit + 30, hit + 60))} />
        <div style={{ textAlign: "center", marginTop: 10, fontFamily: FONT, fontSize: 26, fontWeight: 700, color: struck ? RED : LAV }}>{t.central.directory}</div>
      </Pop>
      {/* the crosshair on the directory */}
      <Place x={1040} y={590} style={{ opacity: aim * (1 - struck) }}>
        <svg width={360} height={360} viewBox="-180 -180 360 360" style={{ transform: `rotate(${frame * 1.2}deg) scale(${1.4 - aim * 0.4})` }}>
          <circle r={150} fill="none" stroke={RED} strokeWidth={3} strokeDasharray="30 18" />
          <circle r={110} fill="none" stroke={RED} strokeWidth={2} opacity={0.6} />
          {[0, 90, 180, 270].map((a) => (
            <line key={a} x1={0} y1={-175} x2={0} y2={-125} stroke={RED} strokeWidth={4} transform={`rotate(${a})`} />
          ))}
        </svg>
      </Place>
      <Pop x={260} y={620} from={at("central", 0.6)}>
        <Hacker size={170} />
      </Pop>
      <Travel from={[320, 610]} to={[1000, 590]} start={at("spread", 0)} end={hit}>
        <div style={{ width: 90, height: 8, borderRadius: 4, background: `linear-gradient(90deg, transparent, ${RED})`, boxShadow: `0 0 24px ${RED}` }} />
      </Travel>
      <Place x={960} y={985}>
        <Rise from={at("spread", 0.45)}>
          <div style={{ fontFamily: DISPLAY, fontSize: 64, letterSpacing: 4, color: RED, textTransform: "uppercase" }}>{t.central.spread}</div>
        </Rise>
      </Place>
    </AbsoluteFill>
  );
}
