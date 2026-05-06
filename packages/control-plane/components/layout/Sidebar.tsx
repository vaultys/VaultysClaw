"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard", exact: true },
  { href: "/agents", icon: Bot, label: "Agents", exact: false },
  { href: "/registrations", icon: Clock, label: "Registrations", exact: false },
  { href: "/users", icon: Users, label: "Users", exact: false },
  { href: "/realms", icon: Globe2, label: "Realms", exact: false },
  { href: "/graph", icon: Network, label: "Graph", exact: true },
  { href: "/chat", icon: MessageSquare, label: "Chat", exact: false },
  { href: "/server", icon: Server, label: "Server", exact: false },
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
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
        collapsed ? "justify-center" : "",
        active
          ? "bg-indigo-600/20 text-indigo-400"
          : "text-vc-muted hover:text-vc-text hover:bg-vc-raised/50"
      )}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

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
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
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
            />
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
