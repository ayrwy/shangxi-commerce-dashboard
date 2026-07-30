# Agent Guide

## Scope

- Runtime source lives in `src/`; use `vite.config.ts` as the only Vite config source.
- Do not read `docs/archive/` unless the task explicitly concerns project history or an archived plan.
- Treat `docs/current/PROJECT_PLAN.md` as product context, not as implementation truth; verify behavior in code and tests.
- Ignore generated directories and files listed in `.rgignore`.

## Verification

- Run `npm test` after logic changes.
- Run `npm run build` after source, config, or dependency changes.
- Preserve browser-only CSV processing and confirmed-relationship safeguards unless a task explicitly changes them.

## Editing

- Do not edit generated `vite.config.js`, `vite.config.d.ts`, `*.tsbuildinfo`, `dist/`, or `.test-dist/` artifacts.
- Keep secrets in `.env`; never place API keys in source or documentation.
