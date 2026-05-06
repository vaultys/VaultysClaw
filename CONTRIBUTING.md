# Contributing to VaultysClaw

Thanks for your interest in contributing! 🙏

## Philosophy

We believe in **shipping early and often**. Your contribution should:
- Be small and focused
- Have clear value
- Include tests when possible
- Be well-documented

## Getting Started

1. Fork the repository
2. Clone your fork
3. Follow [QUICK_START.md](./QUICK_START.md)
4. Check [DEVELOPMENT.md](./DEVELOPMENT.md) for project structure

## Types of Contributions

### 🐛 Bug Reports
- Use [bug report template](./.github/ISSUE_TEMPLATE/bug_report.md)
- Include steps to reproduce
- Include environment details

### ✨ Features
- Use [feature request template](./.github/ISSUE_TEMPLATE/feature_request.md)
- Explain the problem it solves
- Start small

### 📚 Documentation
- Grammar/clarity improvements
- Examples and tutorials
- API documentation
- Architecture diagrams

### 🔒 Security
- Report security issues privately (see [SECURITY.md](./SECURITY.md))
- Do NOT open public GitHub issues for vulnerabilities

### ♻️ Code Improvements
- Performance optimizations
- Refactoring
- Test coverage
- Type safety improvements

## Development Workflow

1. **Create an issue** or comment on existing issue
2. **Get assigned** or just start working
3. **Create a branch**: `git checkout -b feature/my-feature`
4. **Make changes** following code style
5. **Test locally**: `pnpm build && pnpm type-check`
6. **Format code**: `pnpm format`
7. **Commit with clear message**: `git commit -m "feat: describe what changed"`
8. **Push branch**: `git push origin feature/my-feature`
9. **Create Pull Request** with description
10. **Respond to review feedback**

## Code Style

We use:
- **TypeScript** strict mode
- **Prettier** for formatting
- **ESLint** for linting
- **Tailwind CSS** for styles

### Format & Lint

```bash
pnpm format     # Auto-fixes formatting
pnpm lint       # Checks code quality
pnpm type-check # TypeScript checking
```

Commit hooks should auto-format if configured.

## Commit Messages

Follow conventional commits:

```
type(scope): description

[optional body]
[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code refactoring (no functionality change)
- `perf`: Performance improvement
- `test`: Adding tests
- `chore`: Dependencies, build config, etc.

Examples:
```
feat(agent-controller): add support for OpenAI API
fix(control-plane): prevent policy downgrade attacks
docs: improve quick start guide
refactor(shared): extract security verification to util
```

## Scope

Keep changes focused. Large changes should:
1. Be discussed in an issue first
2. Be broken into smaller PRs
3. Reference the issue

## Testing

While we don't have a test suite yet, when adding features:
- Manually test the functionality
- Try edge cases
- Break the code and fix it
- Document your testing in PR

Once we add testing:
- Write tests for new features
- Maintain >80% coverage
- Test both happy path and errors

## Documentation

For new features, update:
- Inline code comments (especially complex logic)
- Relevant markdown docs
- TypeScript types/interfaces
- API documentation if adding endpoints

## Monorepo Considerations

This is a pnpm monorepo. Remember:

```bash
# Add dep to one package
pnpm add axios -F @vaultysclaw/agent-controller

# Add dev dep
pnpm add -D @types/express -F @vaultysclaw/agent-controller

# Run script in one package
pnpm dev -F @vaultysclaw/control-plane

# Lint specific package
pnpm lint -F @vaultysclaw/shared
```

## What NOT to Do

- ❌ Don't commit node_modules
- ❌ Don't commit .env files
- ❌ Don't mix unrelated changes in one PR
- ❌ Don't skip TypeScript by using `any`
- ❌ Don't add dependencies without discussion
- ❌ Don't break existing functionality

## Review Process

Your PR will be reviewed for:
- ✅ Does it work?
- ✅ Is it secure?
- ✅ Is it maintainable?
- ✅ Does it follow the style guide?
- ✅ Are there tests?
- ✅ Is it well documented?

Be responsive to feedback. Reviews help make the project better!

## Need Help?

- Check existing issues and discussions
- Read project documentation
- Ask in PR comments
- Reach out to maintainers

## Recognition

Contributors are:
- Added to CONTRIBUTORS file
- Mentioned in release notes
- Recognized in discussions

## That's It!

Thank you for contributing to VaultysClaw. Every contribution matters! 🚀

---

## Quick Reference

```bash
# Setup
git clone https://github.com/yourusername/VaultysClaw.git
cd VaultysClaw
pnpm install

# Development
pnpm dev -F @vaultysclaw/control-plane  # Terminal 1
pnpm dev -F @vaultysclaw/agent-controller # Terminal 2

# Quality checks
pnpm format
pnpm lint
pnpm type-check

# Build
pnpm build

# Create feature branch
git checkout -b feature/my-feature

# Commit and push
git add .
git commit -m "feat(scope): description"
git push origin feature/my-feature

# Create PR on GitHub
# → Describe your changes
# → Link any related issues
# → Wait for review
```

Happy coding! 😊
