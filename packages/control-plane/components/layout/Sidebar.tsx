"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  Server,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bot,
  Clock,
  Globe2,
  Network,
  Inbox,
  Workflow,
  Cpu,
  ShieldCheck,
  Puzzle,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";

const NAV_GROUPS = [
  {
    label: null,
    adminOnly: false,
    items: [
      { href: "/", icon: LayoutDashboard, label: "Dashboard", exact: true },
      { href: "/agents", icon: Bot, label: "Agents", exact: false },
      { href: "/workflows", icon: Workflow, label: "Workflows", exact: false },
      { href: "/realms", icon: Globe2, label: "Realms", exact: false },
      { href: "/inbox", icon: Inbox, label: "Inbox", exact: false },
    ],
  },
  {
    label: "Admin",
    adminOnly: true,
    items: [
      { href: "/models", icon: Cpu, label: "Models", exact: false },
      { href: "/knowledge", icon: BookOpen, label: "Knowledge", exact: false },
      { href: "/skills", icon: Puzzle, label: "Skills", exact: false },
      { href: "/graph", icon: Network, label: "Graph", exact: true },
      { href: "/registrations", icon: Clock, label: "Registrations", exact: false },
      { href: "/users", icon: Users, label: "Users", exact: false },
      { href: "/governance", icon: ShieldCheck, label: "Governance", exact: false },
      { href: "/server", icon: Server, label: "Server", exact: false },
    ],
  },
] as const;

const BOTTOM_ITEMS = [
  { href: "/settings", icon: Settings, label: "Settings" },
] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  badge,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  collapsed: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
        collapsed ? "justify-center" : "",
        active
          ? "bg-indigo-100 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-400"
          : "text-vc-muted hover:text-vc-text hover:bg-vc-raised/50"
      )}
    >
      <div className="relative shrink-0">
        <Icon className="w-[18px] h-[18px]" />
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </div>
      {!collapsed && <span className="truncate flex-1">{label}</span>}
      {!collapsed && badge != null && badge > 0 && (
        <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

function usePendingCount() {
  const { status } = useSession();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    const fetch_ = () =>
      fetch("/api/workflow-approvals")
        .then((r) => r.json())
        .then((d: { approvals?: { id: string }[] }) => setCount(d.approvals?.length ?? 0))
        .catch(() => { });
    fetch_();
    const id = setInterval(fetch_, 15_000);
    return () => clearInterval(id);
  }, [status]);

  return count;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const pendingCount = usePendingCount();
  const { isGlobalAdmin } = useRole();

  return (
    <aside
      className={cn(
        "relative flex flex-col h-full bg-vc-bg border-r border-vc-border/60 transition-all duration-300 shrink-0",
        collapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex items-center h-14 border-b border-vc-border/60 px-3",
          collapsed ? "justify-center" : "gap-2.5"
        )}
      >
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/20">
          🦞
        </div>
        {!collapsed && (
          <span className="font-semibold text-vc-text text-sm tracking-tight truncate">
            VaultysClaw
          </span>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-3">
        {NAV_GROUPS.map((group) => {
          if (group.adminOnly && !isGlobalAdmin) return null;
          return (
            <div key={group.label ?? "__main"}>
              {group.label && !collapsed && (
                <p className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-widest text-vc-muted/60 select-none">
                  {group.label}
                </p>
              )}
              {group.label && collapsed && (
                <div className="mx-2 my-1 border-t border-vc-border/40" />
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  return (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      icon={item.icon}
                      label={item.label}
                      active={active}
                      collapsed={collapsed}
                      badge={item.href === "/inbox" ? pendingCount : undefined}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div className="py-3 px-2 border-t border-vc-border/60 space-y-0.5">
        {BOTTOM_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={active}
              collapsed={collapsed}
            />
          );
        })}
      </div>

      {/* Collapse toggle — positioned at right edge */}
      <button
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-[52px] z-10 w-6 h-6 bg-vc-surface border border-vc-ring rounded-full flex items-center justify-center text-vc-muted hover:text-vc-text hover:border-vc-muted transition-colors shadow-md"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </aside>
  );
}
