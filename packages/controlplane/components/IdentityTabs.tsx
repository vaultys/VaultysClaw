"use client";

import Link from "next/link";
import { useAdvancedIdentity } from "@/lib/advanced-identity";

/**
 * The tab strip on /identity, plus the switch that reveals it.
 *
 * "Browser keys" manages the several VaultysIDs a browser *can* hold, and for
 * almost everybody the answer is one, handled without being asked
 * (`ensureBrowserIdentity`). So the tab is hidden until someone turns advanced
 * mode on — this component owns both halves of that, which is why the tab strip
 * isn't just markup on the page: the flag lives in `localStorage` and can only be
 * read on the client (`lib/advanced-identity.ts`).
 *
 * A direct `?tab=browser` URL still renders the panel even with the switch off.
 * The page is not a permission boundary — reading your own browser's keys never
 * was one — and silently redirecting a bookmark would be worse than showing an
 * untabbed panel.
 */
export default function IdentityTabs({ activeTab }: { activeTab: string }) {
  const [advanced, setAdvanced] = useAdvancedIdentity();

  return (
    <div className="space-y-3">
      {advanced && (
        <div className="flex gap-1 border-b border-neutral-200/60">
          <TabLink id="identity" active={activeTab === "identity"} label="Identity" />
          <TabLink id="browser" active={activeTab === "browser"} label="Browser keys" />
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-2.5 text-xs text-foreground-500">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(e) => setAdvanced(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary-600"
        />
        <span>
          <span className="font-medium text-foreground-700">Advanced identity management</span> —
          hold several VaultysIDs in this browser, choose a key type, and back them up. Off by
          default: signing in needs none of it.
        </span>
      </label>
    </div>
  );
}

/** Plain `?tab=` links, the same pattern as /admin/integrations and the workspace
 *  detail page — keeps the page itself a Server Component that fetches its own
 *  data, which a client-side tab control could not. */
function TabLink({ id, active, label }: { id: string; active: boolean; label: string }) {
  return (
    <Link
      href={id === "identity" ? "/identity" : `/identity?tab=${id}`}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-primary-600 text-primary-700"
          : "border-transparent text-foreground-500 hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}
