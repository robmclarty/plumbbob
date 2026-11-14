# Built-in agents

The agents PlumbBob ships. An agent here resolves by name like any other, in the last
tier: a project agent of the same name (`.plumbbob/agents/<name>/`) or a personal one
(`~/.plumbbob/agents/<name>/`) is used in its place, so what ships here is a default and
never an override.

Nothing ships here yet. This file is the only thing in the directory, and it is never read
as an agent: an agent is a subdirectory holding an `agent.json`.

The directory is `builtin-agents/` and not `agents/` because Claude Code reads a plugin's
`agents/` as subagent definitions.

The contract an agent speaks, and the order the tiers resolve in, are in
[`docs/agents.md`](https://github.com/robmclarty/plumbbob/blob/main/docs/agents.md#where-agents-live-resolution).
