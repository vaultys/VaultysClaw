import {
  FolderOpen,
  Globe,
  Monitor,
  Plug,
  Mail,
  Code,
  Terminal,
  Bot,
  BookOpen,
} from "lucide-react";

// ── Wizard steps ────────────────────────────────────────────────────────────

export type WizardStep =
  | "launch"
  | "waiting"
  | "approve"
  | "model"
  | "skills"
  | "verify";

export const STEPS: { id: WizardStep; label: string }[] = [
  { id: "launch", label: "Launch" },
  { id: "waiting", label: "Connect" },
  { id: "approve", label: "Approve" },
  { id: "model", label: "Model" },
  { id: "skills", label: "Skills" },
  { id: "verify", label: "Verify" },
];

export const STEP_INDEX: Record<WizardStep, number> = {
  launch: 0,
  waiting: 1,
  approve: 2,
  model: 3,
  skills: 4,
  verify: 5,
};

// ── Package runners ─────────────────────────────────────────────────────────

export type PkgRunner = "npx" | "pnpm" | "yarn" | "deno";

export const PKG_RUNNERS: { id: PkgRunner; label: string; prefix: string }[] = [
  { id: "npx", label: "npx", prefix: "npx @vaultysclaw/agent-controller" },
  {
    id: "pnpm",
    label: "pnpm",
    prefix: "pnpm dlx @vaultysclaw/agent-controller",
  },
  {
    id: "yarn",
    label: "yarn",
    prefix: "yarn dlx @vaultysclaw/agent-controller",
  },
  {
    id: "deno",
    label: "deno",
    prefix: "deno run npm:@vaultysclaw/agent-controller",
  },
];

// ── Capabilities ────────────────────────────────────────────────────────────

export const ALL_CAPABILITIES = [
  { id: "file_access", label: "File Access" },
  { id: "internet_access", label: "Internet Access" },
  { id: "browser_control", label: "Browser Control" },
  { id: "api_call", label: "API Call" },
  { id: "mail_send", label: "Mail Send" },
  { id: "code_execution", label: "Code Execution" },
  { id: "system_command", label: "System Command" },
  { id: "agent_communication", label: "Agent Communication" },
  { id: "knowledge_search", label: "Knowledge Search" },
] as const;

export const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  file_access: <FolderOpen size={13} />,
  internet_access: <Globe size={13} />,
  browser_control: <Monitor size={13} />,
  api_call: <Plug size={13} />,
  mail_send: <Mail size={13} />,
  code_execution: <Code size={13} />,
  system_command: <Terminal size={13} />,
  agent_communication: <Bot size={13} />,
  knowledge_search: <BookOpen size={13} />,
};
export interface PendingReg {
  id: string;
  agentName: string;
  requestedCapabilities: unknown;
  createdAt: string;
  status: string;
}
