# VaultysClaw

Agent identity and access control, backed by a ledger of signed capability certificates.

VaultysClaw helps operators see which agents, people, devices and sensors belong to their
organization, grant narrowly scoped access, and suspend or revoke that access when needed.
Clients use VaultysId identities and verify signed certificates through the TypeScript or Go SDK.

## Try the control plane locally

Requires **Docker with Compose 2.24.4+** and **OpenSSL**. Node and pnpm run inside the images;
you do not need to install them on the host for this path.

```bash
git clone https://github.com/vaultys/VaultysClaw.git
cd VaultysClaw
./quick-start.sh --check
./quick-start.sh
```

The first build takes several minutes. Once the services are ready:

1. Open **http://localhost:3010/login**.
2. Choose **Create a VaultysID in this browser**. The first human identity bootstraps the administrator.
3. Follow the overview's guided setup to onboard actors and issue capability certificates.

This local build enables browser identity creation and binds the application ports to loopback.
It has its own database and volumes, separate from deployment, development and simulator stacks.
Credentials are generated once in the ignored `docker/quickstart.env`; subsequent runs keep them.
Back up your browser identity from identity management if you want to use it in another browser.

```bash
./quick-start.sh --logs      # inspect services
./quick-start.sh --down      # stop, keeping data
./quick-start.sh             # start again, reusing data
```

Agent connections use **ws://localhost:8090**. Ports 3010 and 8090 must be available.
If startup fails, the command exits with an error and prints the log command.

For deployment with wallet login and your own configuration, see [Docker setup](docker/DOCKER.md)
and [.env.compose.example](.env.compose.example). The old `install.sh` agent-controller installer
is retired.

## What is included

- **Identity and onboarding:** people, agents, sensors and devices represented as Actors, with ownership and registration approval.
- **Access control:** signed capability certificates, scoped grants, expiry, revocation, custom capabilities and certificate templates.
- **Emergency controls:** organization and workspace kill switches, with human administrators exempt so they can restore access.
- **Operator console:** setup guidance, actor inventory, sensor views, geographic map, relationship graph and audit history.
- **Integrations:** identity providers, model registry, signed webhooks and notification channels through Apprise.
- **Client libraries:** TypeScript and Go SDKs, with shared conformance fixtures for permission and certificate behavior.
- **Workload sensor:** Go process detection, classified telemetry and interception components.
- **Fleet simulator:** real SDK identities and protocol traffic against an isolated control plane.

An SDK permission decision must be enforced by the consuming application or interception point.
Registering an agent alone does not restrict arbitrary processes on its machine.

## Architecture

```text
Admin console + WebSocket server (packages/controlplane)
    ├── PostgreSQL: actors, capability certificates, audit history
    ├── Redis → webhook dispatcher → webhooks / Apprise
    └── TypeScript SDK / Go SDK / workload sensor
         Identity handshake, certificate delivery and signed status refresh

packages/policy: certificate format, signing and verification
packages/trust: permission resolution
```

The current product focuses on identity and trust. The former agent controller, workflow editor
and bundled agent execution tools are no longer part of this repository's supported architecture.

## Guided client demo

Start `pnpm simulator:up` and sign in at **http://localhost:3003/login**. In another terminal,
run `pnpm demo`, then open **http://localhost:3011**. The presenter guides you through approval,
allowed and denied file operations, workspace suspension, recovery and an evidence report.
Administrative actions use the normal console. See the [presenter guide](packages/simulator/GUIDED_DEMO.md).

## Fleet simulation

The simulator uses its own database and ports (**3003 / WebSocket 8083**). The existing fleet
runner supports engineering tests; a separate guided presenter demonstrates
real access decisions with two spotlight agents. See the [guided demo](packages/simulator/GUIDED_DEMO.md).

After completing the [development prerequisites](CONTRIBUTING.md):

```bash
pnpm simulator:up          # keep running in one terminal
# In another terminal, start a small fleet:
pnpm simulator --actors 20 --agents 30 --rate 5 --duration 180 --auto-approve
pnpm simulator stats
pnpm simulator:down        # stop its database, keeping data
```

Open **http://localhost:3003/login** and create a browser identity to bootstrap the first admin.
Stop the foreground control plane with Ctrl+C when finished.
`pnpm simulator:demo` runs the larger 7,000-actor load preset; it is not the default first-run experience.
The simulator omits Redis and notification delivery. See the [simulator guide](packages/simulator/CLAUDE.md)
for ownership, personas, reset behavior and metrics.

## Development and checks

Use the pnpm version pinned in `package.json` and Node.js 22+.

```bash
pnpm install
pnpm dev                       # backing services + migrations + control plane (3001 / 8081)
pnpm controlplane:webhook:dev   # optional dispatcher in a second terminal
pnpm type-check
pnpm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for package tests and Go checks,
[CLAUDE.md](CLAUDE.md) for architecture rules, and the [improvement roadmap](docs/PROJECT_IMPROVEMENTS.md)
for the cleanup and client-demo sequence.

## Community

[Issues](https://github.com/vaultys/VaultysClaw/issues) ·
[Discussions](https://github.com/vaultys/VaultysClaw/discussions) ·
[Security reporting](SECURITY.md) · [MIT license](LICENSE)
