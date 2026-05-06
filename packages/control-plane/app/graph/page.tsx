"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Network, Maximize2, Minimize2 } from "lucide-react";
import dynamic from "next/dynamic";
import type { GraphNode } from "@vaultysclaw/shared";

const RealmGraph = dynamic(() => import("@/components/graph/RealmGraph"), { ssr: false });

export default function FullGraphPage() {
  const router = useRouter();
  const [fullscreen, setFullscreen] = useState(false);

  function handleNodeClick(node: GraphNode) {
    if (node.type === "agent") {
      router.push(`/agents/${encodeURIComponent(node.id.replace("agent:", ""))}`);
    } else if (node.type === "user") {
      router.push(`/users/${encodeURIComponent(node.id.replace("user:", ""))}`);
    } else if (node.type === "realm") {
      router.push(`/realms/${node.id.replace("realm:", "")}`);
    }
  }

  return (
    <div className={`${fullscreen ? "fixed inset-0 z-50 bg-[var(--vc-bg)]" : ""}`}>
      <div className="flex items-center justify-between mb-4 px-4 pt-4">
        <div className="flex items-center gap-3">
          <Network size={20} className="text-indigo-400" />
          <h1 className="text-xl font-bold">Relationship Graph</h1>
        </div>
        <button
          onClick={() => setFullscreen((f) => !f)}
          className="p-2 rounded-lg hover:bg-[var(--vc-hover)] transition-colors"
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      <div className="px-4 pb-4">
        <RealmGraph
          height={fullscreen ? window.innerHeight - 80 : 700}
          onNodeClick={handleNodeClick}
        />
      </div>
    </div>
  );
}
