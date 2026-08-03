"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
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
  exact: boolean;
}

// The full nav shape from docs/PAGE_DESIGN.md §1.1 — Overview and Principals
// are fully built; the rest are real routes with placeholder content so the
// product reads as complete rather than missing pages.
const NAV_ITEMS: NavItem[] = [
  { href: "/admin", icon: LayoutDashboard, label: "Overview", exact: true },
  { href: "/admin/principals", icon: Users, label: "Principals", exact: false },
  { href: "/admin/certificates", icon: KeyRound, label: "Certificates", exact: false },
  { href: "/admin/audit", icon: ScrollText, label: "Audit Log", exact: false },
  { href: "/admin/workspaces", icon: Globe2, label: "Workspaces", exact: false },
  { href: "/admin/integrations", icon: Plug, label: "Integrations", exact: false },
  { href: "/admin/settings", icon: Settings, label: "Settings", exact: false },
];

function itemActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-[200px] shrink-0 h-full bg-background border-r border-neutral-200/60">
      <div className="flex items-center gap-2 h-14 px-4 border-b border-neutral-200/60">
        <span className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-primary-600/20 text-white text-sm font-bold">
          V
        </span>
        <span className="font-semibold text-foreground text-sm tracking-tight truncate">
          VaultysClaw
        </span>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = itemActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
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
          );
        })}
      </nav>
    </aside>
  );
}
