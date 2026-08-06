import { Bot, User, Radio, Plug, Laptop, ShieldBan } from "lucide-react";

// Kept in sync with components/map/world-map/types.ts's TYPE_COLOR/TYPE_ONLINE_COLOR/MARKER_TYPES
// — every kind added there needs an icon here too.
export function MarkerIcon({ type, size = 14 }: { type: string; size?: number }) {
  const p = { size, strokeWidth: 2 };
  if (type === "openclaw") return <Bot {...p} />;
  if (type === "human") return <User {...p} />;
  if (type === "sensor") return <Radio {...p} />;
  if (type === "mcp") return <Plug {...p} />;
  if (type === "device") return <Laptop {...p} />;
  // ShieldBan, not a plain shield: this kind refuses traffic, and the icon should
  // read as "blocks things" rather than "is protected".
  if (type === "proxy") return <ShieldBan {...p} />;
  return <Bot {...p} />;
}
