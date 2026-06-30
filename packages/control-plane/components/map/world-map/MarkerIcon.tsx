import { Bot, Database, Server, User } from "lucide-react";
import type { MapMarker } from "./types";

export function MarkerIcon({
  type,
  size = 14,
}: {
  type: MapMarker["type"];
  size?: number;
}) {
  const p = { size, strokeWidth: 2 };
  if (type === "agent") return <Bot {...p} />;
  if (type === "user") return <User {...p} />;
  if (type === "docling") return <Server {...p} />;
  return <Database {...p} />;
}
