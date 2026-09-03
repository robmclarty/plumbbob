# Security

## Reporting a vulnerability

Please report suspected vulnerabilities privately, not in a public issue:

- **GitHub**: [private vulnerability reporting](https://github.com/robmclarty/plumbbob/security/advisories/new)
  on this repository, or
- **Email**: <hello@robmclarty.com>.

You'll get an acknowledgement within a few days. Only the latest published release is
supported with fixes.

## What PlumbBob executes on your machine

PlumbBob is a local tool with a deliberately small execution surface. Everything below
runs on your machine, in your repo; the CLI makes **no network calls** and collects **no
telemetry**.

- **The CLI** (`plumbbob` / `pb`) shells out to `git`, additively only: it stages,
  commits forward, and `reset --hard`s exclusively to SHAs it recorded itself; it never
  rewrites pushed history. Spikes create and remove git worktrees and `spike/*` branches.
- **The check gate** runs [checkride](https://www.npmjs.com/package/checkride) (the one
  runtime dependency, pinned exact) in-process, which in turn runs the dev tools your
  repo already configures.
- **The `"check"` override is a shell command.** If `.plumbbob/settings.json` sets a
  `check` key, that string is spawned verbatim through a shell at every `plumbbob check`
  and `checkpoint`. That file is **tracked**, so treat a PR that touches it like a PR that
  touches CI config: review the command before you run the gate on that branch.
  (`settings.local.json` can override it per-worktree and is never committed.)
- **The post-edit hook** (`hooks/post-edit.sh`) runs only inside a repo with an active
  build, only on source-file edits, and only executes `oxlint` and `ast-grep` from that
  repo's own `node_modules/.bin` when they exist. It never blocks an edit and always
  exits 0.
- **The commit ask-hook** (`hooks/pre-bash-commit.sh`) runs before each Bash tool call
  while a step is in flight. When the command is a raw `git commit`, it answers Claude
  Code's permission prompt with *ask*, so you decide; it never denies, never rewrites the
  command, and exits 0 in every other case.
- **The turn hook** (`plumbbob turn`, on `UserPromptSubmit`) runs once per prompt you
  send in a repo with an active session. It increments a counter file (`.plumbbob/TURN`),
  mints a one-turn self-approval (`.plumbbob/GRANT`) only when your own prompt was
  `/plumbbob:build --auto` or a step range, and may inject one line of context. It always
  exits 0.
- **`plumbbob init`** creates one symlink (`~/.claude/skills/plumbbob`) and never writes
  Claude Code's `settings.json`.

Everything PlumbBob writes (intent, logs, checkpoints, reports) is plain markdown and
plain text inside your repo's `.plumbbob/` folder, readable and editable by hand. What
the *model* does during a session is governed by Claude Code's own permission system, not
by PlumbBob; the skills declare narrow `allowed-tools` scopes but are guidance, not a
sandbox.
