"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MoreHorizontal, Pencil } from "lucide-react";
import { useToolbarState, type ToolbarAction } from "./ToolbarContext";
import ToolbarSearch from "./ToolbarSearch";
import ToolbarSteps from "./ToolbarSteps";

/** Run layout effects on the client, fall back to useEffect during SSR. */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Horizontal gap between action items (matches `gap-3` = 0.75rem). */
const ACTION_GAP = 12;
/** Gap between the toolbar's left/center/right regions (matches `gap-4`). */
const REGION_GAP = 16;
/** Horizontal padding of the toolbar (`px-6` = 1.5rem each side). */
const TOOLBAR_PADDING = 48;
/** Minimum width to reserve for the center region when a search/steps exist. */
const CENTER_RESERVE = 240;

const BADGE_TONES: Record<
  NonNullable<Extract<ToolbarAction, { kind: "badge" }>["tone"]>,
  string
> = {
  success: "bg-success-100 border-success-300 text-success-700",
  neutral: "bg-background-200 border-neutral-200 text-foreground-400",
  warning: "bg-warning-100 border-warning-300 text-warning-700",
  danger: "bg-danger-100 border-danger-300 text-danger-700",
};

const BUTTON_VARIANT_CLASSES = {
  primary: "bg-primary-600 hover:bg-primary-500 text-white",
  danger: "border border-danger-300 text-danger-600 hover:bg-danger-500/10",
  default:
    "bg-background-100 border border-neutral-200 text-foreground hover:bg-background-200",
  success: "bg-success-600 hover:bg-success-500 text-white",
} as const;

/**
 * Renders a single toolbar action. When `compact` is set, `button` actions that
 * have an icon collapse to an icon-only button with a tooltip; `tabs` and
 * `badge` actions are never compacted.
 */
function ActionItem({
  action,
  compact = false,
}: {
  action: ToolbarAction;
  compact?: boolean;
}) {
  if (action.kind === "badge") {
    return (
      <span
        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border whitespace-nowrap ${
          BADGE_TONES[action.tone ?? "neutral"]
        }`}
      >
        {action.icon}
        {action.label}
      </span>
    );
  }

  // Tabs are rendered separately in the bottom tab strip, never here.
  if (action.kind === "tabs") return null;

  // button
  const iconOnly = compact && !!action.icon;
  const button = (
    <button
      onClick={action.onClick}
      disabled={action.disabled}
      aria-label={iconOnly ? action.label : undefined}
      className={`flex items-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
        iconOnly ? "px-2" : "px-3"
      } ${BUTTON_VARIANT_CLASSES[action.variant ?? "default"]}`}
    >
      {action.icon}
      {!iconOnly && action.label}
    </button>
  );

  if (!iconOnly) return button;

  // Icon-only: wrap with an instant CSS tooltip (no native `title` delay).
  return (
    <span className="group relative flex">
      {button}
      <Tooltip label={action.label} />
    </span>
  );
}

/**
 * Renders the page's `tabs` actions as a prominent underline-style tab strip,
 * aligned to the bottom-left of the toolbar. Sits flush with the toolbar's
 * bottom border so the active tab's underline reads as a real tab.
 */
function ToolbarTabRow({
  tabs,
}: {
  tabs: Extract<ToolbarAction, { kind: "tabs" }>[];
}) {
  return (
    <div className="flex items-center gap-1 px-6 -mb-px overflow-x-auto">
      {tabs.flatMap((action) =>
        action.options.map((opt) => {
          const active = action.value === opt.value;
          return (
            <button
              key={`${action.id}-${opt.value}`}
              onClick={() => action.onChange(opt.value)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 -mb-px border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-foreground-500 hover:text-foreground hover:border-neutral-300"
              }`}
            >
              {opt.icon}
              {opt.label}
              {opt.badge}
            </button>
          );
        })
      )}
    </div>
  );
}

/** A lightweight tooltip shown instantly on hover of its `group` parent. */
function Tooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity duration-75 group-hover:opacity-100"
    >
      {label}
    </span>
  );
}

