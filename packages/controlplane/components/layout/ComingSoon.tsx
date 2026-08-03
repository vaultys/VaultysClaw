import type { LucideIcon } from "lucide-react";

/** A placeholder page body — used for routes that exist in the nav but aren't built yet. */
export default function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-xl bg-background-200 flex items-center justify-center">
          <Icon className="w-6 h-6 text-foreground-400" />
        </div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-foreground-500">{description}</p>
      </div>
    </div>
  );
}
