# Security Policy

VaultysClaw is a security-focused platform. We take vulnerabilities seriously and
appreciate the efforts of researchers and users who report them responsibly.

## Supported Versions

VaultysClaw is pre-1.0 and under active development. Security fixes are applied to
the `main` branch. We recommend always running the latest release.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report privately via one of:

- **GitHub Security Advisories** — [open a private advisory](https://github.com/vaultys/VaultysClaw/security/advisories/new) (preferred)
- **Email** — [security@vaultys.com](mailto:security@vaultys.com)

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected components, versions, or commits
- Any suggested remediation

### What to expect

- **Acknowledgement** within 3 business days.
- **Initial assessment** and severity triage within 7 business days.
- **Coordinated disclosure**: we will work with you on a fix and a disclosure
  timeline. Please give us a reasonable window (typically 90 days) before any
  public disclosure.
- **Credit**: with your permission, we will credit you in the advisory and release notes.

## Known Limitations

Some integrations are still hardening their trust boundaries. Until marked
production-ready, treat the following as **not security-complete**:

- **Microsoft Teams bridge** (`packages/control-plane/lib/bridges/teams-gateway.ts`) —
  Bot Framework JWT verification and OAuth token refresh are stubbed. Do not expose
  this bridge to untrusted networks in production.
- **Channel bridge encryption** (`packages/control-plane/lib/channel-bridge-service.ts`) —
  message encryption/decryption hooks are not yet fully implemented.

If you depend on these in production, please open a discussion so we can prioritise.

## Scope

In scope: the control plane, agent controller, agent runtime, MCP gateway, and
shared packages in this repository. Out of scope: third-party dependencies
(report those upstream), demo/simulator credentials clearly marked as insecure
placeholders, and self-inflicted misconfiguration of dev defaults.
