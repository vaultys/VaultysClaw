"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Globe2, Maximize2, Minimize2 } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { GraphNode } from "@vaultysclaw/shared";

const RealmGraph = dynamic(() => import("@/components/graph/RealmGraph"), { ssr: false });

export default function RealmGraphPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [realmName, setRealmName] = useState<string>("");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    fetch(`/api/realms/${id}`)
      .then((r) => r.json())
      .then((d) => setRealmName(d.realm?.name ?? id));
  }, [id]);

  function handleNodeClick(node: GraphNode) {
    if (node.type === "agent") {
      const did = node.id.replace("agent:", "");
      router.push(`/agents/${encodeURIComponent(did)}`);
    } else if (node.type === "user") {
      const did = node.id.replace("user:", "");
      router.push(`/users/${encodeURIComponent(did)}`);
    } else if (node.type === "realm") {
      const rid = node.id.replace("realm:", "");
      router.push(`/realms/${rid}`);
    }
  }

  return (
    <div className={`${fullscreen ? "fixed inset-0 z-50 bg-[var(--vc-bg)]" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-4 pt-4">
        <div className="flex items-center gap-3">
          <Link href={`/realms/${id}`} className="p-2 rounded-lg hover:bg-[var(--vc-hover)] transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <Globe2 size={20} className="text-indigo-400" />
          <h1 className="text-xl font-bold">{realmName} — Graph</h1>
        </div>
        <button
          onClick={() => setFullscreen((f) => !f)}
          className="p-2 rounded-lg hover:bg-[var(--vc-hover)] transition-colors"
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      {/* Graph */}
      <div className="px-4 pb-4">
        <RealmGraph
          query={`?realm=${id}`}
          height={fullscreen ? window.innerHeight - 80 : 650}
          onNodeClick={handleNodeClick}
        />
      </div>
    </div>
  );
}
