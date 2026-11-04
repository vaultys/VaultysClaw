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
        <Icon className="mx-auto h-[18px] w-[18px] text-foreground-400" strokeWidth={1.5} />
        <h2 className="text-base font-medium text-foreground">{title}</h2>
        <p className="text-sm text-foreground-500">{description}</p>
      </div>
    </div>
  );
}