/** A "more actions" dropdown holding overflowed button actions. */
function OverflowMenu({
  items,
}: {
  items: Extract<ToolbarAction, { kind: "button" }>[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="group relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        className="flex items-center px-2 py-1.5 rounded-lg bg-background-100 border border-neutral-200 text-foreground hover:bg-background-200 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {!open && <Tooltip label="More actions" />}

      {open && (
        <div className="absolute right-0 top-full mt-1.5 min-w-[180px] bg-background-100 border border-neutral-200 rounded-lg shadow-xl shadow-black/20 z-50 py-1">
          {items.map((item) => (
            <button
              key={item.id}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-foreground hover:bg-background-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Renders the toolbar actions, adapting to the available width:
 *
 * 1. Everything fits → full labels.
 * 2. Not enough room → `button` actions collapse to icons (with tooltips).
 * 3. Still not enough room → trailing buttons move into a "more" dropdown.
 *
 * `available` is the pixel width the actions region may occupy, computed by the
 * parent toolbar. Item widths are measured from a hidden, off-screen copy.
 */
function ToolbarActions({
  actions,
  available,
}: {
  actions: ToolbarAction[];
  available: number;
}) {
  const fullRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const iconRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const ddRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<{
    compact: boolean;
    overflowIds: string[];
  }>({ compact: false, overflowIds: [] });

  useIsomorphicLayoutEffect(() => {
    const n = actions.length;
    if (n === 0 || available <= 0) return;

    const fullW = (id: string) => fullRefs.current[id]?.offsetWidth ?? 0;
    const iconW = (id: string) =>
      iconRefs.current[id]?.offsetWidth ?? fullW(id);
    const ddW = ddRef.current?.offsetWidth ?? 40;
    const isButton = (a: ToolbarAction) => a.kind === "button";

    const update = (next: { compact: boolean; overflowIds: string[] }) =>
      setLayout((prev) =>
        prev.compact === next.compact &&
        sameIds(prev.overflowIds, next.overflowIds)
          ? prev
          : next
      );

    const gaps = ACTION_GAP * (n - 1);

    // 1. Try full labels.
    const fullTotal = actions.reduce((s, a) => s + fullW(a.id), 0) + gaps;
    if (fullTotal <= available) {
      update({ compact: false, overflowIds: [] });
      return;
    }

    // 2. Try icon-only buttons (tabs/badges keep their full width).
    const iconTotal =
      actions.reduce(
        (s, a) => s + (isButton(a) ? iconW(a.id) : fullW(a.id)),
        0
      ) + gaps;
    if (iconTotal <= available) {
      update({ compact: true, overflowIds: [] });
      return;
    }

    // 3. Overflow trailing buttons into the dropdown. Reserve room for the
    //    dropdown trigger; non-button actions always stay visible.
    const budget = available - ddW - ACTION_GAP;
    let used = 0;
    let first = true;
    const overflowIds: string[] = [];
    for (const a of actions) {
      const w = isButton(a) ? iconW(a.id) : fullW(a.id);
      const add = first ? w : w + ACTION_GAP;
      if (isButton(a) && used + add > budget) {
        overflowIds.push(a.id);
        continue;
      }
      used += add;
      first = false;
    }
    update({ compact: true, overflowIds });
  }, [actions, available]);

  const overflowSet = new Set(layout.overflowIds);
  const visible = actions.filter((a) => !overflowSet.has(a.id));
  const overflowItems = actions.filter(
    (a): a is Extract<ToolbarAction, { kind: "button" }> =>
      a.kind === "button" && overflowSet.has(a.id)
  );

  return (
    <div className="flex items-center gap-3 shrink-0 justify-end">
      {visible.map((action) => (
        <ActionItem key={action.id} action={action} compact={layout.compact} />
      ))}
      {overflowItems.length > 0 && <OverflowMenu items={overflowItems} />}

      {/* Hidden measurer: natural (full) and icon-only widths + dropdown trigger. */}
      <div
        aria-hidden
        className="fixed top-0 left-[-9999px] flex items-center gap-3 opacity-0 pointer-events-none"
      >
        {actions.map((action) => (
          <div
            key={`full-${action.id}`}
            ref={(el) => {
              fullRefs.current[action.id] = el;
            }}
          >
            <ActionItem action={action} compact={false} />
          </div>
        ))}
        {actions
          .filter((a) => a.kind === "button")
          .map((action) => (
            <div
              key={`icon-${action.id}`}
              ref={(el) => {
                iconRefs.current[action.id] = el;
              }}
            >
              <ActionItem action={action} compact />
            </div>
          ))}
        <div ref={ddRef}>
          <OverflowMenu items={[]} />
        </div>
      </div>
    </div>
  );
}

/**
 * An inline-editable page title. Renders as a heading with a hover-revealed
 * pencil; clicking it swaps in a text input that commits on Enter/blur and
 * cancels on Escape.
 */
function EditableTitle({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onChange(next);
    else setDraft(value);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") cancel();
        }}
        placeholder={placeholder}
        className="text-lg font-semibold text-foreground bg-background-100 border border-primary-400 rounded-md px-1.5 py-0.5 -my-0.5 -mx-1.5 outline-none focus:ring-1 focus:ring-primary-400 min-w-0 w-full"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="Rename"
      className="group/title flex items-center gap-1.5 min-w-0 max-w-full rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-background-200 transition-colors"
    >
      <span className="text-lg font-semibold text-foreground truncate">
        {value || placeholder}
      </span>
      <Pencil className="w-3.5 h-3.5 shrink-0 text-foreground-400 opacity-0 group-hover/title:opacity-100 transition-opacity" />
    </button>
  );
}

/**
 * Renders the page toolbar configured via `useToolbar`. Mounted once by the
 * app shell, below the TopBar. Renders nothing when no page has set a config.
 */
export default function Toolbar() {
  const { config } = useToolbarState();
  const outerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

  const hasCenter = !!(config?.search || config?.steps);

  useIsomorphicLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => {
      const innerWidth = el.clientWidth - TOOLBAR_PADDING;
      const titleWidth = titleRef.current?.offsetWidth ?? 0;
      const centerReserve = hasCenter ? CENTER_RESERVE : 0;
      // Two gaps: title↔center and center↔actions.
      const avail = innerWidth - titleWidth - centerReserve - REGION_GAP * 2;
      setAvailable(Math.max(0, avail));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [config, hasCenter]);

  if (!config) return null;

  const tabActions = (config.actions ?? []).filter(
    (a): a is Extract<ToolbarAction, { kind: "tabs" }> => a.kind === "tabs"
  );
  const otherActions = (config.actions ?? []).filter((a) => a.kind !== "tabs");

  return (
    <div
      ref={outerRef}
      className="flex flex-col bg-background border-b border-neutral-200/60 shrink-0"
    >
      <div
        className={`flex items-center gap-4 px-6 pt-3 ${
          tabActions.length > 0 ? "pb-2" : "pb-3"
        }`}
      >
        <div ref={titleRef} className="min-w-0 shrink-0 max-w-[40%]">
          {config.onTitleChange ? (
            <EditableTitle
              value={config.title}
              onChange={config.onTitleChange}
              placeholder={config.titlePlaceholder}
            />
          ) : (
            <h1 className="text-lg font-semibold text-foreground truncate">
              {config.title}
            </h1>
          )}
          {config.description && (
            <p className="text-foreground-500 text-sm mt-0.5 truncate">
              {config.description}
            </p>
          )}
        </div>

        {/* Center: step indicator or advanced search (or a spacer to keep
            actions right-aligned). Steps take precedence over search. */}
        {config.steps ? (
          <div className="flex-1 flex justify-center">
            <ToolbarSteps steps={config.steps} />
          </div>
        ) : config.search ? (
          <div className="flex-1 flex justify-center">
            <ToolbarSearch search={config.search} />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {otherActions.length > 0 && (
          <ToolbarActions actions={otherActions} available={available} />
        )}
      </div>

      {/* Page-level tabs: a prominent underline strip on the bottom-left. */}
      {tabActions.length > 0 && <ToolbarTabRow tabs={tabActions} />}
    </div>
  );
}
