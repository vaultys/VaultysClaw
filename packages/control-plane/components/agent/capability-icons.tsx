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

export const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  file_access: <FolderOpen size={16} />,
  internet_access: <Globe size={16} />,
  browser_control: <Monitor size={16} />,
  api_call: <Plug size={16} />,
  mail_send: <Mail size={16} />,
  code_execution: <Code size={16} />,
  system_command: <Terminal size={16} />,
  agent_communication: <Bot size={16} />,
  knowledge_search: <BookOpen size={16} />,
};
