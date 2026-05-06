import { NextResponse } from "next/server";
import { UserDao } from "@/lib/user-dao";
import { getSetting } from "@/lib/db";
import { VaultysId } from "@vaultys/id";

export async function GET() {
  const hasUsers = UserDao.hasAnyUser();
  const serverSecret = getSetting("serverSecret");
  let serverDid: string | null = null;
  if (serverSecret) {
    serverDid = VaultysId.fromSecret(serverSecret, "base64").did;
  }
  return NextResponse.json({ hasUsers, serverDid });
}
