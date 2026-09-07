import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { issuerMismatch, testClientCredentials, testDiscovery } from "@/lib/sso-config";
import { decryptSecret } from "@/lib/vault";
import type { SsoConnection } from "@prisma/client";

/**
 * Is this connection actually usable right now?
 *
 * Rendered on every visit to the connection's detail page, because the alternative
 * is what happened in practice: a connection with a perfectly good issuer and a
 * wrong client secret saved clean, looked configured, and failed only at the token
 * endpoint — as an `OAUTH_CALLBACK_ERROR` in the server log, for whoever clicked
 * the sign-in button first. Nothing in the console said anything was wrong.
 *
 * Deliberately live rather than a stored flag: what breaks a connection is usually
 * a change at the *IdP* (a rotated secret, a deleted client, an expired
 * registration), which this side would never be told about. A stored "healthy"
 * boolean would be reassuring and wrong.
 *
 * This makes two outbound requests per page view, one of them a POST. That is the
 * same trade `LiteLLMPanel` and the integrations health check already make, and the
 * page is admin-gated; it is not on any hot path.
 */
export default async function ConnectionHealth({ connection }: { connection: SsoConnection }) {
  const discovery = await testDiscovery(connection.issuer);
  if (!discovery.ok) {
    return (
      <Panel
        tone="bad"
        title="This connection cannot work"
        detail={`The IdP at ${connection.issuer} did not respond with a usable discovery document: ${discovery.error}`}
      />
    );
  }

  // Independent of everything below: an IdP can be perfectly usable and still
  // disagree with the spec about its own name.
  const mismatch = issuerMismatch(connection.issuer, discovery.documentIssuer) ? (
    <Panel
      tone="warn"
      title="The IdP disagrees with itself about its issuer"
      detail={`Discovery is served from ${connection.issuer} but the document identifies the issuer as ${discovery.documentIssuer}. OpenID Connect Discovery §4.3 requires these to be identical. Sign-in still works today, but stricter clients reject this, and the issuer recorded against each linked identity is the configured value rather than the one the IdP actually uses — worth fixing at the IdP (usually a proxy/TLS-termination setting).`}
    />
  ) : null;

  let secret: string;
  try {
    secret = await decryptSecret(connection.clientSecretEnc);
  } catch {
    // `resolveActiveConnections` drops such a connection from the login page
    // entirely, so this is worth saying plainly rather than reporting as an
    // inconclusive credential check.
    return (
      <>
        {mismatch}
        <Panel
          tone="bad"
          title="This connection cannot work"
          detail="Its client secret could not be decrypted, so no sign-in button is offered for it. Re-enter the secret below."
        />
      </>
    );
  }

  const client = await testClientCredentials(connection.issuer, connection.clientId, secret);

  return (
    <>
      {mismatch}
      {client.verdict === "rejected" ? (
        <Panel
          tone="bad"
          title="The IdP is rejecting these client credentials"
          detail={`${client.detail} Until this is fixed, a sign-in gets as far as the IdP, comes back with a real authorization code, and then fails at the token exchange with "invalid_client".`}
        />
      ) : client.verdict === "inconclusive" ? (
        <Panel
          tone="warn"
          title="Client credentials could not be checked"
          detail={`Discovery is fine, but the token endpoint did not answer in a way this check can read: ${client.detail}. That does not mean the credentials are wrong.`}
        />
      ) : (
        <Panel
          tone="good"
          title="Connection healthy"
          detail="Discovery resolves and the IdP accepts these client credentials. A first sign-in will land on the VaultysID binding step."
        />
      )}
    </>
  );
}

function Panel({
  tone,
  title,
  detail,
}: {
  tone: "good" | "warn" | "bad";
  title: string;
  detail: string;
}) {
  const style = {
    good: { box: "border-success-200 bg-success-50", text: "text-success-700", Icon: CheckCircle2 },
    warn: { box: "border-warning-200 bg-warning-50", text: "text-warning-700", Icon: AlertTriangle },
    bad: { box: "border-danger-200 bg-danger-50", text: "text-danger-700", Icon: XCircle },
  }[tone];

  return (
    <div className={`flex items-start gap-2.5 rounded-lg border p-3 ${style.box}`}>
      <style.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.text}`} />
      <div>
        <div className={`text-sm font-medium ${style.text}`}>{title}</div>
        <p className="mt-0.5 text-xs text-foreground-600">{detail}</p>
      </div>
    </div>
  );
}
