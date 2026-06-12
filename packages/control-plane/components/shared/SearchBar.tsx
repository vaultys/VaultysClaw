import { Search, X } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({ value, onChange, placeholder = "Search…", className = "" }: SearchBarProps) {
  return (
    <div className={`relative flex-1 min-w-[200px] max-w-sm ${className}`}>
      <Search size={14} className="absolute left-3 top-2.5 text-foreground-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2.5 top-2.5 text-foreground-400 hover:text-foreground"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
