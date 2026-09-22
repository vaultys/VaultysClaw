# Contributing to VaultysClaw

VaultysClaw is an agent identity and trust platform, organized as a pnpm/Turborepo monorepo
with two Go modules. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

- Node.js 22+ and the exact pnpm version in the root `package.json` (`packageManager`).
- Docker with Compose for PostgreSQL, Redis and Apprise.
- Go matching each module's `go.mod`, if working on the SDK or sensor.

```bash
pnpm install
pnpm dev
```

This starts the development backing services, builds the control plane's workspace dependencies,
applies migrations and starts the control plane at http://localhost:3001 (WebSocket 8081).
The backing services use ports 5433, 6381 and 8000. For webhook delivery, run
`pnpm controlplane:webhook:dev` in another terminal, using the same database as the control plane.
Stop the app with Ctrl+C and the services with `pnpm controlplane:docker:down`.

For a local evaluation without host Node/pnpm, use `./quick-start.sh` instead; see the [README](README.md).
`pnpm doctor` checks prerequisites for that Docker-based setup, not the entire development toolchain.

## Verification

```bash
pnpm type-check
pnpm test
python3 -m unittest discover -s scripts/tests -v
```

Package tests live under each package's `__tests__` directory. The root `__tests__` directory
contains historical tests against removed packages and is not run by `pnpm test`.
Do not add new tests there; see the [cleanup inventory](docs/PROJECT_IMPROVEMENTS.md).

For Go changes, run `go vet ./...` and `go test -race -count=1 ./...` from the affected module
(`sdk-go` or `vaultysclaw-sensor`). Changes to shared `conformance/` fixtures require both
TypeScript and Go checks. `-count=1` prevents Go's cache from hiding fixture changes outside its module.

CI checks TypeScript types, package tests, both Go modules and Docker builds. The Docker workflow
also starts the isolated quick-start stack and checks service readiness. Package unit tests do not
require a running database. Repository-wide lint configuration still needs modernization;
`pnpm lint` is not currently a CI gate.

## Conventions

Read [CLAUDE.md](CLAUDE.md) and the relevant package's guidance before changing behavior.
Keep `policy` and `trust` free of I/O. Authorize mutating server actions themselves, and use the
shared event catalog and payload helpers when adding audit events or notifications.

Keep changes focused, preserve meaningful behavior coverage, and update documentation alongside
changes to commands or user flows. Format changed files with Prettier where applicable.

Report bugs through [GitHub Issues](https://github.com/vaultys/VaultysClaw/issues).
For vulnerabilities, follow [SECURITY.md](SECURITY.md).
Contributions are licensed under the project's [MIT License](LICENSE).
