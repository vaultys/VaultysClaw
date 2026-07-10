"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  User,
  Settings,
  Bell,
  Shield,
  Key,
  Sun,
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
  Activity,
  SatelliteDish,
  Plug,
  Info,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";
import {
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";

// ─────────────────────────────────────────────────────────────────────────────
// Navigation model
//
// The sidebar is split Strapi-style into a narrow icon rail + a contextual
// panel. Each rail "section" owns a menu that renders in the panel. Leaf entries
// (account / about) have no menu and navigate directly.
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  exact: boolean;
  adminOnly?: boolean;
}

interface NavSection {
  id: string;
  icon: React.ElementType;
  label: string;
  adminOnly: boolean;
  items: NavItem[];
}

interface NavLeaf {
  id: string;
  icon: React.ElementType;
  label: string;
  href: string;
  adminOnly?: boolean;
}

const SECTIONS: NavSection[] = [
  {
    id: "home",
    icon: Home,
    label: "Home",
    adminOnly: false,
    items: [
      { href: "/", icon: LayoutDashboard, label: "Dashboard", exact: true },
      { href: "/app/my-agents", icon: Bot, label: "My Agents", exact: false },
      { href: "/app/workflows", icon: Workflow, label: "My Workflows", exact: false },
      { href: "/app/inbox", icon: Inbox, label: "Inbox", exact: false },
    ],
  },
  {
    id: "workspaces",
    icon: Globe2,
    label: "Workspaces",
    adminOnly: false,
    items: [
      { href: "/workspaces", icon: Globe2, label: "All workspaces", exact: false },
    ],
  },
  {
    id: "admin",
    icon: ShieldCheck,
    label: "Administration",
    adminOnly: true,
    items: [
      { href: "/admin/mission-control", icon: SatelliteDish, label: "Mission Control", exact: true },
      { href: "/admin/agents", icon: Bot, label: "Agents", exact: false },
      { href: "/admin/workflows", icon: Workflow, label: "Workflows", exact: false },
      { href: "/admin/models", icon: Cpu, label: "Models", exact: false },
      { href: "/admin/knowledge", icon: BookOpen, label: "Knowledge", exact: false },
      { href: "/admin/skills", icon: Puzzle, label: "Skills", exact: false },
      { href: "/admin/graph", icon: Network, label: "Graph", exact: true },
      { href: "/admin/registrations", icon: Clock, label: "Registrations", exact: false },
      { href: "/admin/users", icon: Users, label: "Users", exact: false },
      { href: "/admin/governance", icon: ShieldCheck, label: "Governance", exact: false },
      { href: "/admin/network", icon: Activity, label: "Network", exact: false },
      { href: "/admin/settings/integrations", icon: Plug, label: "Integrations", exact: false },
      { href: "/admin/settings/api-keys", icon: Key, label: "API Keys", exact: false },
    ],
  },
  {
    id: "settings",
    icon: Settings,
    label: "Settings",
    adminOnly: false,
    items: [
      { href: "/app/settings/profile", icon: User, label: "Profile", exact: false },
      { href: "/app/settings/security", icon: Shield, label: "Security", exact: false },
      { href: "/app/settings/notifications", icon: Bell, label: "Notifications", exact: false },
      { href: "/app/settings/appearance", icon: Sun, label: "Appearance", exact: false },
    ],
  },
];

const LEAVES: NavLeaf[] = [
  { id: "about", icon: Info, label: "About", href: "/app/about" },
];

// ─────────────────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function itemActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

/** Which section a pathname belongs to, or null if it belongs to a leaf. */
function sectionForPath(pathname: string): string | null {
  for (const section of SECTIONS) {
    if (section.items.some((item) => itemActive(item, pathname))) return section.id;
  }
  return null;
}

function usePendingCount() {
  const { status } = useSession();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    const fetch_ = () =>
      userApi.workflowApprovals
        .list({ query: {} })
        .then((res) => setCount(unwrap(res).approvals.length))
        .catch(() => {});
    fetch_();
    const id = setInterval(fetch_, 15_000);
    return () => clearInterval(id);
  }, [status]);

  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rail — narrow icon column with tooltips
