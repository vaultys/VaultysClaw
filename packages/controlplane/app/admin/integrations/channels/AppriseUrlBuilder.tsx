"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Copy,
  ExternalLink,
  Hash,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  Webhook,
  Wrench,
} from "lucide-react";

type AppriseField = {
  name?: string;
  type?: string;
  required?: boolean;
  private?: boolean;
  default?: string | number | boolean | null;
  values?: string[];
  min?: number;
  max?: number;
  prefix?: string;
  delim?: string[];
  group?: string[];
  alias_of?: string;
};

type AppriseSchema = {
  service_name: string;
  service_url: string | null;
  setup_url: string | null;
  details: {
    templates: string[];
    tokens: Record<string, AppriseField>;
    args: Record<string, AppriseField>;
    kwargs?: Record<string, AppriseField>;
  };
  protocols: string[] | null;
  secure_protocols: string[] | null;
};

type DetailsResponse = {
  version: string;
  schemas: AppriseSchema[];
};

const POPULAR_SERVICES = [
  { label: "Slack", terms: ["slack"], icon: Hash },
  { label: "Discord", terms: ["discord"], icon: MessageCircle },
  { label: "Email", terms: ["mailto", "mailtos"], icon: Mail },
  { label: "PagerDuty", terms: ["pagerduty"], icon: ShieldAlert },
  { label: "Telegram", terms: ["telegram"], icon: Send },
  { label: "ntfy", terms: ["ntfy"], icon: Radio },
  { label: "Gotify", terms: ["gotify"], icon: Bell },
  { label: "Pushover", terms: ["pover", "pushover"], icon: Bell },
  { label: "Teams", terms: ["msteams"], icon: MessageCircle },
  { label: "Webhook", terms: ["json", "jsons", "form", "xml", "xmls"], icon: Webhook },
];

function fieldLabel(key: string, field: AppriseField): string {
  return field.name || key.replace(/_/g, " ");
}

function isChoice(field: AppriseField): boolean {
  return field.type?.startsWith("choice:") === true && Array.isArray(field.values);
}

function isBool(field: AppriseField): boolean {
  return field.type === "bool";
}

function defaultValueFor(key: string, field: AppriseField): string {
  if (field.default !== undefined && field.default !== null) return String(field.default);
  if (key === "schema" && field.values?.length) return field.values[0];
  return "";
}

function encodePart(value: string): string {
  return encodeURIComponent(value).replace(/%2F/gi, "%252F");
}

