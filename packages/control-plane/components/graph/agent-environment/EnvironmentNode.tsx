"use client";

import { Handle, NodeProps, Position } from "reactflow";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { CV, ICON_MAP, PAL, type NodeData } from "./palette";

/** Invisible source+target handle on every face, so edges can use any side. */
function FaceHandles() {
  const faces = [
    { id: "left", position: Position.Left },
    { id: "right", position: Position.Right },
    { id: "top", position: Position.Top },
    { id: "bottom", position: Position.Bottom },
  ] as const;
  return (
    <>
      {faces.map(({ id, position }) => (
        <span key={id}>
          <Handle
            id={`${id}-src`}
            type="source"
            position={position}
            style={{ opacity: 0 }}
          />
          <Handle
            id={`${id}-tgt`}
            type="target"
            position={position}
            style={{ opacity: 0 }}
          />
        </span>
      ))}
    </>
  );
}

export function EnvironmentNode({ data }: NodeProps<NodeData>) {
  const denied = data.allowed === false;
  const offline = data.offline === true;
  const palKey = denied ? "denied" : offline ? "peerOffline" : data.kind;
  const pal = PAL[palKey] ?? PAL.denied;
  const Icon = ICON_MAP[data.kind];
  const ra = data.rightAlign;

  return (
    <div
      style={{
        background: `color-mix(in srgb, ${CV.surface} 100%, transparent)`,
        backgroundColor: CV.surface,
        borderLeft: `3px solid ${pal.accent}`,
        borderTop: `1px solid ${CV.border}`,
        borderRight: `1px solid ${CV.border}`,
        borderBottom: `1px solid ${CV.border}`,
        borderRadius: "8px",
        padding: "9px 12px 9px 10px",
        minWidth: data.kind === "agent" ? "150px" : "130px",
        boxShadow: `0 2px 12px 0 ${pal.glow}`,
        fontFamily: "system-ui, sans-serif",
        opacity: offline ? 0.55 : 1,
        textAlign: ra ? "right" : "left",
        outline: `0 solid transparent`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Tinted background overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: pal.tint,
          pointerEvents: "none",
        }}
      />

      <FaceHandles />

      {/* Header row — reversed for right-aligned peer column */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          flexDirection: ra ? "row-reverse" : "row",
          gap: "6px",
          marginBottom: "3px",
        }}
      >
        {denied ? (
          <ShieldOff size={13} color={pal.accent} style={{ flexShrink: 0 }} />
        ) : (
          <Icon
            size={13}
            style={{ color: pal.accent, flexShrink: 0 } as React.CSSProperties}
          />
        )}
        <span
          style={{ fontWeight: 600, fontSize: "12px", color: CV.text, flex: 1 }}
        >
          {data.label}
        </span>
        {data.badge && (
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: "999px",
              background: pal.accent + "20",
              border: `1px solid ${pal.accent}60`,
              color: pal.accent,
              flexShrink: 0,
            }}
          >
            {data.badge}
          </span>
        )}
      </div>

      {data.sublabel && (
        <div
          style={{
            position: "relative",
            fontSize: "10px",
            color: CV.muted,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {data.sublabel}
        </div>
      )}

      {data.domains && data.domains.length > 0 && (
        <ul
          style={{
            position: "relative",
            marginTop: "3px",
            paddingLeft: 0,
            listStyle: "none",
          }}
        >
          {data.domains.slice(0, 4).map((d) => (
            <li
              key={d}
              style={{
                fontSize: "9px",
                color: pal.accent,
                fontFamily: "monospace",
              }}
            >
              · {d}
            </li>
          ))}
          {data.domains.length > 4 && (
            <li style={{ fontSize: "9px", color: CV.subtle }}>
              +{data.domains.length - 4} more
            </li>
          )}
        </ul>
      )}

      {data.docCount !== undefined && (
        <div
          style={{
            position: "relative",
            fontSize: "10px",
            color: pal.accent,
            marginTop: "2px",
          }}
        >
          {data.docCount} doc{data.docCount !== 1 ? "s" : ""}
        </div>
      )}

      {data.allowed && data.expiry !== undefined && (
        <div
          style={{
            position: "relative",
            fontSize: "9px",
            color: CV.subtle,
            marginTop: "3px",
            display: "flex",
            alignItems: "center",
            flexDirection: ra ? "row-reverse" : "row",
            gap: "3px",
          }}
        >
          <ShieldCheck size={9} color={pal.accent} />
          {data.expiry
            ? `exp ${new Date(data.expiry).toLocaleDateString()}`
            : "no expiry"}
        </div>
      )}

      {denied && (
        <div
          style={{
            position: "relative",
            fontSize: "9px",
            color: pal.accent,
            marginTop: "2px",
            fontStyle: "italic",
          }}
        >
          not granted
        </div>
      )}
    </div>
  );
}

export const nodeTypes = { env: EnvironmentNode };