// ─────────────────────────────────────────────────────────────────────────────

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "group relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors",
        active
          ? "bg-primary-100 text-primary-700"
          : "text-foreground-600 hover:text-foreground hover:bg-background-200/50"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary-600" />
      )}
      <Icon className="w-[18px] h-[18px]" />
      {/* Tooltip */}
      <span className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </button>
  );
}

function RailLink({
  icon: Icon,
  label,
  href,
  active,
}: {
  icon: React.ElementType;
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={cn(
        "group relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors",
        active
          ? "bg-primary-100 text-primary-700"
          : "text-foreground-600 hover:text-foreground hover:bg-background-200/50"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary-600" />
      )}
      <Icon className="w-[18px] h-[18px]" />
      <span className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel — contextual menu for the active section
// ─────────────────────────────────────────────────────────────────────────────

function PanelLink({
  href,
  icon: Icon,
  label,
  active,
  badge,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary-100 text-primary-700"
          : "text-foreground-600 hover:text-foreground hover:bg-background-200/50"
      )}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span className="truncate flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto bg-warning-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const pendingCount = usePendingCount();
  const { isGlobalAdmin } = useRole();

  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => !s.adminOnly || isGlobalAdmin),
    [isGlobalAdmin]
  );

  // Active section: driven by the URL, but a rail click can preview another
  // section's menu without navigating. When the URL lands on a leaf (account /
  // about) we keep whatever section was open.
  const [activeSectionId, setActiveSectionId] = useState<string>("home");

  useEffect(() => {
    const matched = sectionForPath(pathname);
    if (matched) setActiveSectionId(matched);
  }, [pathname]);

  const activeSection =
    visibleSections.find((s) => s.id === activeSectionId) ?? visibleSections[0];

  const onLeaf = LEAVES.some((l) => pathname === l.href);

  return (
    <aside className="relative flex h-full shrink-0 bg-background border-r border-neutral-200/60">
      {/* Rail */}
      <div className="flex flex-col items-center w-[60px] py-3 gap-1 border-r border-neutral-200/60">
        {/* Brand */}
        <Link
          href="/"
          title="VaultysClaw"
          className="w-9 h-9 mb-2 bg-primary-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-primary-600/20"
        >
          🦞
        </Link>

        {visibleSections.map((section) => (
          <RailButton
            key={section.id}
            icon={section.icon}
            label={section.label}
            active={!onLeaf && activeSection?.id === section.id}
            onClick={() => {
              setActiveSectionId(section.id);
              // Reopen the panel if it was collapsed
              if (collapsed) onToggle();
            }}
          />
        ))}

        <div className="flex-1" />

        {LEAVES.map((leaf) => (
          <RailLink
            key={leaf.id}
            icon={leaf.icon}
            label={leaf.label}
            href={leaf.href}
            active={pathname === leaf.href}
          />
        ))}
      </div>

      {/* Panel */}
      {!collapsed && activeSection && (
        <div className="flex flex-col w-[200px]">
          <div className="flex items-center h-14 px-4 border-b border-neutral-200/60">
            <span className="font-semibold text-foreground text-sm tracking-tight truncate">
              {activeSection.label}
            </span>
          </div>
          <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-0.5">
            {activeSection.items
              .filter((item) => !item.adminOnly || isGlobalAdmin)
              .map((item) => (
              <PanelLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={itemActive(item, pathname)}
                badge={item.href === "/app/inbox" ? pendingCount : undefined}
              />
            ))}
          </nav>
        </div>
      )}

      {/* Collapse toggle — positioned at right edge */}
      <button
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-[52px] z-10 w-6 h-6 bg-background-100 border border-neutral-300 rounded-full flex items-center justify-center text-foreground-700 hover:text-foreground hover:border-foreground-600 transition-colors shadow-md"
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
