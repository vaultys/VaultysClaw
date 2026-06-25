import { Bot, Cpu, Mail, Users } from "lucide-react";

export const LS_DONE = "vaultysclaw:wizardDone";
export const LS_STATE = "vaultysclaw:wizardState";

export type StepId = "model" | "email" | "users" | "agent";

/** Per-step completion flags, as returned by `GET /api/setup/status`. */
export type SetupStatus = Record<StepId, boolean>;

export interface WizardState {
  step: number;
  completed: StepId[];
}

export const STEPS: {
  id: StepId;
  label: string;
  desc: string;
  icon: React.ElementType;
}[] = [
  { id: "model", label: "LLM Model", desc: "Connect an AI model", icon: Cpu },
  { id: "email", label: "Email", desc: "Configure SMTP", icon: Mail },
  { id: "users", label: "Users", desc: "Invite teammates", icon: Users },
  { id: "agent", label: "Agents", desc: "Register your first agent", icon: Bot },
];

export const STEP_IDS = STEPS.map((s) => s.id);

export function loadWizardState(): WizardState {
  try {
    const raw = typeof window !== "undefined" && localStorage.getItem(LS_STATE);
    if (raw) return JSON.parse(raw) as WizardState;
  } catch {
    /* ignore */
  }
  return { step: 0, completed: [] };
}

export function saveWizardState(s: WizardState) {
  localStorage.setItem(LS_STATE, JSON.stringify(s));
}
