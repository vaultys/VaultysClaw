import { PendingRegistrationDAO } from "@/db";
import {
  adminContract,
  type CapabilityOption,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/** Capabilities the admin can assign to agents at approval time. */
const AVAILABLE_CAPABILITIES: CapabilityOption[] = [
  {
    id: "file_access",
    label: "File Access",
    description: "Read and write files on the host system",
  },
  {
    id: "internet_access",
    label: "Internet Access",
    description: "Make outbound HTTP/HTTPS requests",
  },
  {
    id: "browser_control",
    label: "Browser Control",
    description: "Control a headless browser",
  },
  { id: "api_call", label: "API Call", description: "Call external APIs" },
  { id: "mail_send", label: "Mail Send", description: "Send emails" },
  {
    id: "code_execution",
    label: "Code Execution",
    description: "Execute arbitrary code",
  },
  {
    id: "system_command",
    label: "System Command",
    description: "Run system commands",
  },
];

const handlers = createNextRoute(adminContract.registrations, {
  // ── GET /api/admin/registrations — pending registrations + assignable caps ───────
  list: async () => {

    const registrations = await PendingRegistrationDAO.findAll();
    return {
      status: 200,
      body: { registrations, availableCapabilities: AVAILABLE_CAPABILITIES },
    };
  },
});

export const GET = handlers.GET!;
