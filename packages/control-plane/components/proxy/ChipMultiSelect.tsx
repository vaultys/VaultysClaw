"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";

interface ChipMultiSelectProps {
  values: string[];
  /** Known values to suggest via the native datalist — clicking one adds it
   * immediately; typing a novel value and pressing Enter/comma/blur adds it
   * too, so the list never restricts what can be entered. */
  suggestions: string[];
  placeholder?: string;
  onChange: (values: string[]) => void;
}

/**
 * Creatable multi-select: selected values render as removable chips, and the
 * input underneath autocompletes from `suggestions` via a native
 * `<datalist>` (same pattern as ManualConfigForm's model picker) — pick an
 * existing value or type a new one, both work.
 */
export function ChipMultiSelect({
  values,
  suggestions,
  placeholder,
  onChange,
}: ChipMultiSelectProps) {
  const [input, setInput] = useState("");
  const listId = useId();

  const add = (raw: string) => {
    const v = raw.trim();
    setInput("");
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
  };

  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  const availableSuggestions = suggestions.filter((s) => !values.includes(s));

  return (
    <div className="flex-1 min-w-[220px]">
      <div className="flex flex-wrap gap-1.5 items-center px-2 py-1.5 rounded-lg border border-neutral-300 bg-background-100 focus-within:ring-2 focus-within:ring-primary-500/50">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 border border-primary-300"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(v)}
              className="hover:text-danger-600"
              aria-label={`Remove ${v}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          list={listId}
          value={input}
          onChange={(e) => {
            const v = e.target.value;
            // A click on a datalist suggestion lands here too — confirm it
            // immediately instead of waiting for Enter/blur.
            if (suggestions.includes(v) && !values.includes(v)) add(v);
            else setInput(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(input);
            } else if (e.key === "Backspace" && input === "" && values.length > 0) {
              remove(values[values.length - 1]);
            }
          }}
          onBlur={() => {
            if (input) add(input);
          }}
          placeholder={values.length === 0 ? placeholder : undefined}
          className="flex-1 min-w-[120px] bg-transparent text-xs outline-none py-0.5"
        />
      </div>
      <datalist id={listId}>
        {availableSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
