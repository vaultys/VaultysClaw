---
sidebar_position: 6
title: Workspaces
description: The tenancy boundary — members, scoped access, confinement templates, and per-workspace policy.
---

# Workspaces

A workspace is the tenancy boundary. It scopes Actors, certificates, model
access, confinement templates, and — since they can be set per workspace — trust
policy and the [kill switch](/docs/guides/kill-switch).

Membership is not a membership table: it is
[certificates scoped to `workspace:<id>`](/docs/guides/issuing-certificates#workspace-scoped-grants).

## The tabs

| Tab | What it holds |
|---|---|
| **Overview** | Counts, and the **effective** trust policy — read-only |
| **Actors** | Assign or remove Actors |
| **Access** | Humans holding a `workspace:<id>` grant, with a deep link to issue one |
| **Confinement** | The confinement templates attached to this workspace |
| **Settings** | Every mutation: kill switch, trust policy, identity, delete |
| **Budgets & Model Access** | Not built yet |

Overview shows the state; Settings changes it. That split is why the Overview
trust-policy card is read-only and links one tab across rather than duplicating
the form.

## Per-workspace trust policy

Both [trust policy](/docs/concepts/trust-verification#trust-policy-fail-mode-and-staple-ttl)
knobs — **fail mode** and **staple TTL** — have an org-wide default under
Settings, and a workspace may override either of them.

**Inheritance is per field.** A workspace can pin its own fail mode and keep
following the org on staleness. Each field on the Overview tab carries an
*inherited* or *overridden* badge saying which level the effective value came
from.

:::caution "Inherit" and "0" are different things
Leaving a field empty means inherit. A stored `0` staple TTL is a real value, and
it is the **strictest** one — "no cached status is acceptable". Do not clear a
field expecting to loosen it; clearing it hands the decision back to the org-wide
setting, which may itself be `0`.
:::

The most **specific** scope wins here, which is the opposite of the kill switch,
where an armed global switch short-circuits every workspace. Trust policy is
configuration; a kill switch is an emergency brake.

**Saving re-pushes immediately.** Changing a workspace's policy pushes new
configuration to that workspace's connected Actors; changing the org-wide default
pushes to all of them. Offline Actors pick it up on reconnect. A recipient never
learns the word "workspace" — it receives one already-resolved pair.

## Confinement templates

A template is a reusable set of tier-B confinement settings — the sandbox
settings a supervised harness launches under. Manage the templates themselves
under Certificates → Confinement templates; attach them to a workspace from its
**Confinement** tab.

- A workspace can have **several** templates attached.
- At most **one** is marked **Default**, and that is the one pre-selected on the
  issuance form for an Actor in that workspace.
- On the issuance form, a workspace's templates are **sorted first**, never
  filtered — every template stays selectable, because an admin may legitimately
  want one from elsewhere.

:::caution A template grants nothing and enforces nothing
It only pre-fills the issuance form. The **signed certificate** records what the
admin actually submitted, which may differ from the template, and editing a
template afterwards changes no certificate already issued.
:::

## Deleting a workspace

The **default** workspace cannot be deleted. Deleting any other one revokes the
certificates scoped to it first, then removes the workspace; its Actors survive,
simply unassigned. Nothing about the Actors themselves is deleted — "delete this
workspace" must not quietly mean "delete the agents in it".

Deletion matches scoped certificates **narrowly** — the certificate's own
workspace and a `workspace:<id>` scope, but not an Actor's mere workspace
assignment. A kill switch deliberately matches more widely.

The asymmetry is the point: one is reversible, the other revokes for good.
