"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Radio,
  Map,
  KeyRound,
  ScrollText,
  Globe2,
  Plug,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  description: string;
  exact: boolean;
}

// The full nav shape from docs/PAGE_DESIGN.md §1.1 — Overview and Actors
// are fully built; the rest are real routes with placeholder content so the
// product reads as complete rather than missing pages.
const NAV_ITEMS: NavItem[] = [
  {
    href: "/admin",
    icon: LayoutDashboard,
    label: "Overview",
    description: "Posture, setup, and next actions",
    exact: true,
  },
  {
    href: "/admin/actors",
    icon: Users,
    label: "Actors",
    description: "People, agents, devices, and approvals",
    exact: false,
  },
  {
    href: "/admin/sensors",
    icon: Radio,
    label: "Sensors",
    description: "Observed hosts and workload telemetry",
    exact: false,
  },
  {
    href: "/admin/map",
    icon: Map,
    label: "Map",
    description: "Where actors and sensors are located",
    exact: false,
  },
  {
    href: "/admin/certificates",
    icon: KeyRound,
    label: "Certificates",
    description: "Capability grants and revocation ledger",
    exact: false,
  },
  {
    href: "/admin/audit",
    icon: ScrollText,
    label: "Audit Log",
    description: "Signed events and operator history",
    exact: false,
  },
  {
    href: "/admin/workspaces",
    icon: Globe2,
    label: "Workspaces",
    description: "Scopes for teams, environments, and apps",
    exact: false,
  },
  {
    href: "/admin/integrations",
    icon: Plug,
    label: "Integrations",
    description: "Webhooks and notification channels",
    exact: false,
  },
  {
    href: "/admin/settings",
    icon: Settings,
    label: "Settings",
    description: "Organization defaults and policies",
    exact: false,
  },
];

function itemActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export default function Sidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-[200px] shrink-0 h-full bg-background border-r border-neutral-200/60">
      <div className="flex items-center gap-2 h-14 px-4 border-b border-neutral-200/60">
        <span className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-primary-600/20 text-white text-sm font-bold">
          V
        </span>
        <span className="font-semibold text-foreground text-sm tracking-tight truncate">
          {orgName}
        </span>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = itemActive(item, pathname);
          return (
            <div key={item.href} className="group/nav relative">
              <Link
                href={item.href}
                aria-describedby={`nav-help-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary-100 text-primary-700"
                    : "text-foreground-600 hover:text-foreground hover:bg-background-200/50"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary-600" />
                )}
                <item.icon className="w-[18px] h-[18px] shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
              <span
                id={`nav-help-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden w-56 -translate-y-1/2 rounded-lg border border-neutral-200 bg-background-100 px-3 py-2 text-xs font-normal leading-5 text-foreground-600 opacity-0 shadow-xl shadow-black/10 transition-opacity group-hover/nav:block group-hover/nav:opacity-100"
              >
                <span className="block font-semibold text-foreground">{item.label}</span>
                {item.description}
              </span>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
