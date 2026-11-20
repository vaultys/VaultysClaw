"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/Badge";

export interface CertificateDirectoryRow {
  id: string;
  actorName: string;
  agentDid: string;
  capabilities: string[];
  scopeLabel: string;
  status: string;
  expiresLabel: string;
  revokedReason?: string | null;
}

const MAX_VISIBLE_ROWS = 160;

function searchableText(cert: CertificateDirectoryRow): string {
  return [
    cert.id,
    cert.actorName,
    cert.agentDid,
    cert.scopeLabel,
    cert.status,
    cert.expiresLabel,
    ...cert.capabilities,
  ].join(" ").toLowerCase();
}

export default function CertificateDirectoryPanel({
  certificates,
  revokeAction,
}: {
  certificates: CertificateDirectoryRow[];
  revokeAction: (formData: FormData) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const statuses = useMemo(
    () => Array.from(new Set(certificates.map((cert) => cert.status))).sort(),
    [certificates]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return certificates.filter((cert) => {
      if (status !== "all" && cert.status !== status) return false;
      return needle ? searchableText(cert).includes(needle) : true;
    });
  }, [certificates, query, status]);

  const visible = filtered.slice(0, MAX_VISIBLE_ROWS);
  const hiddenCount = filtered.length - visible.length;

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-neutral-200/60 bg-background-100 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Search certificates
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-background px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-foreground-400" strokeWidth={1.5} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by actor, DID, capability, scope or certificate id"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear certificate search"
                  className="rounded p-0.5 text-foreground-400 transition-colors hover:bg-background-200 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>
          <div className="md:w-56">
            <label className="block text-sm font-medium text-foreground mb-1.5">Status</label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            >
              <option value="all">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-foreground-500">
          <span>
            Showing <span className="font-mono tabular-nums">{filtered.length}</span> of{" "}
            <span className="font-mono tabular-nums">{certificates.length}</span> certificates
          </span>
          {(query || status !== "all") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
              className="font-medium text-primary-700 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
        <table className="w-full text-sm bg-background-100">
          <thead className="border-b border-neutral-200/60 text-left text-xs text-foreground-500">
            <tr>
              <th className="px-4 py-2 font-normal">Actor</th>
              <th className="px-4 py-2 font-normal">Capabilities</th>
              <th className="px-4 py-2 font-normal">Scope</th>
              <th className="px-4 py-2 font-normal">Status</th>
              <th className="px-4 py-2 font-normal">Expires</th>
              <th className="px-4 py-2 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((cert) => (
              <tr key={cert.id} className="border-t border-neutral-200/60 align-top transition-colors hover:bg-background-200/40">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/certificates/${cert.id}`}
                    className="text-foreground font-medium hover:text-primary-700 hover:underline"
                  >
                    {cert.actorName}
                  </Link>
                  <div className="text-xs text-foreground-500 font-mono">{cert.agentDid}</div>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-foreground-700">
                  {cert.capabilities.length > 0 ? cert.capabilities.join(", ") : "-"}
                </td>
                <td className="px-4 py-2.5 text-foreground-500">{cert.scopeLabel}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={statusTone(cert.status)} title={cert.revokedReason ?? undefined}>
                    {cert.status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  {cert.expiresLabel === "Never" ? (
                    <Badge tone="caution">Never</Badge>
                  ) : (
                    <span className="font-mono text-xs text-foreground-500">{cert.expiresLabel}</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {cert.status === "active" && (
                    <form action={revokeAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="certId" value={cert.id} />
                      <input
                        type="text"
                        name="reason"
                        placeholder="Reason"
                        className="w-24 rounded-lg border border-neutral-200 bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-neutral-200 bg-background-100 px-2 py-1 text-xs font-medium text-danger-700 transition-colors hover:bg-background-200"
                      >
                        Revoke
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-foreground-500">
                  No certificates match these filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 && (
        <p className="text-xs text-foreground-500">
          {hiddenCount} more certificates hidden. Refine the search to narrow the list.
        </p>
      )}
    </section>
  );
}
