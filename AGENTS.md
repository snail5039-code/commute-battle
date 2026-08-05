<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Commute Battle App Notes

## Harness
- App root: `commute-battle/`
- Dev server: `npm run dev`
- Build check: `npm run build`
- Lint check: `npm run lint`
- Claude compatibility file: `CLAUDE.md` points back to this `AGENTS.md`; keep shared agent instructions here so Claude and Codex see the same project rules.

## Runtime
- Next.js `16.3.0`, React `19.2.8`, Tailwind CSS `4`, ESLint `9`.
- Supabase config and public browser keys are loaded from `.env.local`.
- Gemini integration lives in `lib/gemini.ts`.

## Working Rules
- Do not run `vercel --prod`; deployment is expected to happen from GitHub/Vercel integration.
- Prefer focused fixes that match the existing component and library style.
- Avoid editing generated artifacts such as `.next/`, `next-env.d.ts`, `tsconfig.tsbuildinfo`, and `node_modules/`.
- OneDrive can lock `.next/`; if builds fail with cache lock errors, report it instead of deleting cache without explicit permission.

## Visible Task Delegation
- When the user requests work to be split into sessions, create user-visible Codex tasks that appear in the sidebar; do not rely only on invisible internal delegation.
- Assign each child task explicit owned files, acceptance criteria, and verification commands, and avoid overlapping ownership.
- The primary task must review and integrate all results, run lint/build and functional checks, reassign failures, and only then commit and push.
- Keep task creation, progress, test failures, fixes, and Git results visible to the user.
- Child tasks must not request user approval or perform approval-gated actions. They should stop after implementation and safe local verification, then report any required command or permission to the primary task.
- The primary task collects every child result, resolves all issues, and presents approval-gated actions as one consolidated final approval request to the user.

## Free-First Principle
- Prefer free and open-source fonts, libraries, APIs, assets, and service tiers.
- Never add paid-only or billing-required dependencies, APIs, services, or assets without the user's explicit approval.
- Confirm required third-party features work on a free tier and provide a no-cost fallback whenever practical.
