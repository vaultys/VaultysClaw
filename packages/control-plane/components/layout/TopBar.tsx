"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState, useRef, useEffect, Fragment } from "react";
import {
  LogOut,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  ChevronRight,
  User,
  Check,
} from "lucide-react";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { useBreadcrumbsState } from "./BreadcrumbContext";
import { cn } from "@/lib/utils";

function shortDid(did: string): string {
  if (did.length <= 20) return did;
  return `${did.slice(0, 10)}…${did.slice(-6)}`;
}

const THEME_OPTIONS: {
  value: Theme;
  label: string;
  icon: React.ElementType;
}[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

export default function TopBar() {
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const { breadcrumbs } = useBreadcrumbsState();
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
      .catch(() => {});
  }, [session?.user]);

  const did = (session?.user as { did?: string } | undefined)?.did ?? "";
  const isOwner = (session?.user as { isOwner?: boolean } | undefined)?.isOwner;
  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;

  const displayLabel = profileName || (did ? shortDid(did) : "Account");

  return (
    <header className="flex items-center justify-between h-14 px-4 bg-background border-b border-neutral-200/60 shrink-0">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm min-w-0">
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1;
          return (
            <Fragment key={i}>
              {i > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-foreground-400 shrink-0" />
              )}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="text-foreground-500 hover:text-foreground transition-colors truncate"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "truncate",
                    isLast
                      ? "font-semibold text-foreground"
                      : "text-foreground-500"
                  )}
                >
                  {crumb.label}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>

      {/* Right: user menu */}
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors",
            open
              ? "bg-background-200 text-foreground"
              : "text-foreground-700 hover:text-foreground hover:bg-background-200/60"
          )}
        >
          {/* Avatar */}
          <span className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
            <User className="w-3.5 h-3.5" />
          </span>
          <span className="hidden sm:block max-w-[120px] truncate text-xs">
            {displayLabel}
          </span>
          {isOwner && (
            <span className="hidden sm:block px-1.5 py-0.5 bg-warning-100 text-warning-700 border border-warning-300 rounded text-[10px] leading-none">
              Owner
            </span>
          )}
          {isAdmin && !isOwner && (
            <span className="hidden sm:block px-1.5 py-0.5 bg-primary-100 text-primary-700 border border-primary-300 rounded text-[10px] leading-none">
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
          <div className="absolute right-0 top-full mt-1.5 w-56 bg-background-100 border border-neutral-300 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
            {/* User info */}
            <div className="px-3 py-2.5 border-b border-neutral-200">
              <p className="text-xs text-foreground-700 font-medium uppercase tracking-wider mb-0.5">
                Signed in as
              </p>
              {profileName && (
                <p className="text-xs text-foreground font-medium truncate mb-0.5">
                  {profileName}
                </p>
              )}
              <p className="text-xs text-foreground-700 font-mono truncate">
                {shortDid(did)}
              </p>
            </div>

            {/* Appearance */}
            <div className="px-3 py-2 border-b border-neutral-200">
              <p className="text-xs text-foreground-700 uppercase tracking-wider mb-1.5 font-medium">
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
                        ? "bg-primary-100 dark:bg-primary-800/25 border-primary-300 dark:border-primary-700/60 text-primary-700 dark:text-primary-800"
                        : "border-transparent text-foreground-700 hover:text-foreground hover:bg-background-200"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                    {theme === value && (
                      <Check className="w-2.5 h-2.5 text-primary-700 dark:text-primary-800 absolute" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Settings link */}
            <button
              onClick={() => {
                router.push("/settings");
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground-700 hover:text-foreground hover:bg-background-200/60 transition-colors"
            >
              <User className="w-4 h-4 text-foreground-700" />
              Account & Settings
            </button>

            {/* Sign out */}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-danger-500 hover:text-danger-600 dark:hover:text-danger-300 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors border-t border-neutral-200"
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
