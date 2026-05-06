import { NextResponse } from "next/server";
import { getAllPendingRegistrations } from "@/lib/db";
import type { AgentCapability } from "@vaultysclaw/shared";

/**
 * Available capabilities that the admin can assign to agents
 */
const AVAILABLE_CAPABILITIES: { id: AgentCapability; label: string; description: string }[] = [
  { id: "file_access", label: "File Access", description: "Read and write files on the host system" },
  { id: "internet_access", label: "Internet Access", description: "Make outbound HTTP/HTTPS requests" },
  { id: "browser_control", label: "Browser Control", description: "Control a headless browser" },
  { id: "api_call", label: "API Call", description: "Call external APIs" },
  { id: "mail_send", label: "Mail Send", description: "Send emails" },
  { id: "code_execution", label: "Code Execution", description: "Execute arbitrary code" },
  { id: "system_command", label: "System Command", description: "Run system commands" },
];

/**
 * GET /api/registrations
 * List all pending registrations + available capabilities
 */
export async function GET() {
  try {
    const registrations = getAllPendingRegistrations();
    return NextResponse.json({
      registrations,
      availableCapabilities: AVAILABLE_CAPABILITIES,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch registrations" },
      { status: 500 }
    );
  }
}
