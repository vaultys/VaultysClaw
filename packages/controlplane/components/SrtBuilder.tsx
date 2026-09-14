"use client";

import { useMemo, useState } from "react";
import {
  splitSrtBlock,
  serializeSrtBlock,
  type ManagedLists,
} from "@/lib/srt-block";

/**
 * A structured editor for sandbox-runtime (`srt`) settings.
 *
 * # Why it is not just a JSON textarea
 *
 * The point of this screen is setting up *many* agents. A raw editor makes the
 * second agent exactly as expensive as the first.
 *
 * # Why it is not only structured fields
 *
 * srt owns its schema, and it is a moving research preview. A builder that knows
 * six keys and drops the rest would silently delete `ignoreViolations`,
 * `allowUnixSockets`, or whatever the next release adds, the first time an admin
 * edited an existing template through it. So everything this component does not
 * model is held verbatim in `extras` and merged back on serialize — unknown keys
 * survive a round-trip, which is the same guarantee the wire format and the
 * supervisor's merge already make.
 *
 * The value is emitted into a hidden input as JSON, so the surrounding Server
 * Action reads it from `FormData` like any other field and nothing here needs a
 * client-side submit handler.
 */

export default function SrtBuilder({
  name,
  defaultValue,
}: {
  /** Form field name for the hidden input carrying the serialized block. */
  name: string;
  defaultValue?: Record<string, unknown> | null;
}) {
  const initial = useMemo(() => splitSrtBlock(defaultValue ?? {}), [defaultValue]);
  const [lists, setLists] = useState<ManagedLists>(initial.lists);
  const [extras, setExtras] = useState(initial.extras);
  const [fsExtras] = useState(initial.fsExtras);
  const [netExtras] = useState(initial.netExtras);
  const [rawOpen, setRawOpen] = useState(Object.keys(initial.extras).length > 0);
  const [rawText, setRawText] = useState(
    Object.keys(initial.extras).length > 0 ? JSON.stringify(initial.extras, null, 2) : ""
  );
  const [rawError, setRawError] = useState<string | null>(null);

  const value = serializeSrtBlock(lists, extras, fsExtras, netExtras);

  function applyRaw(text: string) {
    setRawText(text);
    if (text.trim() === "") {
      setExtras({});
      setRawError(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        setRawError("Must be a JSON object");
        return;
      }
      // The managed keys are owned by the controls above; accepting them here
      // too would give one setting two sources and no rule for which wins.
      const { filesystem: _f, network: _n, ...rest } = parsed as Record<string, unknown>;
      setExtras(rest);
      setRawError(null);
    } catch (err) {
      setRawError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name={name} value={value} />

      <div className="grid gap-4 sm:grid-cols-2">
        <ListEditor
          label="Deny read"
          hint="Neither readable nor writable. Credentials the agent has no business opening."
          placeholder="~/.aws"
          values={lists.denyRead}
          onChange={(denyRead) => setLists({ ...lists, denyRead })}
        />
        <ListEditor
          label="Deny write"
          hint="Readable but never modifiable."
          placeholder="./config/production.json"
          values={lists.denyWrite}
          onChange={(denyWrite) => setLists({ ...lists, denyWrite })}
        />
        <ListEditor
          label="Allow write"
          hint='Where writes are permitted. Leave empty to let the host default to "/" — writes allowed except where denied.'
          placeholder="."
          values={lists.allowWrite}
          onChange={(allowWrite) => setLists({ ...lists, allowWrite })}
        />
        <ListEditor
          label="Allow read"
          hint="Re-opens a path inside a denied region. Naming a denied path here exactly lifts that deny."
          placeholder="./docs"
          values={lists.allowRead}
          onChange={(allowRead) => setLists({ ...lists, allowRead })}
        />
      </div>

      <ListEditor
        label="Denied domains"
        hint="Blocked outbound hosts. Takes precedence over the allowed domains above."
        placeholder="ads.example.com"
        values={lists.deniedDomains}
        onChange={(deniedDomains) => setLists({ ...lists, deniedDomains })}
      />

      <div className="border border-neutral-200 rounded-lg">
        <button
          type="button"
          onClick={() => setRawOpen(!rawOpen)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground-700"
        >
          <span>
            Other srt settings{" "}
            {Object.keys(extras).length > 0 && (
              <span className="text-foreground-400">({Object.keys(extras).join(", ")})</span>
            )}
          </span>
          <span className="text-foreground-400">{rawOpen ? "−" : "+"}</span>
        </button>
        {rawOpen && (
          <div className="px-3 pb-3">
            <textarea
              rows={6}
              spellCheck={false}
              value={rawText}
              onChange={(e) => applyRaw(e.target.value)}
              placeholder={'{\n  "ignoreViolations": { "npm": ["/private/tmp"] }\n}'}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
            />
            {rawError && <p className="text-xs text-danger-600 mt-1">{rawError}</p>}
            <p className="text-xs text-foreground-400 mt-1">
              Anything srt accepts that has no field above. Kept verbatim, validated by srt at
              launch rather than here — a setting this console has never heard of still reaches it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One editable list of paths or domains.
 *
 * Entries are rows rather than a comma-separated string because a filesystem
 * path can legitimately contain a comma, and a split on one would quietly
 * produce two paths that protect nothing.
 */
function ListEditor({
  label,
  hint,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const entry = draft.trim();
    if (entry === "" || values.includes(entry)) {
      setDraft("");
      return;
    }
    onChange([...values, entry]);
    setDraft("");
  }

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds an entry; without this it submits the whole form, which
            // would issue a certificate the admin was still describing.
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50"
        >
          Add
        </button>
      </div>
      {values.length > 0 && (
        <ul className="mt-2 space-y-1">
          {values.map((entry) => (
            <li
              key={entry}
              className="flex items-center justify-between gap-2 text-xs font-mono bg-neutral-50 border border-neutral-200 rounded px-2 py-1"
            >
              <span className="truncate">{entry}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== entry))}
                className="text-foreground-400 hover:text-danger-600 shrink-0"
                aria-label={`Remove ${entry}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-foreground-400 mt-1">{hint}</p>
    </div>
  );
}
