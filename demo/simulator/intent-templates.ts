/**
 * Realistic intent response templates.
 * Keyed by action name patterns — the simulator picks from these
 * instead of calling an LLM.
 */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const REPO_NAMES = ["api-gateway", "auth-service", "frontend-v2", "data-pipeline", "ml-core", "infra-modules"];
const FILE_NAMES = ["main.ts", "auth.py", "schema.sql", "deploy.yml", "model.py", "utils.ts"];
const SERVICE_NAMES = ["payment-service", "user-api", "notification-worker", "analytics-job", "ml-inference"];
const CVE_IDS = ["CVE-2024-3094", "CVE-2024-21626", "CVE-2023-44487", "CVE-2024-6387", "CVE-2024-4577"];
const ENVS = ["staging", "production", "canary", "dev-us-east", "prod-eu-west"];

/** Returns a realistic output object for a given action string */
export function generateIntentResponse(action: string, agentName: string): Record<string, unknown> {
  const a = action.toLowerCase();

  // ── Code / Engineering ────────────────────────────────────────────
  if (a.includes("review") || a.includes("code_review") || a.includes("analyze_code")) {
    const issues = Math.floor(Math.random() * 8);
    return {
      repo: pick(REPO_NAMES),
      file: pick(FILE_NAMES),
      issues_found: issues,
      critical: issues > 5 ? 1 : 0,
      warnings: Math.floor(issues * 0.6),
      suggestions: [
        "Extract magic number 42 into named constant MAX_RETRY_ATTEMPTS",
        "Function `processPayment` exceeds complexity threshold (12). Consider splitting.",
        "Missing null check before `user.profile.settings` access on line 87",
      ].slice(0, Math.max(1, issues)),
      coverage_impact: `${(Math.random() * 3 - 1).toFixed(1)}%`,
      approved: issues < 4,
      agent: agentName,
    };
  }

  if (a.includes("test") || a.includes("run_tests")) {
    const total = pick([42, 67, 128, 214, 89]);
    const failed = Math.random() < 0.15 ? Math.floor(Math.random() * 3) + 1 : 0;
    return {
      suite: pick(REPO_NAMES),
      total_tests: total,
      passed: total - failed,
      failed,
      skipped: Math.floor(total * 0.05),
      duration_ms: Math.floor(Math.random() * 12000) + 2000,
      coverage: `${(Math.random() * 20 + 72).toFixed(1)}%`,
      status: failed === 0 ? "green" : "red",
      agent: agentName,
    };
  }

  if (a.includes("lint") || a.includes("lint_enforce")) {
    const errors = Math.floor(Math.random() * 5);
    return {
      files_checked: Math.floor(Math.random() * 50) + 20,
      errors,
      warnings: Math.floor(Math.random() * 12),
      auto_fixed: Math.floor(errors * 0.7),
      rules_violated: errors > 0 ? ["no-explicit-any", "prefer-const", "no-unused-vars"].slice(0, errors) : [],
      agent: agentName,
    };
  }

  if (a.includes("doc") || a.includes("write_doc")) {
    return {
      artifact: pick(["README.md", "API_REFERENCE.md", "CHANGELOG.md", "ARCHITECTURE.md"]),
      sections_generated: Math.floor(Math.random() * 8) + 3,
      word_count: Math.floor(Math.random() * 800) + 200,
      diagrams: Math.floor(Math.random() * 3),
      status: "generated",
      agent: agentName,
    };
  }

  if (a.includes("pr_assist") || a.includes("pull_request")) {
    return {
      pr_number: Math.floor(Math.random() * 1000) + 100,
      title: pick(["feat: add OAuth2 refresh token rotation", "fix: race condition in queue processor", "refactor: extract payment gateway interface"]),
      review_status: pick(["approved", "changes_requested", "commented"]),
      checks_passed: Math.random() > 0.15,
      merge_conflicts: Math.random() < 0.1,
      agent: agentName,
    };
  }

  // ── Security ──────────────────────────────────────────────────────
  if (a.includes("vuln") || a.includes("scan_vuln") || a.includes("scan")) {
    const critical = Math.floor(Math.random() * 3);
    const high = Math.floor(Math.random() * 6);
    return {
      target: pick(SERVICE_NAMES),
      cves_found: [CVE_IDS[0], CVE_IDS[1]].slice(0, critical + high > 0 ? 1 : 0),
      critical_count: critical,
      high_count: high,
      medium_count: Math.floor(Math.random() * 12),
      scan_duration_s: Math.floor(Math.random() * 90) + 30,
      remediation_available: critical + high > 0,
      cvss_max: critical > 0 ? (Math.random() * 2 + 8).toFixed(1) : high > 0 ? (Math.random() * 2 + 6).toFixed(1) : "3.2",
      agent: agentName,
    };
  }

  if (a.includes("threat") || a.includes("analyze_threat")) {
    return {
      incidents_analyzed: Math.floor(Math.random() * 50) + 10,
      threat_level: pick(["low", "low", "medium", "medium", "high"]),
      attack_patterns: pick([["brute-force", "credential-stuffing"], ["sql-injection"], ["XSS", "CSRF"], []]),
      geo_clusters: [pick(["Eastern Europe", "Southeast Asia", "South America"])],
      false_positive_rate: `${(Math.random() * 5 + 1).toFixed(1)}%`,
      recommended_action: pick(["block IP range", "rotate credentials", "patch dependency", "increase monitoring"]),
      agent: agentName,
    };
  }

  if (a.includes("audit") || a.includes("audit_trail") || a.includes("create_audit")) {
    return {
      period: "last_24h",
      events_logged: Math.floor(Math.random() * 5000) + 1000,
      anomalies: Math.floor(Math.random() * 3),
      compliance_score: `${(Math.random() * 10 + 88).toFixed(0)}%`,
      signed_hash: `sha256:${Math.random().toString(36).slice(2, 34)}`,
      agent: agentName,
    };
  }

  // ── DevOps / Infrastructure ───────────────────────────────────────
  if (a.includes("deploy") || a.includes("deploy_app")) {
    const env = pick(ENVS);
    const success = Math.random() > 0.1;
    return {
      service: pick(SERVICE_NAMES),
      environment: env,
      version: `v${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 20)}.${Math.floor(Math.random() * 100)}`,
      replicas: pick([2, 3, 5, 8]),
      duration_s: Math.floor(Math.random() * 120) + 30,
      status: success ? "deployed" : "rollback_triggered",
      health_check: success ? "passing" : "failing",
      agent: agentName,
    };
  }

  if (a.includes("provision") || a.includes("infra")) {
    return {
      resources_created: Math.floor(Math.random() * 8) + 2,
      resources_modified: Math.floor(Math.random() * 3),
      provider: pick(["aws", "gcp", "azure"]),
      region: pick(["us-east-1", "eu-west-1", "ap-southeast-1", "us-west-2"]),
      estimated_cost_month: `$${(Math.random() * 200 + 50).toFixed(2)}`,
      plan_hash: Math.random().toString(36).slice(2, 18),
      status: "applied",
      agent: agentName,
    };
  }

  if (a.includes("monitor") || a.includes("verify_deploy")) {
    return {
      service: pick(SERVICE_NAMES),
      p50_ms: Math.floor(Math.random() * 30) + 5,
      p99_ms: Math.floor(Math.random() * 200) + 50,
      error_rate: `${(Math.random() * 0.5).toFixed(3)}%`,
      requests_per_min: Math.floor(Math.random() * 5000) + 500,
      status: pick(["healthy", "healthy", "healthy", "degraded"]),
      agent: agentName,
    };
  }

  if (a.includes("alert")) {
    return {
      alerts_processed: Math.floor(Math.random() * 20) + 1,
      escalated: Math.floor(Math.random() * 2),
      auto_resolved: Math.floor(Math.random() * 15),
      notifications_sent: Math.floor(Math.random() * 5),
      agent: agentName,
    };
  }

  // ── Finance ───────────────────────────────────────────────────────
  if (a.includes("report") || a.includes("generate_report")) {
    return {
      report_type: pick(["Q3 Financial Summary", "Monthly Expense Report", "Risk Exposure Analysis", "Compliance Summary"]),
      period: pick(["2024-Q3", "2024-10", "2024-11", "2024-YTD"]),
      pages: Math.floor(Math.random() * 20) + 5,
      data_sources: Math.floor(Math.random() * 8) + 2,
      anomalies_flagged: Math.floor(Math.random() * 3),
      status: "generated",
      output_format: pick(["PDF", "XLSX", "HTML"]),
      agent: agentName,
    };
  }

  if (a.includes("compliance") || a.includes("check_compliance")) {
    const violations = Math.floor(Math.random() * 3);
    return {
      framework: pick(["SOC2", "ISO27001", "GDPR", "PCI-DSS", "HIPAA"]),
      controls_checked: Math.floor(Math.random() * 80) + 20,
      violations,
      warnings: Math.floor(Math.random() * 5),
      compliant: violations === 0,
      next_review: "2025-03-01",
      agent: agentName,
    };
  }

  if (a.includes("fraud") || a.includes("detect_anomal")) {
    const suspicious = Math.floor(Math.random() * 4);
    return {
      transactions_analyzed: Math.floor(Math.random() * 10000) + 1000,
      suspicious_flagged: suspicious,
      blocked: Math.floor(suspicious * 0.7),
      false_positives_est: Math.floor(suspicious * 0.2),
      risk_score: (Math.random() * 30).toFixed(1),
      model_version: "fraud-v2.4.1",
      agent: agentName,
    };
  }

  // ── Data & Analytics ──────────────────────────────────────────────
  if (a.includes("pipeline") || a.includes("etl") || a.includes("etl_run")) {
    return {
      records_processed: Math.floor(Math.random() * 500000) + 10000,
      records_failed: Math.floor(Math.random() * 50),
      duration_s: Math.floor(Math.random() * 300) + 30,
      throughput_rps: Math.floor(Math.random() * 2000) + 500,
      data_quality_score: `${(Math.random() * 5 + 94).toFixed(1)}%`,
      output_table: pick(["analytics.events_daily", "dw.user_sessions", "ml.feature_store"]),
      agent: agentName,
    };
  }

  if (a.includes("ml") || a.includes("train") || a.includes("model")) {
    return {
      model: pick(["churn-predictor-v3", "fraud-classifier-v5", "demand-forecast-v2"]),
      epochs: Math.floor(Math.random() * 50) + 10,
      accuracy: `${(Math.random() * 5 + 92).toFixed(2)}%`,
      f1_score: (Math.random() * 0.05 + 0.93).toFixed(4),
      training_duration_min: Math.floor(Math.random() * 45) + 5,
      deployed: Math.random() > 0.3,
      agent: agentName,
    };
  }

  if (a.includes("insight") || a.includes("collect_metric") || a.includes("generate_insight")) {
    return {
      kpis_updated: Math.floor(Math.random() * 20) + 5,
      insights: [
        `DAU up ${(Math.random() * 15 + 2).toFixed(1)}% week-over-week`,
        `Conversion rate improved by ${(Math.random() * 2 + 0.5).toFixed(2)}% after A/B test`,
        `P99 latency reduced 23% post-cache optimization`,
      ].slice(0, Math.floor(Math.random() * 3) + 1),
      anomalies: Math.floor(Math.random() * 2),
      dashboard_updated: true,
      agent: agentName,
    };
  }

  // ── Customer Success ──────────────────────────────────────────────
  if (a.includes("ticket") || a.includes("route")) {
    return {
      tickets_processed: Math.floor(Math.random() * 100) + 10,
      auto_resolved: Math.floor(Math.random() * 40),
      escalated: Math.floor(Math.random() * 5),
      avg_response_time_min: (Math.random() * 10 + 2).toFixed(1),
      csat_predicted: (Math.random() * 0.5 + 4.2).toFixed(1),
      agent: agentName,
    };
  }

  if (a.includes("sentiment") || a.includes("feedback")) {
    return {
      reviews_analyzed: Math.floor(Math.random() * 500) + 50,
      sentiment_score: (Math.random() * 0.4 + 0.6).toFixed(3),
      positive_pct: `${(Math.random() * 20 + 65).toFixed(0)}%`,
      negative_pct: `${(Math.random() * 10 + 5).toFixed(0)}%`,
      top_themes: pick([["pricing", "onboarding"], ["performance", "support"], ["ui", "documentation"]]),
      agent: agentName,
    };
  }

  // ── Legal ─────────────────────────────────────────────────────────
  if (a.includes("contract") || a.includes("review_contract")) {
    const risks = Math.floor(Math.random() * 4);
    return {
      document: pick(["MSA-2024-0892.pdf", "NDA-Vendor-0234.docx", "SaaS-Agreement-EU.pdf"]),
      clauses_reviewed: Math.floor(Math.random() * 40) + 10,
      risks_identified: risks,
      auto_redlines: Math.floor(risks * 0.8),
      approval_recommendation: risks < 2 ? "approve" : "review_required",
      jurisdiction: pick(["Delaware", "English Law", "French Law", "Swiss Law"]),
      agent: agentName,
    };
  }

  if (a.includes("gdpr") || a.includes("privacy")) {
    return {
      data_subjects_affected: Math.floor(Math.random() * 50000) + 1000,
      lawful_basis_verified: true,
      retention_compliant: Math.random() > 0.15,
      cross_border_transfers: Math.floor(Math.random() * 3),
      dpia_required: Math.random() > 0.5,
      agent: agentName,
    };
  }

  // ── Product ───────────────────────────────────────────────────────
  if (a.includes("feature_flag") || a.includes("flag")) {
    return {
      flags_evaluated: Math.floor(Math.random() * 200) + 20,
      flags_toggled: Math.floor(Math.random() * 5),
      rollout_pct: `${Math.floor(Math.random() * 100)}%`,
      targeting_rules: Math.floor(Math.random() * 8) + 1,
      agent: agentName,
    };
  }

  if (a.includes("ab_test") || a.includes("experiment") || a.includes("analyze_experiment")) {
    const significant = Math.random() > 0.4;
    return {
      experiment: pick(["checkout-redesign-v2", "onboarding-flow-B", "pricing-page-test-3"]),
      sample_size: Math.floor(Math.random() * 50000) + 5000,
      control_conversion: `${(Math.random() * 5 + 2).toFixed(2)}%`,
      variant_conversion: `${(Math.random() * 5 + 3).toFixed(2)}%`,
      p_value: significant ? (Math.random() * 0.04 + 0.01).toFixed(4) : (Math.random() * 0.3 + 0.1).toFixed(4),
      statistically_significant: significant,
      recommendation: significant ? "ship variant" : "continue test",
      agent: agentName,
    };
  }

  // ── Generic fallback ──────────────────────────────────────────────
  return {
    action,
    status: "completed",
    duration_ms: Math.floor(Math.random() * 5000) + 500,
    output: `${agentName} successfully executed ${action}`,
    agent: agentName,
  };
}

/** Occasionally return a failure response */
export function maybeFailure(action: string): { error: string } | null {
  if (Math.random() > 0.08) return null; // 8% failure rate
  const errors = [
    "Execution timeout: resource limit reached after 30s",
    "Connection refused: upstream service unavailable",
    "Rate limit exceeded: retry after 60s",
    "Permission denied: capability not granted for this action",
    "Parse error: malformed input schema",
  ];
  return { error: pick(errors) };
}

export function randomDelay(minMs = 1500, maxMs = 7000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  return new Promise((r) => setTimeout(r, ms));
}
