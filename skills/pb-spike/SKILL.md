---
name: pb-spike
description: Human-triggered driver for `plumbbob spike` — open a throwaway worktree experiment for a genuine fork, scaffold a spike report for a spike-as-step, or tear it down with `spike done`.
argument-hint: "<slug> | report <slug> | done"
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*), Bash(plumbbob spike:*)
---

# PlumbBob — spike an experiment (driver)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

This is a **driver skill** — a chat-side trigger for the mechanical `plumbbob spike` verb, so the whole workflow runs from the agent window instead of a terminal. It is `disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write tool** — its only action is to shell the verb and report the verb's output verbatim, including any refusal. The CLI is the source of truth: never retry a refused transition, and never edit a file to work around one.

## What it does

1. Read the spike target from the way you were invoked: a slug to open one (e.g. `/pb-spike redis-cache`), `report <slug>` to scaffold a report without worktrees (`/pb-spike report auth-store`), or the literal `done` to tear the current spike down (`/pb-spike done`). If none is present, ask which and run nothing.
2. Run `plumbbob spike "<slug>"`, `plumbbob spike report "<slug>"`, or `plumbbob spike done` via Bash.
3. Report the verb's output verbatim — the worktree it created or removed, the spike report it scaffolded, or any refusal. When the verb names a `spike-NN-<slug>.md` report, point the human at it; when `spike done` nudges that a verdict is unrecorded, relay that nudge verbatim.

## The spike report (D70)

Every spike leaves a durable `spike-NN-<slug>.md` in the build folder, beside `intent.md`/`report.md`, so the fork's verdict rides the branch into the PR instead of evaporating. The CLI scaffolds it from a template and numbers it — you never create or number the file:

- **`/pb-spike <slug>`** scaffolds the report *at open*, so findings accrue while the throwaway worktrees are still live. Fill its **Findings** and **Verdict** before `/pb-spike done`.
- **`/pb-spike report <slug>`** is for a *spike-as-step* — a planned step titled `spike: …`, where the increment itself is the experiment and there are no worktrees. It stamps the report's provenance as `step <n>` when a step is in flight.

This skill stays Write-less: the CLI owns the file. Your job is to run the verb and, between runs, help the human fill the report's prose — but the edits land through the normal build flow, not this driver.
