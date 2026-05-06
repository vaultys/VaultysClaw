"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Network, Maximize2, Minimize2 } from "lucide-react";
import dynamic from "next/dynamic";
import type { GraphNode } from "@vaultysclaw/shared";

const RealmGraph = dynamic(() => import("@/components/graph/RealmGraph"), { ssr: false });

export default function FullGraphPage() {
  const router     = useRouter();
  const [fullscreen, setFullscreen] = useState(false);
  const [winH, setWinH] = useState(700);

  useEffect(() => {
    const update = () => setWinH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  function handleNodeClick(node: GraphNode) {
    if (node.type === "agent")      router.push(`/agents/${encodeURIComponent(node.id.replace("agent:", ""))}`);
    else if (node.type === "user")  router.push(`/users/${encodeURIComponent(node.id.replace("user:", ""))}`);
    else if (node.type === "realm") router.push(`/realms/${node.id.replace("realm:", "")}`);
  }

  const graphHeight = fullscreen ? winH - 80 : 720;

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 bg-vc-bg flex flex-col" : ""}>
      <div className={`flex items-center justify-between mb-4 ${fullscreen ? "px-4 pt-4 shrink-0" : ""}`}>
        <div className="flex items-center gap-3">
          <Network size={20} className="text-indigo-400" />
          <h1 className="text-xl font-bold text-vc-text">Relationship Graph</h1>
        </div>
        <button
          onClick={() => setFullscreen((f) => !f)}
          className="p-2 rounded-lg hover:bg-vc-raised transition-colors text-vc-muted hover:text-vc-text"
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      <div className={fullscreen ? "px-4 pb-4 flex-1 min-h-0" : ""}>
        <RealmGraph
          height={graphHeight}
          defaultView="hierarchy"
          onNodeClick={handleNodeClick}
        />
      </div>
    </div>
  );
}
