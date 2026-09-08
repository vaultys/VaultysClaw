"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Clock3,
  Search,
  Users,
  X,
  Zap,
} from "lucide-react";
import { ActorKindBadge } from "@/components/ActorKindBadge";
import { encodeDidParam } from "@/lib/actor-route";
import { categoryForKind } from "@/lib/actor-kinds";
import { cn } from "@/lib/utils";

export interface ActorDirectoryRow {
  did: string;
  name: string;
  kind: string;
  registeredAt: string;
}

const MAX_VISIBLE_ROWS_PER_SECTION = 120;
const MAX_QUICK_RESULTS = 12;
type ActorTab = "pending" | "agents" | "humans";

function searchableText(actor: ActorDirectoryRow): string {
  return [actor.name, actor.kind, actor.did].join(" ").toLowerCase();
}

function shortDid(did: string): string {
  if (did.length <= 32) return did;
  return `${did.slice(0, 18)}...${did.slice(-10)}`;
}

export default function ActorDirectoryPanel({
  actors,
  initialTab,
  pendingCount = 0,
  pendingPanel,
}: {
  actors: ActorDirectoryRow[];
  initialTab?: ActorTab;
  pendingCount?: number;
  pendingPanel?: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActorTab>(
    initialTab ?? (pendingCount > 0 ? "pending" : "agents")
  );
  const [query, setQuery] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const humanActors = useMemo(
    () => actors.filter((actor) => categoryForKind(actor.kind) === "human"),
    [actors]
  );
  const agentActors = useMemo(
    () => actors.filter((actor) => categoryForKind(actor.kind) !== "human"),
    [actors]
  );

  const tabActors = activeTab === "humans" ? humanActors : agentActors;
  const filteredActors = useMemo(() => {
    if (activeTab === "pending") return [];
    const needle = query.trim().toLowerCase();
    return needle
      ? tabActors.filter((actor) => searchableText(actor).includes(needle))
      : tabActors;
  }, [activeTab, query, tabActors]);

  const quickResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return actors
      .filter((actor) => searchableText(actor).includes(needle))
      .slice(0, MAX_QUICK_RESULTS);
  }, [actors, query]);

  const activeTitle = activeTab === "humans" ? "Humans" : "Agents & Devices";
  const visibleRows = filteredActors.slice(0, MAX_VISIBLE_ROWS_PER_SECTION);
  const hiddenCount = filteredActors.length - visibleRows.length;
  const tabs = [
    ...(pendingPanel
      ? [
          {
            id: "pending" as const,
            label: "Pending",
            count: pendingCount,
            icon: Clock3,
            description: "Registrations waiting for approval or delivery",
          },
        ]
      : []),
    {
      id: "agents" as const,
      label: "Agents & Devices",
      count: agentActors.length,
      icon: Zap,
      description: "Services, sensors, and pending registrations",
    },
    {
      id: "humans" as const,
      label: "Humans",
      count: humanActors.length,
      icon: Users,
      description: "People with console or app identities",
    },
  ];

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-neutral-200/60 bg-background-100 p-4">
        <div className="relative">
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Search actors
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-background px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-foreground-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setQuickOpen(true);
              }}
              onFocus={() => setQuickOpen(true)}
              placeholder="Search by name, kind, or DID..."
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setQuickOpen(false);
                }}
                aria-label="Clear actor search"
                className="rounded p-0.5 text-foreground-400 transition-colors hover:bg-background-200 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {quickOpen && quickResults.length > 0 && (
            <div
              onMouseLeave={() => setQuickOpen(false)}
              className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-neutral-200 bg-background-100 shadow-2xl shadow-black/20"
            >
              <div className="border-b border-neutral-200/60 px-3 py-2 text-xs font-medium uppercase tracking-wider text-foreground-500">
                Quick jump
              </div>
              <div className="max-h-80 overflow-y-auto py-1">
                {quickResults.map((actor) => (
                  <Link
                    key={actor.did}
                    href={`/admin/actors/${encodeDidParam(actor.did)}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-background-200/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {actor.name}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-xs text-foreground-500">
                        {shortDid(actor.did)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <ActorKindBadge kind={actor.kind} />
                      <ArrowRight className="h-3.5 w-3.5 text-foreground-400" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-b border-neutral-200/60">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setQuickOpen(false);
                  router.replace(`${pathname}?tab=${tab.id}`, { scroll: false });
                }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-max items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary-600 text-primary-700"
                    : "border-transparent text-foreground-500 hover:border-neutral-300 hover:text-foreground"
                )}
                title={tab.description}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs",
                    active
                      ? "border-primary-200 bg-primary-50 text-primary-700"
                      : "border-neutral-200 bg-background-100 text-foreground-500"
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "pending" ? (
        pendingPanel
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-500">
            <span>
              Showing {filteredActors.length} of {tabActors.length}{" "}
              {activeTitle.toLowerCase()}
            </span>
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setQuickOpen(false);
                }}
                className="font-medium text-primary-600 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground-700">
              {activeTitle} ({filteredActors.length})
            </h2>
            <div className="overflow-x-auto rounded-xl border border-neutral-200/60">
              <table className="w-full bg-background-100 text-sm">
                <thead className="bg-background-200/40 text-left text-xs uppercase text-foreground-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Kind</th>
                    <th className="px-4 py-2 font-medium">DID</th>
                    <th className="px-4 py-2 font-medium">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((actor) => (
                    <tr
                      key={actor.did}
                      className="border-t border-neutral-200/60 hover:bg-background-200/30"
                    >
                      <td className="px-4 py-2.5 text-foreground">
                        <Link
                          href={`/admin/actors/${encodeDidParam(actor.did)}`}
                          className="hover:text-primary-600 hover:underline"
                        >
                          {actor.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <ActorKindBadge kind={actor.kind} />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground-500">
                        <Link
                          href={`/admin/actors/${encodeDidParam(actor.did)}`}
                          className="hover:text-primary-600 hover:underline"
                        >
                          {actor.did}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-foreground-500">
                        {actor.registeredAt}
                      </td>
                    </tr>
                  ))}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-foreground-400"
                      >
                        No actors match this search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {hiddenCount > 0 && (
              <p className="mt-2 text-xs text-foreground-500">
                {hiddenCount} more {activeTitle.toLowerCase()} hidden. Refine
                the search to narrow the list.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
