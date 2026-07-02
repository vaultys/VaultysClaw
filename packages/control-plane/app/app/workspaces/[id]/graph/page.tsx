"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Globe2, Maximize2, Minimize2 } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { GraphNode } from "@vaultysclaw/shared";

const WorkspaceGraph = dynamic(() => import("@/components/graph/WorkspaceGraph"), {
  ssr: false,
});

export default function WorkspaceGraphPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    fetch(`/api/workspaces/${id}`)
      .then((r) => r.json())
      .then((d) => setWorkspaceName(d.workspace?.name ?? id));
  }, [id]);

  function handleNodeClick(node: GraphNode) {
    if (node.type === "agent") {
      const did = node.id.replace("agent:", "");
      router.push(`/admin/agents/${encodeURIComponent(did)}`);
    } else if (node.type === "user") {
      const did = node.id.replace("user:", "");
      router.push(`/admin/users/${encodeURIComponent(did)}`);
    } else if (node.type === "workspace") {
      const rid = node.id.replace("workspace:", "");
      router.push(`/app/workspaces/${rid}`);
    }
  }

  return (
    <div
      className={`${fullscreen ? "fixed inset-0 z-50 bg-[var(--background-50)]" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-4 pt-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/app/workspaces/${id}`}
            className="p-2 rounded-lg hover:bg-[var(--background-200)] transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <Globe2 size={20} className="text-primary-400" />
          <h1 className="text-xl font-bold">{workspaceName} — Graph</h1>
        </div>
        <button
          onClick={() => setFullscreen((f) => !f)}
          className="p-2 rounded-lg hover:bg-[var(--background-200)] transition-colors"
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      {/* Graph */}
      <div className="px-4 pb-4">
        <WorkspaceGraph
          query={`?workspace=${id}`}
          height={fullscreen ? window.innerHeight - 80 : 650}
          onNodeClick={handleNodeClick}
        />
      </div>
    </div>
  );
}
