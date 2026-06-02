import { NextRequest, NextResponse } from "next/server";
import {
  getAllModelRegistryEntries,
  getAllAgents,
  getRealmUsers,
  getDefaultRealm,
} from "@/lib/db";
import { getSmtpConfig } from "@/lib/smtp";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

interface SetupStatus {
  model: boolean;
  email: boolean;
  users: boolean;
  agent: boolean;
}

/** GET /api/setup/status — check which setup steps are completed */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const allAgents = getAllAgents();
    const defaultRealm = getDefaultRealm();
    const realmUsers = defaultRealm ? getRealmUsers(defaultRealm.id) : [];

    const status: SetupStatus = {
      model: getAllModelRegistryEntries().length > 0,
      email: getSmtpConfig() !== null,
      users: realmUsers.length > 1, // More than just the admin
      agent: allAgents.length > 0,
    };

    return NextResponse.json({ status });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch setup status" }, { status: 500 });
  }
}
