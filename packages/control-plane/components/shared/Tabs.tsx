"use client";

export interface Tab {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: Readonly<{
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}>) {
  return (
    <div className="flex gap-1 border-b border-neutral-200 px-1 bg-background-100 rounded-t-xl overflow-x-auto flex-shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            active === tab.id
              ? "border-primary-500 text-primary-400"
              : "border-transparent text-foreground-500 hover:text-foreground hover:border-neutral-300"
          }`}
        >
          {tab.icon}
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] rounded-full bg-danger-500 text-white text-[10px] font-bold px-1">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