function splitListValue(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function templatePlaceholders(template: string): string[] {
  return [...template.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

function buildUrl(schema: AppriseSchema, values: Record<string, string>): string {
  const tokens = schema.details.tokens;
  const query = new URLSearchParams();
  const filled = new Set(Object.entries(values).filter(([, value]) => value.trim()).map(([key]) => key));
  const required = Object.entries(tokens)
    .filter(([key, field]) => key !== "schema" && field.required)
    .map(([key]) => key);

  const candidates = schema.details.templates
    .map((template) => {
      const placeholders = templatePlaceholders(template);
      const missingRequired = required.filter((key) => placeholders.includes(key) && !filled.has(key));
      const omittedFilled = [...filled].filter((key) => key !== "schema" && tokens[key] && !placeholders.includes(key));
      return {
        template,
        placeholders,
        missingRequired,
        omittedFilled,
        score: placeholders.filter((key) => filled.has(key)).length - omittedFilled.length * 2,
      };
    })
    .filter((c) => c.missingRequired.length === 0)
    .sort((a, b) => b.score - a.score);

  const selected = candidates[0] ?? { template: schema.details.templates[0], placeholders: templatePlaceholders(schema.details.templates[0]) };
  let url = selected.template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const field = tokens[key];
    const value = values[key]?.trim() ?? "";
    if (key === "schema") return value || defaultValueFor(key, field ?? {});
    if (!field) return "";
    if (field.type?.startsWith("list:")) {
      return splitListValue(value)
        .map((item) => encodePart(field.prefix && !item.startsWith(field.prefix) ? `${field.prefix}${item}` : item))
        .join(field.delim?.[0] ?? "/");
    }
    return encodePart(field.prefix && value && !value.startsWith(field.prefix) ? `${field.prefix}${value}` : value);
  });

  for (const [key, field] of Object.entries(schema.details.args ?? {})) {
    if (field.alias_of) continue;
    const value = values[`arg:${key}`];
    if (value === undefined || value === "") continue;
    if (isBool(field)) {
      const boolValue = value === "true";
      if (field.default !== undefined && boolValue === Boolean(field.default)) continue;
      query.set(key, boolValue ? "yes" : "no");
      continue;
    }
    if (field.default !== undefined && String(field.default) === value) continue;
    query.set(key, value);
  }

  const extraArgs = values["__extraArgs"]?.trim();
  if (extraArgs) {
    for (const pair of extraArgs.split(/[\n&]+/)) {
      const [rawKey, ...rawValue] = pair.split("=");
      const key = rawKey.trim();
      if (!key) continue;
      query.set(key, rawValue.join("=").trim());
    }
  }

  const queryString = query.toString();
  if (queryString) url += `${url.includes("?") ? "&" : "?"}${queryString}`;
  return url;
}

function visibleTokens(schema: AppriseSchema): [string, AppriseField][] {
  const listGroups = new Set(
    Object.values(schema.details.tokens)
      .flatMap((field) => field.group ?? [])
      .filter(Boolean)
  );
  return Object.entries(schema.details.tokens).filter(([key, field]) => {
    if (key === "schema") return true;
    if (field.alias_of) return false;
    if (listGroups.has(key)) return false;
    return true;
  });
}

function serviceMatches(schema: AppriseSchema, query: string): boolean {
  const haystack = [
    schema.service_name,
    ...(schema.protocols ?? []),
    ...(schema.secure_protocols ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function schemaProtocols(schema: AppriseSchema): string[] {
  return [...(schema.secure_protocols ?? []), ...(schema.protocols ?? [])];
}

function schemaMatchesTerms(schema: AppriseSchema, terms: string[]): boolean {
  const protocols = schemaProtocols(schema).map((p) => p.toLowerCase());
  return terms.some((term) => protocols.includes(term) || schema.service_name.toLowerCase().includes(term));
}

export default function AppriseUrlBuilder({
  name = "serviceUrls",
  required = false,
  placeholder,
  helpText,
}: {
  name?: string;
  required?: boolean;
  placeholder: string;
  helpText: React.ReactNode;
}) {
  const [details, setDetails] = useState<DetailsResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [serviceUrls, setServiceUrls] = useState("");

  async function loadDetails() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/admin/apprise/details", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as DetailsResponse;
      setDetails(data);
      setSelectedName((current) => current || data.schemas[0]?.service_name || "");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unable to load integration details");
    }
  }

  useEffect(() => {
    void loadDetails();
  }, []);

  const schemas = details?.schemas ?? [];
  const filteredSchemas = useMemo(
    () => (query ? schemas.filter((schema) => serviceMatches(schema, query)).slice(0, 80) : schemas.slice(0, 80)),
    [query, schemas]
  );
  const selected = schemas.find((schema) => schema.service_name === selectedName) ?? schemas[0];
  const builtUrl = selected ? buildUrl(selected, values) : "";
  const tokens = selected ? visibleTokens(selected) : [];
  const args = selected
    ? Object.entries(selected.details.args ?? {}).filter(([, field]) => !field.alias_of)
    : [];
  const popularSchemas = POPULAR_SERVICES.map((popular) => {
    const schema = schemas.find((candidate) => schemaMatchesTerms(candidate, popular.terms));
    return schema ? { ...popular, schema } : null;
  }).filter((item): item is (typeof POPULAR_SERVICES)[number] & { schema: AppriseSchema } => Boolean(item));

  function selectService(schema: AppriseSchema) {
    const nextValues: Record<string, string> = {};
    for (const [key, field] of Object.entries(schema.details.tokens)) {
      nextValues[key] = defaultValueFor(key, field);
    }
    for (const [key, field] of Object.entries(schema.details.args ?? {})) {
      if (!field.alias_of && field.default !== undefined && field.default !== null) {
        nextValues[`arg:${key}`] = String(field.default);
      }
    }
    setSelectedName(schema.service_name);
    setValues(nextValues);
  }

  useEffect(() => {
    if (selected && Object.keys(values).length === 0) selectService(selected);
  }, [selected]);

  function setField(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function appendBuiltUrl() {
    if (!builtUrl) return;
    setServiceUrls((current) => [current.trim(), builtUrl].filter(Boolean).join("\n"));
  }

  async function copyBuiltUrl() {
    if (!builtUrl) return;
    await navigator.clipboard?.writeText(builtUrl);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-neutral-200/60 bg-background-100 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Wrench className="h-4 w-4 text-primary-600" />
            Notification URL Builder
          </div>
          <div className="flex items-center gap-3">
            {details && (
              <span className="text-xs text-foreground-400">
                {details.schemas.length} integrations
              </span>
            )}
            <button
              type="button"
              onClick={loadDetails}
              disabled={status === "loading"}
              className="inline-flex items-center gap-1.5 rounded border border-neutral-200 px-2 py-1 text-xs text-foreground-600 transition-colors hover:bg-background-200/60 disabled:opacity-50"
            >
              {status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </button>
          </div>
        </div>

        {status === "error" && (
          <div className="mb-3 rounded border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
            Builder unavailable: {error}
          </div>
        )}

        {selected && (
          <div className="space-y-4">
            {popularSchemas.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase text-foreground-500">Most used</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {popularSchemas.map(({ label, schema, icon: Icon }) => {
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => selectService(schema)}
                        className={`flex min-h-14 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          schema.service_name === selected.service_name
                            ? "border-primary-200 bg-primary-50 text-primary-700"
                            : "border-neutral-200 bg-background hover:bg-background-200/60"
                        }`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-background-200 text-foreground-600">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{label}</span>
                          <span className="block truncate text-xs text-foreground-400">{schemaProtocols(schema)[0]}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
            <div className="space-y-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search integrations"
                className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm"
              />
              <div className="max-h-[30rem] overflow-y-auto rounded-lg border border-neutral-200/60">
                {filteredSchemas.map((schema) => (
                  <button
                    key={schema.service_name}
                    type="button"
                    onClick={() => selectService(schema)}
                    className={`block w-full border-b border-neutral-200/60 px-3 py-2 text-left text-sm last:border-b-0 ${
                      schema.service_name === selected.service_name
                        ? "bg-primary-50 text-primary-700"
                        : "text-foreground-600 hover:bg-background-200/60"
                    }`}
                  >
                    <span className="block font-medium">{schema.service_name}</span>
                    <span className="block truncate text-xs text-foreground-400">
                      {schemaProtocols(schema).join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-foreground">{selected.service_name}</div>
                  {selected.setup_url && (
                    <a
                      href={selected.setup_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
                    >
                      Setup guide
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {tokens.map(([key, field]) => (
                  <label key={key} className="block text-xs font-medium text-foreground-600">
                    {fieldLabel(key, field)}
                    {field.required && <span className="text-danger-600"> *</span>}
                    {field.private && <span className="text-foreground-400"> private</span>}
                    {isChoice(field) ? (
                      <select
                        value={values[key] ?? ""}
                        onChange={(e) => setField(key, e.target.value)}
                        required={field.required}
                        className="mt-1 w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm"
                      >
                        {field.values?.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    ) : field.type?.startsWith("list:") ? (
                      <textarea
                        value={values[key] ?? ""}
                        onChange={(e) => setField(key, e.target.value)}
                        required={field.required}
                        rows={2}
                        placeholder="One per line"
                        className="mt-1 w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm"
                      />
                    ) : (
                      <input
                        type={field.private ? "password" : field.type === "int" || field.type === "float" ? "number" : "text"}
                        min={field.min}
                        max={field.max}
                        value={values[key] ?? ""}
                        onChange={(e) => setField(key, e.target.value)}
                        required={field.required}
                        className="mt-1 w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm"
                      />
                    )}
                  </label>
                ))}
              </div>

              {args.length > 0 && (
                <details className="rounded-lg border border-neutral-200/60 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">Advanced options</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2 text-xs text-foreground-400">
                      Showing {args.length} optional settings for this integration.
                    </div>
                    {args.map(([key, field]) => (
                      <label key={key} className="block text-xs font-medium text-foreground-600">
                        {fieldLabel(key, field)}
                        {isChoice(field) ? (
                          <select
                            value={values[`arg:${key}`] ?? ""}
                            onChange={(e) => setField(`arg:${key}`, e.target.value)}
                            className="mt-1 w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm"
                          >
                            <option value="">Default</option>
                            {field.values?.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        ) : isBool(field) ? (
                          <select
                            value={values[`arg:${key}`] ?? ""}
                            onChange={(e) => setField(`arg:${key}`, e.target.value)}
                            className="mt-1 w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm"
                          >
                            <option value="">Default</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        ) : (
                          <input
                            type={field.type === "int" || field.type === "float" ? "number" : "text"}
                            min={field.min}
                            max={field.max}
                            value={values[`arg:${key}`] ?? ""}
                            onChange={(e) => setField(`arg:${key}`, e.target.value)}
                            className="mt-1 w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                  <label className="mt-3 block text-xs font-medium text-foreground-600">
                    Extra query pairs
                    <textarea
                      value={values.__extraArgs ?? ""}
                      onChange={(e) => setField("__extraArgs", e.target.value)}
                      rows={2}
                      placeholder="key=value"
                      className="mt-1 w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm font-mono"
                    />
                  </label>
                </details>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground-600">Generated URL</label>
                <div className="mt-1 flex gap-2">
                  <input
                    readOnly
                    value={builtUrl}
                    className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={copyBuiltUrl}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-xs transition-colors hover:bg-background-200/60"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={appendBuiltUrl}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-500"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Service URL(s)</label>
        <textarea
          name={name}
          required={required}
          rows={3}
          value={serviceUrls}
          onChange={(e) => setServiceUrls(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-foreground-400">{helpText}</p>
        {details && (
          <p className="mt-1 text-right text-[11px] text-foreground-300">
            powered by Apprise {details.version}
          </p>
        )}
      </div>
    </div>
  );
}
