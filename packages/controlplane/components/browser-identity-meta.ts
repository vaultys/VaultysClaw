import { Cpu, Fingerprint, KeyRound, Usb } from "lucide-react";
import type { BrowserIdentityType } from "@/lib/browser-identity";

/**
 * Display metadata for the four dev-identity key types.
 *
 * Shared by the two places that render a list of browser identities:
 * `BrowserIdentityPicker` (pick one to connect as, from the login page) and
 * `BrowserIdentitiesPanel` (review and manage them, from `/identity`). The lists
 * themselves stay separate — one is a chooser, the other is a manager, and
 * forcing one component to be both behind a mode flag would be worse than the
 * small amount of markup they each own. What genuinely must not drift is the
 * label and icon for a given type, which is exactly what lives here.
 */
export const TYPE_META: Record<
  BrowserIdentityType,
  { label: string; icon: typeof KeyRound; description: string }
> = {
  software: {
    label: "Software key",
    icon: KeyRound,
    description: "A key generated and stored in this browser.",
  },
  "software-pqc": {
    label: "Post-quantum key",
    icon: Cpu,
    description: "Same, but a dilithium_ed25519 hybrid key instead of plain Ed25519.",
  },
  passkey: {
    label: "Passkey",
    icon: Fingerprint,
    description: "Face ID, Touch ID, or another platform authenticator on this device.",
  },
  hardware: {
    label: "Hardware key",
    icon: Usb,
    description: "A YubiKey or other cross-platform FIDO2 security key.",
  },
};

export const TYPE_ORDER: BrowserIdentityType[] = ["software", "software-pqc", "passkey", "hardware"];

/** Falls back to `software` for an identity stored before `type` existed, matching
 *  `normaliseIdentity`'s own default. */
export function typeMeta(type: BrowserIdentityType | undefined) {
  return TYPE_META[type as BrowserIdentityType] ?? TYPE_META.software;
}
