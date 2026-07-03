<!--
build-log.md — your live ledger for execution. Append constantly; reorganize at
step boundaries. The antidote to "my plan got lost in the noise."

  Steps     : where you are. One step in flight at a time.
  Park list : where ideas go so you do not chase them. CAPTURE, never act inline.
  Harvest   : the boundary ritual that keeps you on one branch.
  Log       : the audit trail. Feeds the /pb-wrap report, then gets archived.
-->

# Build log — Ship plumbbob as an npm package + `plumbbob init` (in-place plugin)

**Current step:** 1 (SPIKE) — done, verdict recorded · **STATE:** DESIGN
**Heavy check:** pnpm run check

## Steps

*(Mirror of intent.md's Steps, with live status. Only ONE step is in flight. A step
is done only after a checkpoint — check green + checkpoint taken, via `/pb-verify` or
`/pb-build`.)*

- ☑ 1. SPIKE — validate in-place skills-dir plugin (namespace + hook + bin). **PASS (global, end-to-end); project scope trust-gated.**
- ☑ 2. Add the real plugin manifest (`.claude-plugin/plugin.json`)
- ☑ 3. Rename skills `pb-*` → bare verbs; drop `__PLUMBBOB_BIN__`
- ☑ 4. Convert the hook to `hooks/hooks.json`
- ☑ 5. Replace `setup` with `plumbbob init`
- ☑ 6. README + docs lead with the npm + `init` flow
- ☐ 7. Rework `dev-install.sh` for the plugin model

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/pb-park` composes it). Harvest happens only at the boundary.
- [x] (resolved step 3) pb-plan & pb-verify frontmatter: unquoted ': ' in description = invalid YAML; plugin loader silently drops ALL metadata incl. disable-model-invocation. Fixed by quoting the two descriptions; `claude plugin validate .` clean.
- [x] (resolved step 6) CLI status hints (orient.ts) + templates + README/docs said /pb-X — swept /pb-X -> /plumbbob:X across orient.ts, verbs, templates/, README, happy-path; zero /pb- left.

## Harvest  *(run `/pb-harvest` at each step boundary, after green)*

Classify each parked item as exactly ONE. Naming it before acting is what keeps you
from sprawling across branches.

| Class            | Meaning                                   | Action                          |
|------------------|-------------------------------------------|---------------------------------|
| **blocker**      | Plan was wrong/incomplete; can't proceed  | `/pb-revert`, fold into intent  |
| **tangent**      | A different path, not clearly better      | Defer or kill. Default here.    |
| **pivot signal** | Evidence the whole approach is wrong      | Stop. Replan deliberately.      |

> Reality check: almost everything that *feels* like a pivot is a tangent. Require a
> failed assumption, not a shinier idea, before you pivot.

Harvest results this boundary:

- (none yet)

## Log

*(Append-only. One decision or event per line, dated. What you point at to say "I
did that — the LLM helped, but those were my calls." `/pb-wrap` reads this for the
report; `plumbbob wrap` archives it under `.plumbbob/archive/`.)*

- 2026-06-26 — Step 1 SPIKE done. Built a throwaway `plumbbob-spike` plugin
  (`.claude-plugin/plugin.json` + `skills/plan` + `hooks/hooks.json` + `bin/`),
  symlinked into `~/.claude/skills/` (global) and `<repo>/.claude/skills/` (project).
  Evidence on **claude 2.1.185**:
  - `claude plugin validate` ✔; `claude plugin list` recognized `plumbbob-spike@skills-dir`;
    `claude plugin details` inventoried **Skills(1) plan + Hooks(1) PostToolUse** → the
    local-path "0 skills" bug did NOT occur.
  - **GLOBAL scope = end-to-end PASS:** a headless `claude -p` edit FIRED the PostToolUse
    hook (marker written), and a bare `plumbbob-spike-probe` RESOLVED (plugin `bin/` on the
    Bash PATH).
  - **PROJECT scope = trust-gated:** `claude plugin list` does NOT surface the cwd
    `.claude/skills/` plugin outside a trusted interactive session, and the headless hook
    did not fire. Same mechanism as global; needs a trusted interactive session.
  - **Verdict:** the npm + `plumbbob init` symlink → in-place skills-dir plugin recipe
    WORKS (global proven end-to-end). Implication for step 5: `plumbbob init` should
    **default to GLOBAL** (robust, no trust gate); `--project` is supported but trust-gated
    — its output must tell the user to trust the workspace, and the per-project hook wants
    one interactive confirmation before we rely on it. Spike artifacts cleaned up.
- 2026-06-26 — Decided **global-only install** (dropped `--project`/`--local`). plumbbob
  is a personal tool (like firecrawl/`gh`), not a project dependency; **install scope ≠
  session scope** — sessions stay per-project via `plumbbob start`. Collapses `init`/
  `doctor` to one scope and sidesteps the project trust-gate the spike found. Revised
  D1/D6/step 5; the step-1 "default to global / --project warns" implication is now moot
  (no `--project` at all).
