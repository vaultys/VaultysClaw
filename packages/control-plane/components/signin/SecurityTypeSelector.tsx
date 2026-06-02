import type { WalletSecurityType } from "@/hooks/useVaultysConnect";

interface SecurityTypeSelectorProps {
  readonly onSelect: (type: WalletSecurityType) => void;
}

const options: {
  type: WalletSecurityType;
  label: string;
  description: string;
}[] = [
  {
    type: "SOFTWARE",
    label: "Software key",
    description: "Secure key stored in this browser (auto-generated)",
  },
  {
    type: "PASSKEY",
    label: "Passkey / Face ID / Touch ID",
    description: "Platform authenticator built into this device",
  },
  {
    type: "HARDWARE",
    label: "Hardware key",
    description: "YubiKey or other FIDO2 security key",
  },
];

export default function SecurityTypeSelector({
  onSelect,
}: SecurityTypeSelectorProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground text-center">
        Choose browser security
      </h2>
      <p className="text-foreground-500 text-sm text-center">
        How should this browser identify itself?
      </p>
      <div className="flex flex-col gap-3 mt-2">
        {options.map(({ type, label, description }) => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className="flex flex-col items-start px-5 py-4 bg-background-200 hover:bg-neutral-300 border border-neutral-300 hover:border-primary-500 rounded-xl transition-colors text-left"
          >
            <span className="text-foreground font-medium">{label}</span>
            <span className="text-foreground-500 text-sm mt-1">
              {description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
