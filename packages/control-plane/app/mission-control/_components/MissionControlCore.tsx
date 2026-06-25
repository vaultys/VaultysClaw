"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAdminWS } from "@/hooks/useAdminWS";
import { useRole } from "@/hooks/useRole";
import { ActivityFeed } from "./ActivityFeed";
import { DetailModal } from "./DetailModal";
import { FleetPanel } from "./FleetPanel";
import { GaugeCards } from "./GaugeCards";
import { HeaderBar } from "./HeaderBar";
import { IntentsPanel } from "./IntentsPanel";
import { WorkflowRunsPanel } from "./WorkflowRunsPanel";
import { computeFleetMetrics } from "./metrics";
import type { DetailItem } from "./types";
import { useMissionControlChrome } from "./useMissionControlChrome";
import { useMissionControlData } from "./useMissionControlData";

const WorldMap = dynamic(
  () => import("@/components/map/WorldMap").then((m) => m.WorldMap),
  { ssr: false }
);

export interface MissionControlCoreProps {
  mode: "embedded" | "standalone";
}

export function MissionControlCore({ mode }: MissionControlCoreProps) {
  const router = useRouter();
  const isStandalone = mode === "standalone";
  const { isGlobalAdmin, isLoading } = useRole();
  const {
    agents: agentsState,
    registrations,
    connected: wsConnected,
    lastEvent,
  } = useAdminWS();

  const data = useMissionControlData(
    agentsState.agents,
    registrations,
    lastEvent
  );

  const [selectedDetail, setSelectedDetail] = useState<DetailItem | null>(null);
  const [mapHeight, setMapHeight] = useState(200);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  /* ── Auth guard ── */
  useEffect(() => {
    if (!isLoading && !isGlobalAdmin) router.replace("/");
  }, [isLoading, isGlobalAdmin, router]);

  /* ── Close modal on Escape ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedDetail(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* ── Track map container height ── */
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h && h > 0) setMapHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pendingRegs = registrations.filter(
    (r) => r.status === "pending"
  ).length;

  const metrics = computeFleetMetrics({
    agents: agentsState.agents,
    total: agentsState.total,
    online: agentsState.online,
    pendingRegs,
    tokenStats: data.tokenStats,
    workflowRuns: data.workflowRuns,
    wsConnected,
  });

  const goFullscreen = useCallback(
    () => router.push("/mission-control/fullscreen"),
    [router]
  );

  // In embedded mode this populates the shared toolbar + breadcrumb; in
  // standalone mode no provider is mounted so it harmlessly no-ops.
  useMissionControlChrome(metrics, goFullscreen);

  if (isLoading || !isGlobalAdmin) return null;

  return (
    <div
      className={`${isStandalone ? "h-screen" : "h-full"} bg-background text-foreground flex flex-col overflow-hidden`}
      style={{
        fontFamily:
          "'JetBrains Mono','Fira Code','Cascadia Code',ui-monospace,monospace",
      }}
    >
      {isStandalone && (
        <HeaderBar
          metrics={metrics}
          onExitFullscreen={() => router.push("/mission-control")}
        />
      )}

      {/* ═══ MAIN GRID ═══════════════════════════════════════════ */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[240px_1fr_260px] gap-2 p-2 overflow-hidden min-h-0">
        <FleetPanel
          agents={agentsState.agents}
          onlineAgents={metrics.onlineAgents}
          onSelectAgent={(id) => setSelectedDetail({ type: "agent", id })}
        />

        {/* CENTER: gauges → map → workflow/intent panels */}
        <div className="flex flex-col gap-2 min-h-0 overflow-hidden">
          <GaugeCards
            networkStats={data.networkStats}
            tokenStats={data.tokenStats}
            totalAgents={agentsState.total}
            dailyCost={metrics.dailyCost}
          />

          <div
            ref={mapContainerRef}
            className="h-[200px] shrink-0 relative bg-background rounded-xl overflow-hidden border border-neutral-200/60 shadow-md shadow-black/10"
          >
            {mapHeight > 0 && (
              <WorldMap
                markers={data.markers}
                height={mapHeight}
                canEditLocation={false}
              />
            )}
            {data.markers.length === 0 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                <span className="text-[10px] text-foreground-600 bg-background-100/80 px-3 py-1 rounded-full border border-neutral-200/50">
                  Set agent locations to pin them on the globe
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-2 gap-2 overflow-hidden">
            <WorkflowRunsPanel
              runs={data.workflowRuns}
              runningCount={metrics.runningWorkflows}
              onSelectRun={(id) => setSelectedDetail({ type: "workflow", id })}
            />
            <IntentsPanel
              intents={data.recentIntents}
              agents={agentsState.agents}
              onSelectIntent={(id) => setSelectedDetail({ type: "intent", id })}
            />
          </div>
        </div>

        <ActivityFeed
          feed={data.feed}
          wsConnected={wsConnected}
          onSelect={setSelectedDetail}
        />
      </div>

      {selectedDetail && (
        <DetailModal
          item={selectedDetail}
          agents={agentsState.agents}
          workflowRuns={data.workflowRuns}
          recentIntents={data.recentIntents}
          onClose={() => setSelectedDetail(null)}
        />
      )}
    </div>
  );
}
