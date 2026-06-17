# Contributing to VaultysClaw

Thanks for your interest in contributing! VaultysClaw is a Zero Trust AI agent
orchestration platform, and we welcome issues, discussions, and pull requests.

By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Getting Started

VaultysClaw is a **pnpm + Turborepo monorepo**.

**Prerequisites:**

- Node.js 22+
- pnpm 10+ (`corepack enable` will pick up the pinned version)
- Docker (used by the test suite to spin up an ephemeral Postgres, and by the demo stack)

```bash
git clone https://github.com/vaultys/VaultysClaw.git
cd VaultysClaw
pnpm install
pnpm vaultysclaw:dev          # control plane (:3000 / ws :8080) + agent controller
```

See the [README](./README.md) for the full quick-start and architecture overview,
and [CLAUDE.md](./CLAUDE.md) for a deep dive into project structure and patterns.

## Development Workflow

1. **Fork** the repo and create a feature branch off `main`:
   `git checkout -b feat/my-change`
2. **Make your change**, following the conventions below.
3. **Validate locally** before pushing:
   ```bash
   pnpm lint
   pnpm type-check
   pnpm test
   ```
4. **Open a pull request** against `main` with a clear description of what and why.
   Reference related issues (e.g. `Closes #123`).

CI runs lint, type-check, and the test suite on every PR — please make sure these
pass. The test suite starts its own Postgres container via Docker, so Docker must
be running locally.

## Conventions

- **TypeScript everywhere.** Match the style of the surrounding code.
- **New REST APIs** must follow the **ts-rest + `APIException`** pattern documented
  in [CLAUDE.md](./CLAUDE.md) (contracts split into `*.schemas.ts` / `*.types.ts` /
  `*.contract.ts`). Contracts are the single source of truth. All API will follow this pattern (need a migration).
- **Adding a tool / skill / WebSocket message** — see the "Key Patterns" section in
  [CLAUDE.md](./CLAUDE.md).
- **Formatting** is handled by Prettier: run `pnpm format` before committing.
- **Tests** — add or update tests for behaviour changes. Tests live in `__tests__/`
  at the repo root and use Vitest.

## Commit & PR Guidelines

- Keep commits focused and write clear messages (imperative mood: "Add", "Fix", "Refactor").
- Keep PRs reasonably scoped; large refactors are easier to review when split.
- Update documentation (README, package READMEs, CLAUDE.md) when you change behaviour.

## Reporting Bugs & Requesting Features

- **Bugs / features**: use the [issue templates](https://github.com/vaultys/VaultysClaw/issues/new/choose).
- **Security vulnerabilities**: **do not** open a public issue — follow
  [SECURITY.md](./SECURITY.md).
- **Questions / ideas**: open a GitHub Discussion.

## License

By contributing, you agree that your contributions will be licensed under the
project's [MIT License](./LICENSE).
