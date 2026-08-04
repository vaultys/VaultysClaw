import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { CapabilityCertificateDAO, PrincipalDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { inspectCertificate, type DecodedToken } from "@/lib/cert-inspect";
import type { CertScope, ResourceLimits } from "@vaultysclaw/policy";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-success-100 text-success-700 border-success-200",
  revoked: "bg-danger-100 text-danger-700 border-danger-200",
  superseded: "bg-neutral-100 text-foreground-500 border-neutral-200",
  expired: "bg-neutral-100 text-foreground-500 border-neutral-200",
};

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="text-xs bg-background-200/40 border border-neutral-200/60 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function RawToken({ token }: { token: string }) {
  return (
    <pre className="text-[11px] font-mono bg-background-200/40 border border-neutral-200/60 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all text-foreground-500">
      {token}
    </pre>
  );
}

/**
 * The two pieces a signature verifier actually consumes: the exact bytes that
 * were signed (not the human-readable decoded JSON — the literal
 * msgpack-encoded body) and the signature bytes over it. Shown separately
 * from "decoded payload" so "what is exactly signed" isn't left implicit.
 */
function SignatureAnatomy({ token }: { token: DecodedToken }) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <div>
        <div className="text-xs text-foreground-500 mb-1">
          Signed body (exact bytes the signature covers — msgpack-encoded, base64)
        </div>
        {token.signedBodyBase64 ? (
          <RawToken token={token.signedBodyBase64} />
        ) : (
          <p className="text-xs text-danger-600">Could not unpack — malformed token.</p>
        )}
      </div>
      <div>
        <div className="text-xs text-foreground-500 mb-1">
          Signature (raw bytes, base64
          {token.signatureByteLength !== null ? ` — ${token.signatureByteLength} bytes` : ""})
        </div>
        {token.signatureBase64 ? (
          <RawToken token={token.signatureBase64} />
        ) : (
          <p className="text-xs text-danger-600">Could not unpack — malformed token.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Certificate detail (docs/PAGE_DESIGN.md §1.5's signature-chain view): full
 * raw + decoded payload for both halves of the co-signature, and which key
 * actually verifies each — the concrete, inspectable evidence behind every
 * abstract claim in docs/CERTIFICATE_WEB_OF_TRUST.md.
 */
export default async function CertificateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cert = await CapabilityCertificateDAO.findById(id);
  if (!cert) notFound();

  const principal = await PrincipalDAO.findByDid(cert.agentDid);
  const inspected = await inspectCertificate(
    cert.certificate,
    cert.requestCertificate,
    principal?.publicKey ?? null
  );

  const scope = cert.scope as CertScope | null;
  const resourceLimits = cert.resourceLimits as ResourceLimits | null;

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <PageChrome
        toolbar={{ title: "Certificate" }}
        breadcrumbs={[
          { label: "Certificates", href: "/admin/certificates" },
          { label: id.slice(0, 8) },
        ]}
      />

      <Link
        href="/admin/certificates"
        className="inline-flex items-center gap-1.5 text-sm text-foreground-500 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Certificates
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {principal?.name ?? cert.agentDid}
          </h1>
          <p className="text-xs text-foreground-500 font-mono mt-0.5">{cert.agentDid}</p>
          <p className="text-xs text-foreground-400 mt-0.5">Certificate {cert.id}</p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full border shrink-0 ${STATUS_BADGE[cert.status] ?? STATUS_BADGE.expired}`}
        >
          {cert.status}
        </span>
      </div>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Capabilities</div>
          <div>{(cert.capabilities as string[]).join(", ") || "—"}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Scope</div>
          <div>{scope?.resource ?? scope?.resourcePattern ?? "Standing (unscoped)"}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Issued</div>
          <div>{cert.issuedAt.toISOString()}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Expires</div>
          <div className={cert.expiresAt ? "" : "text-warning-600 font-medium"}>
            {cert.expiresAt ? cert.expiresAt.toISOString() : "Never"}
          </div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Issued by</div>
          <div className="font-mono text-xs">{cert.issuedBy ?? "—"}</div>
        </div>
        {resourceLimits && (
          <div>
            <div className="text-xs text-foreground-500 uppercase font-medium mb-1">
              Resource limits
            </div>
            <div className="text-xs">{JSON.stringify(resourceLimits)}</div>
          </div>
        )}
      </section>

      {cert.status === "revoked" && (
        <section className="border border-danger-200 bg-danger-50 rounded-lg p-4 text-sm">
          <div className="font-medium text-danger-700">Revoked</div>
          <div className="text-danger-600 text-xs mt-1">
            {cert.revokedAt?.toISOString()} by <span className="font-mono">{cert.revokedBy}</span>
          </div>
          {cert.revokedReason && <div className="text-danger-700 mt-1">{cert.revokedReason}</div>}
        </section>
      )}

      {cert.supersededByCertId && (
        <p className="text-sm text-foreground-500">
          Superseded by{" "}
          <Link
            href={`/admin/certificates/${cert.supersededByCertId}`}
            className="text-primary-600 hover:underline font-mono text-xs"
          >
            {cert.supersededByCertId}
          </Link>
        </p>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground-700">Grant (control-plane signed)</h2>
          {inspected.grantVerified ? (
            <span className="flex items-center gap-1 text-xs text-success-700">
              <ShieldCheck className="w-3.5 h-3.5" /> Signature verified
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-danger-700">
              <ShieldAlert className="w-3.5 h-3.5" /> Signature invalid
            </span>
          )}
        </div>
        <div>
          <div className="text-xs text-foreground-500 mb-1">Decoded payload</div>
          <JsonBlock value={inspected.grant.decoded} />
        </div>
        <SignatureAnatomy token={inspected.grant} />
        <div>
          <div className="text-xs text-foreground-500 mb-1">Raw token (wire format — length-prefixed body + signature)</div>
          <RawToken token={inspected.grant.raw} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground-700">
            Embedded request (the co-signature)
          </h2>
          {inspected.requestVerifiedBy === "principal" && (
            <span className="flex items-center gap-1 text-xs text-success-700">
              <ShieldCheck className="w-3.5 h-3.5" /> Signed by the Principal itself
            </span>
          )}
          {inspected.requestVerifiedBy === "control-plane" && (
            <span className="flex items-center gap-1 text-xs text-warning-700">
              <ShieldCheck className="w-3.5 h-3.5" /> Signed by the control plane — system/admin-issued,
              not requested by the Principal
            </span>
          )}
          {inspected.requestVerifiedBy === null && (
            <span className="flex items-center gap-1 text-xs text-foreground-400">
              <ShieldQuestion className="w-3.5 h-3.5" /> Could not verify (no public key on record for
              this Principal)
            </span>
          )}
        </div>
        <div>
          <div className="text-xs text-foreground-500 mb-1">Decoded payload</div>
          <JsonBlock value={inspected.request.decoded} />
        </div>
        <SignatureAnatomy token={inspected.request} />
        <div>
          <div className="text-xs text-foreground-500 mb-1">Raw token (wire format — length-prefixed body + signature)</div>
          <RawToken token={inspected.request.raw} />
        </div>
      </section>

      <p className="text-xs text-foreground-400">
        Status-check history (who has queried this certificate&apos;s live status, and when) isn&apos;t
        persisted yet — see packages/controlplane/CLAUDE.md.
      </p>
    </div>
  );
}
