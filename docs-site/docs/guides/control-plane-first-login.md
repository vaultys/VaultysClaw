---
sidebar_position: 2
title: Control Plane First Login
description: Sign in to a freshly bootstrapped control plane and approve your first agent.
---

# Control Plane First Login

This guide picks up right after `./quick-start.sh` finishes bootstrapping your local Docker stack (Postgres + Redis + LiteLLM + Control Plane). It walks you through signing in for the first time and approving your first agent.

## 1. Open the control plane

Once the script reports the control plane is up, open [http://localhost:3000](http://localhost:3000) in your browser.

## 2. Sign in without the VaultysId app

For local testing, you can sign in **without the VaultysId app** — a simplified, fast way to get going. This is **less secure** and should **not be used in production**; it's ideal for testing the solution.

You'll also be offered **Software** security (no passkey, no hardware key) — again, less secure, but simpler and faster to set up.

:::danger Local testing only
Anyone with access to this browser can sign in with this method. Use it only for local testing — never on a public or production deployment.
:::

<video controls playsInline preload="metadata" style={{ width: "100%", borderRadius: "12px" }}>
  <source src="/video/login-quick-start.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

*Logging in without the VaultysId app.*

The first user to sign in automatically gets global admin.

## 3. Approve your agent

Once your agent controller (`pnpm agent:dev`) has connected and registered:

1. Navigate to **Agents** → **Pending Registrations**
2. Click **Approve** on your agent, selecting the capabilities to grant

The agent will immediately receive its signed policy and become active.

## Next steps

- [Quick Start](/docs/guides/quickstart) — the full walkthrough, from cloning the repo to sending your first intent
- [Configuration reference](/docs/guides/configuration) — all environment variables explained
- [Security model](/docs/security/security-model) — how VaultysId, policies, and capabilities fit together
