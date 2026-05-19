"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import {
  LogOut,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  User,
  Check,
} from "lucide-react";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/users": "Users",
  "/agents": "Agents",
  "/registrations": "Pending Registrations",
  "/server": "Server",
  "/settings": "Settings",
};

function getTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith("/agents/")) return "Agent Details";
  return "VaultysClaw";
}

function shortDid(did: string): string {
  if (did.length <= 20) return did;
  return `${did.slice(0, 10)}…${did.slice(-6)}`;
}

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [profileName, setProfileName] = useState<string | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Fetch name from profile
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((data: { name?: string | null }) => {
        setProfileName(data.name ?? null);
      })
      .catch(() => { });
  }, [session?.user]);

  const did = (session?.user as { did?: string } | undefined)?.did ?? "";
  const isOwner = (session?.user as { isOwner?: boolean } | undefined)?.isOwner;
  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;

  const displayLabel = profileName || (did ? shortDid(did) : "Account");

  return (
    <header className="flex items-center justify-between h-14 px-4 bg-vc-bg border-b border-vc-border/60 shrink-0">
      {/* Page title */}
      <h1 className="text-sm font-semibold text-vc-text">
        {getTitle(pathname)}
      </h1>

      {/* Right: user menu */}
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors",
            open
              ? "bg-vc-raised text-vc-text"
              : "text-vc-muted hover:text-vc-text hover:bg-vc-raised/60"
          )}
        >
          {/* Avatar */}
          <span className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
            <User className="w-3.5 h-3.5" />
          </span>
          <span className="hidden sm:block max-w-[120px] truncate text-xs">
            {displayLabel}
          </span>
          {isOwner && (
            <span className="hidden sm:block px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-800/60 rounded text-[10px] leading-none">
              Owner
            </span>
          )}
          {isAdmin && !isOwner && (
            <span className="hidden sm:block px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-800/60 rounded text-[10px] leading-none">
              Admin
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 transition-transform",
              open ? "rotate-180" : ""
            )}
          />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-56 bg-vc-surface border border-vc-ring rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
            {/* User info */}
            <div className="px-3 py-2.5 border-b border-vc-border">
              <p className="text-xs text-vc-muted font-medium uppercase tracking-wider mb-0.5">
                Signed in as
              </p>
              {profileName && (
                <p className="text-xs text-vc-text font-medium truncate mb-0.5">{profileName}</p>
              )}
              <p className="text-xs text-vc-subtle font-mono truncate">{shortDid(did)}</p>
            </div>

            {/* Appearance */}
            <div className="px-3 py-2 border-b border-vc-border">
              <p className="text-xs text-vc-subtle uppercase tracking-wider mb-1.5 font-medium">
                Appearance
              </p>
              <div className="flex gap-1">
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    title={label}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1 py-1.5 rounded-lg text-xs transition-colors border",
                      theme === value
                        ? "bg-indigo-100 dark:bg-indigo-600/20 border-indigo-300 dark:border-indigo-600/50 text-indigo-700 dark:text-indigo-300"
                        : "border-transparent text-vc-muted hover:text-vc-text-2 hover:bg-vc-raised"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                    {theme === value && (
                      <Check className="w-2.5 h-2.5 text-indigo-700 dark:text-indigo-400 absolute" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Settings link */}
            <button
              onClick={() => { router.push("/settings"); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-vc-text-2 hover:text-vc-text hover:bg-vc-raised/60 transition-colors"
            >
              <User className="w-4 h-4 text-vc-subtle" />
              Account & Settings
            </button>

            {/* Sign out */}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-t border-vc-border"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
