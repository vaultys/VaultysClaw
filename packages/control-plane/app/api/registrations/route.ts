import { NextRequest, NextResponse } from "next/server";
import type { AgentCapability } from "@vaultysclaw/shared";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { PendingRegistrationDAO } from "@/db";

/**
 * Available capabilities that the admin can assign to agents
 */
const AVAILABLE_CAPABILITIES: {
  id: AgentCapability;
  label: string;
  description: string;
}[] = [
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

/**
 * GET /api/registrations
 * List all pending registrations + available capabilities. Global admin only.
 */
/**
 * @openapi
 * /api/registrations:
 *   get:
 *     summary: List all pending registrations and available capabilities.
 *     tags: [Registrations]
 *     responses:
 *       200:
 *         description: A list of pending registrations and available capabilities.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 registrations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     additionalProperties: true
 *                 availableCapabilities:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       label:
 *                         type: string
 *                       description:
 *                         type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to fetch registrations.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const registrations = await PendingRegistrationDAO.findAll();
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
