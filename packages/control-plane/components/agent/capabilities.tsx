import {
  FolderOpen,
  Globe,
  Monitor,
  Plug,
  Mail,
  Code,
  Terminal,
  BookOpen,
} from "lucide-react";

/** Icon shown for each agent capability across the agents UI. */
export const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  file_access: <FolderOpen size={14} />,
  internet_access: <Globe size={14} />,
  browser_control: <Monitor size={14} />,
  api_call: <Plug size={14} />,
  mail_send: <Mail size={14} />,
  code_execution: <Code size={14} />,
  system_command: <Terminal size={14} />,
  agent_communication: <BookOpen size={14} />,
};

export const AVAILABLE_CAPABILITIES = Object.keys(CAPABILITY_ICONS) as Array<
  keyof typeof CAPABILITY_ICONS
>;
