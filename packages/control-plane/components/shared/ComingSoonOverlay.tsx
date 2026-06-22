import { Lock } from "lucide-react";

export function ComingSoonOverlay({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="opacity-40 pointer-events-none select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-[2px] rounded-2xl">
        <Lock className="w-6 h-6 text-foreground-500" />
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-foreground-500 max-w-xs mt-1">
            {description}
          </p>
        </div>
        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-warning-100 text-warning-700 border border-warning-300 uppercase tracking-wide">
          Coming soon
        </span>
      </div>
    </div>
  );
}
