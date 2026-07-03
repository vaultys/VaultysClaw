"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, FileText, Activity, RefreshCw } from "lucide-react";
import {
  adminApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type { GovernanceSummary } from "@/lib/contracts";
import {
  useToolbar,
  type ToolbarAction,
} from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { OverviewTab } from "@/components/governance/OverviewTab";
import { PoliciesTab } from "@/components/governance/PoliciesTab";
import { AuditTab } from "@/components/governance/AuditTab";

type Tab = "overview" | "policies" | "audit";

export default function GovernancePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [summary, setSummary] = useState<GovernanceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useBreadcrumbs([{ label: "Governance" }], []);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      setSummary(unwrap(await adminApi.governance.summary()));
    } catch {
      // keep previous summary on failure
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const actions: ToolbarAction[] = [
    {
      kind: "tabs",
      id: "tab",
      value: tab,
      onChange: (v) => setTab(v as Tab),
      options: [
        {
          value: "overview",
          label: "Overview",
          icon: <ShieldCheck className="w-3.5 h-3.5" />,
        },
        {
          value: "policies",
          label: "Policies & Budgets",
          icon: <FileText className="w-3.5 h-3.5" />,
        },
        {
          value: "audit",
          label: "Audit Log",
          icon: <Activity className="w-3.5 h-3.5" />,
        },
      ],
    },
  ];
  if (tab === "overview") {
    actions.push({
      kind: "button",
      id: "refresh",
      label: "Refresh",
      icon: (
        <RefreshCw
          className={`w-3.5 h-3.5 ${summaryLoading ? "animate-spin" : ""}`}
        />
      ),
      onClick: fetchSummary,
    });
  }

  useToolbar(
    {
      title: "AI Governance",
      description: "Policy management, risk posture, and audit trail",
      actions,
    },
    [tab, summaryLoading, fetchSummary]
  );

  return (
    <div className="p-6 w-full max-w-6xl mx-auto space-y-6">
      {tab === "overview" && (
        <OverviewTab summary={summary} loading={summaryLoading} />
      )}
      {tab === "policies" && <PoliciesTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}
