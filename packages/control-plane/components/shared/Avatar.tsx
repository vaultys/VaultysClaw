import { getInitials } from "@vaultysclaw/shared";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  isAgent?: boolean;
}

const SIZE_CLASSES = {
  sm: "w-6 h-6 text-xs",
  md: "w-8 h-8 text-sm",
  lg: "w-10 h-10 text-base",
};

const BG_COLORS = [
  "bg-blue-600",
  "bg-purple-600",
  "bg-pink-600",
  "bg-green-600",
  "bg-orange-600",
  "bg-red-600",
  "bg-indigo-600",
  "bg-cyan-600",
];

/**
 * Get a consistent background color based on name hash
 */
function getColorByName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return BG_COLORS[Math.abs(hash) % BG_COLORS.length];
}

export function Avatar({
  name,
  size = "md",
  className = "",
  isAgent = false,
}: AvatarProps) {
  const initials = getInitials(name);
  const bgColor = getColorByName(name);

  return (
    <div
      className={`${SIZE_CLASSES[size]} ${bgColor} rounded-full flex items-center justify-center font-semibold text-white ${className}`}
      title={name}
    >
      {isAgent ? "🤖" : initials}
    </div>
  );
}
