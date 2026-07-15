"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import {
  adminApi,
  unwrap,
  ApiError,
} from "@/lib/api/ts-rest/client";
import type { AuditEntryDetail, AuditCertInfo } from "@/lib/contracts";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { AuditEntryHeader } from "@/components/governance/AuditEntryHeader";
import { AuditPayloadPanel } from "@/components/governance/AuditPayloadPanel";
import { AuditCertificatePanel } from "@/components/governance/AuditCertificatePanel";
import { useIntentSignatureVerification } from "@/components/governance/useIntentSignatureVerification";

export default function AuditDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = decodeURIComponent(params.id as string);

  const [entry, setEntry] = useState<AuditEntryDetail | null>(null);
  const [certInfo, setCertInfo] = useState<AuditCertInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { sigState, sigHash } = useIntentSignatureVerification(entry, certInfo);

  useBreadcrumbs(
    [{ label: "Governance", href: "/admin/governance" }, { label: "Audit entry" }],
    []
  );

  useToolbar(
    {
      title: "Audit entry",
      description: id,
      actions: [
        {
          kind: "button",
          id: "back",
          label: "Audit Log",
          icon: <ChevronLeft className="w-3.5 h-3.5" />,
          onClick: () => router.push("/admin/governance"),
        },
      ],
    },
    [id, router]
  );

  useEffect(() => {
    (async () => {
      try {
        const data = unwrap(
          await adminApi.governance.auditEntry({ params: { id } })
        );
        setEntry(data.entry);
        setCertInfo(data.certInfo ?? null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          setError("Entry not found");
        } else {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 w-full max-w-4xl mx-auto flex items-center gap-2 text-foreground-500">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="p-6 w-full max-w-7xl mx-auto space-y-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-primary-500 hover:text-primary-400"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="bg-danger-500/10 border border-danger-500/20 rounded-lg px-4 py-3 text-danger-600 text-sm">
          {error ?? "Entry not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-6">
      <AuditEntryHeader
        entry={entry}
        onOpenAgent={(did) =>
          router.push(`/admin/agents/${encodeURIComponent(did)}`)
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AuditPayloadPanel entry={entry} />
        <AuditCertificatePanel
          entry={entry}
          certInfo={certInfo}
          sigState={sigState}
          sigHash={sigHash}
        />
      </div>
    </div>
  );
}
