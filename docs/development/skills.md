# Codex Skills

Last reviewed: 2026-07-14

## Installed Skill

| Skill | Source | Version | Purpose | Project Application |
| --- | --- | --- | --- | --- |
| `security-best-practices` | `openai/skills`, `skills/.curated/security-best-practices` | `main` (un-pinned at installation) | Secure-by-default guidance and security review support for JavaScript/TypeScript web applications. | Applies to React frontend code and NestJS backend code. It informs future work on JWT/RBAC, input validation, secret handling, error responses, file uploads, and unsafe rendering. |

The skill is installed in Codex's standard user skill directory, not in this repository. It does not add runtime dependencies, change database state, or execute project scripts by itself.

## Project Tooling

| Tool | Source | Version | Purpose | Project Application |
| --- | --- | --- | --- | --- |
| `CodeGraph` | `colbymchenry/codegraph` | `1.4.1` | Local semantic code graph and Codex MCP server. | The repository index is stored in `.codegraph/` and automatically stays in sync with supported source files. Codex can query structure, call paths, and change impact through the configured MCP server. |

CodeGraph is configured globally for Codex because its installer does not support project-local Codex MCP configuration. The graph database remains project-local and is excluded from Git by `.codegraph/.gitignore`. Telemetry is disabled.

To refresh the graph manually, run `codegraph sync` from the repository root. To remove only this repository's graph, run `codegraph uninit`; to remove the Codex integration and CLI, run `codegraph uninstall`.

## Project-Local UI Skill

| Skill | Source | Purpose | Project Application |
| --- | --- | --- | --- |
| `shadcn` | `shadcn/ui` via Skills CLI | Project-aware shadcn/ui and Tailwind CSS workflow guidance. | Reads `apps/web/components.json` so UI work follows the configured Vite, Tailwind CSS v4, `radix-nova`, Lucide, and `@/*` alias conventions. |

The skill is stored at `.agents/skills/shadcn`. It guides component discovery, documentation lookup, safe CLI usage, Tailwind semantic tokens, accessibility, forms, and composition. It does not add UI components until a feature explicitly needs them.

## Skills Evaluated

| Skill or Capability | Decision | Reason |
| --- | --- | --- |
| `security-best-practices` | Installed | Directly supports the TypeScript React/NestJS stack and the project's authentication and authorization model. |
| `implement`, `tdd`, `code-review`, `diagnosing-bugs`, `research` | Already available in the Codex environment | Useful workflows for implementation, testing, review, diagnosis, and documentation; no duplicate installation is needed. |
| `playwright` | Deferred | Browser E2E automation is useful later, but the repository does not yet define a browser-test workflow. |
| Figma, deploy, ASP.NET, cloud, and productivity skills | Not selected | They do not directly support the current React/NestJS modular-monolith work. |

## Applied Rules

- Use secure defaults when writing or changing React and NestJS code.
- Keep secrets out of source control and out of browser-visible Vite variables.
- Treat request, URL, storage, and remote API values as untrusted at trust boundaries.
- Enforce authorization on the backend using permission, scope, and workflow status.
- Prefer safe JSX rendering; do not introduce raw HTML rendering without a reviewed sanitizer.
- Keep production error responses generic and avoid logging tokens, passwords, or environment values.
- Tailwind CSS v4 and shadcn/ui are configured in `apps/web`; use the `@/*` aliases and add shadcn components through its CLI as needed.

## Deferred Or Not Applied

- A full security audit and code fixes were not performed: this task installs and documents skills, not a vulnerability-remediation request.
- CSP, security headers, reverse-proxy controls, rate-limit infrastructure, and deployment TLS settings are not configured here because their correct values depend on the deployment environment.
- TanStack Query, React Hook Form, and Zod are not currently dependencies of `apps/web`; their conventions remain conditional until they are adopted.
- No code, API contract, database schema, migration, or BSC workflow behavior was changed.

## Update And Removal

Update from the official source with the Codex skill installer:

```powershell
python "$env:USERPROFILE\\.codex\\skills\\.system\\skill-installer\\scripts\\install-skill-from-github.py" --repo openai/skills --path skills/.curated/security-best-practices
```

The installer does not overwrite an existing skill directory. Review the upstream `SKILL.md`, remove the existing `security-best-practices` directory deliberately if an update is required, then rerun the installer.

To remove the skill, delete only the Codex user skill directory `~/.codex/skills/security-best-practices`. This repository has no vendored skill files to remove.

Restart Codex after installing, updating, or removing skills so it can load the change.
