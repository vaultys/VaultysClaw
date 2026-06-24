import { Shield, FileText, Calendar, Fingerprint } from "lucide-react";
import { formatDate } from "@vaultysclaw/shared";
import type { MeProfile } from "@/lib/contracts";
import { SectionHeader, Row, CopyButton } from "./primitives";

export function SecurityTab({ profile }: { profile: MeProfile | null }) {
  return (
    <div className="space-y-4">
      <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <SectionHeader icon={Shield} title="Identity" />
        <div className="p-5 space-y-0">
          {profile?.did && (
            <Row
              label="DID"
              value={
                <span className="flex items-center gap-0.5">
                  <span className="font-mono text-xs inline-block">
                    {profile.did}
                  </span>
                  <CopyButton value={profile.did} />
                </span>
              }
            />
          )}
          {profile?.publicKey && (
            <Row
              label="Public Key"
              value={
                <span className="flex items-center gap-0.5">
                  <span className="font-mono text-xs inline-block text-foreground-500">
                    {profile.publicKey}
                  </span>
                  <CopyButton value={profile.publicKey} />
                </span>
              }
            />
          )}
          {profile?.entraId && (
            <Row
              label="Entra ID"
              value={
                <span className="font-mono text-xs text-foreground-500">
                  {profile.entraId}
                </span>
              }
            />
          )}
          {profile?.registeredAt && (
            <Row
              label="Registered"
              value={
                <span className="flex items-center gap-1 justify-end">
                  <Calendar className="w-3.5 h-3.5 text-foreground-400 shrink-0" />
                  {formatDate(profile.registeredAt)}
                </span>
              }
            />
          )}
          {profile?.claimedAt && (
            <Row
              label="Account Claimed"
              value={
                <span className="flex items-center gap-1 justify-end">
                  <Fingerprint className="w-3.5 h-3.5 text-foreground-400 shrink-0" />
                  {formatDate(profile.claimedAt)}
                </span>
              }
            />
          )}
          <div className="pt-3 mt-1">
            <p className="text-xs text-foreground-400 leading-relaxed">
              Your identity is managed by your VaultysID wallet. To change it,
              re-authenticate with a different wallet.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <SectionHeader icon={FileText} title="Session" />
        <div className="p-5 space-y-0">
          {profile?.id && (
            <Row
              label="Internal ID"
              value={
                <span className="flex items-center gap-0.5">
                  <span className="font-mono text-xs text-foreground-500">
                    {profile.id}
                  </span>
                  <CopyButton value={profile.id} />
                </span>
              }
            />
          )}
          <Row label="Auth Method" value="VaultysID (Ed25519 ECDSA)" />
          <Row label="Session Protocol" value="NextAuth.js" />
        </div>
      </section>
    </div>
  );
}
