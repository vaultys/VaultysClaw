import { Bot, User, Radio, Plug } from "lucide-react";

export function MarkerIcon({ type, size = 14 }: { type: string; size?: number }) {
  const p = { size, strokeWidth: 2 };
  if (type === "openclaw") return <Bot {...p} />;
  if (type === "human") return <User {...p} />;
  if (type === "sensor") return <Radio {...p} />;
  if (type === "mcp") return <Plug {...p} />;
  return <Bot {...p} />;
}
