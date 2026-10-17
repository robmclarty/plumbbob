<!--
spike-report.md: the durable receipt for a spike (a fork the plan couldn't settle
on paper). One per spike, numbered and named `spike-NN-<slug>.md`, riding the build
folder into the PR beside intent.md / report.md. Fill it while the experiment is
live; the worktrees and their learnings are torn down at `spike done`, but this stays.

Two ways a spike is born, both landing here:
  - `/plumbbob:spike <slug>`: an explicit mid-build fork with throwaway worktrees.
  - a planned step titled `spike: …`: the increment IS the experiment.
Record the Verdict before you close the spike (or check off the step).
-->

# Spike: stop-hook

**Via:** step 12
**Opened:** 2026-10-17

## Question

Step 15's Stop check rests on three things the plan could not verify on paper: that a
turn's final text is readable when Stop fires, that Stop honors the outputs the plan
names, and that `TURN` has ticked by then under `claude -p`. Each answer moves a
decision. Unreadable text reopens D16 (block-once); a stdin field moves step 15's read
off the transcript; a late tick breaks D13 (gate-on-the-turn) for every scripted session.
Three more questions ride along: what the human sees when a block lands, how plumbbob's
Stop hook and checkride's behave together, and whether `stop_hook_active` is set on the
continuation.

## Options tried

- **One probe for every hook.** All runs used Claude Code 2.1.283 in throwaway repos
  under `/tmp/pb-stop-spike.2gFg` ([C6 (dogfood-in-a-temp-repo)](intent.md#c6)). A
  small Node script stood in for each hook. It saved its stdin, copied the transcript as
  it stood at that instant, read `.plumbbob/TURN`, and answered from a mode file:
  nothing, a block, a `systemMessage`, `continue: false`, `additionalContext`, or exit 2.
- **Headless.** `claude -p --output-format stream-json --verbose --include-hook-events
  --setting-sources project,local --strict-mcp-config`, on Haiku for the protocol probes
  and on Sonnet and Opus for the empty-ending probe. The prompt went in both as an
  argument and on stdin; stdin is how fascicle's `claude_cli`, the eval driver, sends it.
- **Interactive.** The TUI ran under `expect` in a 110 by 50 pty, and its screen log was
  flattened to text. The parent session's `CLAUDE_*` variables were stripped first: one
  run that inherited them never wrote a transcript at all, so only stripped runs count.
- **The pair.** A probe plugin loaded with `--plugin-dir` (where plumbbob's Stop entry
  would ship) sat beside a project-settings Stop hook (where `checkride agent-setup`
  writes the gate). First both were probes answering in checkride's exact body shape.
  Then the project hook was the real gate: checkride 0.12.5's `checkride-gate.sh`, wired
  as `ea979ab` last had it, in front of a `check` script that fails on purpose.
- **The turn ledger.** A repo with a plumbbob session (`node src/cli.ts start`) had
  `node src/cli.ts turn` on UserPromptSubmit, which is the plugin's wiring minus the
  `dist` shim.

Where this machine wires checkride's Stop hook: nowhere live. This repo dropped it on
2026-09-01 (`ea979ab`) and left the script unwired under `.claude/hooks/`. A consumer
repo gets the gate in its tracked `.claude/settings.json` from `checkride agent-setup`,
so plumbbob's plugin hook and checkride's always live in different scopes, and both run.

## Findings

### 1 The final text rides on stdin, and the transcript lags it

Stop's stdin carries the final message's text as `last_assistant_message`, under `-p`
and interactively alike. Run A, `-p`, asked for one line:

```json
{
  "session_id": "cee6ec8e-dc55-4b13-b543-bbaa8f1991ed",
  "transcript_path": "/Users/robmclarty/.claude/projects/-private-tmp-pb-stop-spike-2gFg-repo/cee6ec8e-….jsonl",
  "cwd": "/private/tmp/pb-stop-spike.2gFg/repo",
  "prompt_id": "1c9f57f6-cabc-4d9c-9d4e-5a6f5e3e0c40",
  "permission_mode": "default",
  "hook_event_name": "Stop",
  "stop_hook_active": false,
  "last_assistant_message": "PROBE-A-FINAL",
  "background_tasks": [],
  "session_crons": []
}
```

The transcript does not hold that text when Stop fires. Run A's snapshot, taken as the
hook started, had 18 lines and no assistant entry, though the entry the file gained
later is stamped 65 ms before the hook ran. A probe that waited 1.5 s before reading
(run B2) found the text there. Interactive runs lag the same way: in run I2 the first
Stop's snapshot had no assistant text, and the second's held the first reply but not the
retry. The hooks reference now says so and points at the field: "the transcript may not
include the final message at Stop time."

The field holds the last assistant message and nothing earlier. Run B wrote
`PROBE-B-BEFORE`, made a tool call, then wrote `PROBE-B-FINAL`; the field read
`PROBE-B-FINAL` alone, while the snapshot's last text was `PROBE-B-BEFORE`. Markdown
arrives raw, fences and line breaks included. Only the final message lags; everything
before it is on disk by Stop. A reader that needs the whole turn (D15 (tier-picks-the-match)'s
boundary tier) can take every entry from the human prompt whose `promptId` matches the
payload's `prompt_id` and append the field. User entries carry `promptId`; assistant
entries do not, but follow them in order.

A turn that ends with no text no longer reaches Stop empty. Run N-opus ended on a
thinking-only message, and before Stop fired the harness added a synthetic user turn,
`[Your previous response had no visible output. Please continue and produce a
user-visible response.]`. The model answered it, and that answer became
`last_assistant_message`. Haiku and Sonnet would not end silently at all. The "no visible
text" failure #5 saw now comes back as some text, which is still a turn that missed its
relay.

### 2 Which outputs Stop honors

| Output | Continues | What the model gets | What the human sees |
| ------ | --------- | ------------------- | ------------------- |
| `decision: "block"` and `reason` | yes | a meta user turn, `Stop hook feedback:` then the reason | `Stop hook error:` then the reason, and an error footer |
| exit 2 and stderr | yes | the same, prefixed `[<command>]: ` | the same |
| `hookSpecificOutput.additionalContext` | yes | the context, as an attachment | `Stop hook feedback:` then the context, no footer |
| `systemMessage` | no | nothing | `Stop says:` then the message |
| `continue: false` and `stopReason` | no | nothing | nothing new; the turn was ending |

Stop accepts `additionalContext` (the debug log reads `provided additionalContext (62
chars)`), and it does more than #5's fallback assumed: it continues the turn just as a
block does. The reference documents it as "non-error guidance. The conversation
continues, but the transcript labels it Stop hook feedback instead of showing a hook
error." Run F returned it on every Stop with no `stop_hook_active` guard, and the harness
ended the loop itself after nine Stops:

```text
A hook blocked the turn from ending 9 consecutive times — overriding and ending turn. For Stop/SubagentStop hooks, check stop_hook_active in the input and return success while it's true. Set CLAUDE_CODE_STOP_HOOK_BLOCK_CAP to raise this limit.
```

That is the documented cap: eight continuations in a row, reset whenever the model calls
a tool, and it counts blocks and `additionalContext` alike. `continue: false` changes
nothing for its own turn (`preventedContinuation: true`, `stopReason` recorded), but it
cancels a sibling's block (finding 4).

Under `-p` the printed result is the retry's text only. Run C's `result` was
`PROBE-C-RETRY`, and the first reply survives only in the stream. The eval driver joins
every text part of a session, so it sees both.

### 3 What the human sees, and where the reason lands

Run I2, interactive, with a plumbbob-shaped block and nothing else, flattened from the
screen log:

```text
⏺ PROBE-I2-FIRST

⏺ Ran 1 stop hook (ctrl+o to expand)
  ⎿  Stop hook error: PROBE-I2-REASON: the turn did not close on its relay. Reply with exactly the
     line PROBE-I2-RETRY and nothing else.

⏺ PROBE-I2-RETRY
```

While the continuation runs, the footer reads `Stop hook error occurred · ctrl+o to
see`. The streamed text stays on screen, as [Q1 (relay-check-tier)](intent.md#q1)
expected, and the reason prints in full under an "error" label. The reason has two
readers: it is written as an order to the model, and the human reads it as an error.
With `additionalContext` instead (run I4), the middle row reads `⎿ Stop hook feedback:
PROBE-I4-CONTEXT: …` and the footer never appears.

In the transcript the reason is a user entry with `isMeta: true` and the turn's
`promptId`:

```json
{"promptId":"44040e45-c106-4ebf-a291-59ad269be064","type":"user","message":{"role":"user","content":"Stop hook feedback:\nPROBE-C-REASON: your turn did not close on its relay. Reply with exactly the line PROBE-C-RETRY and nothing else."},"isMeta":true}
```

The `stop_hook_summary` system entry beside it lists the same text under `hookErrors`. A
`systemMessage` lands as an attachment of type `hook_system_message`, and
`additionalContext` as one of type `hook_additional_context`, also listed under the
summary's `hookAdditionalContext`.

The capture is a pty log flattened to text, not a rendering, and Zed's agent panel was
not probed. To watch a block land live, the workspace stays until the next reboot:

```sh
cd /tmp/pb-stop-spike.2gFg/repo
echo '{"unlessActive":true,"stdout":{"decision":"block","reason":"relay missed: run plumbbob handoff --full"}}' > ../mode/stop.json
claude --setting-sources project,local --strict-mcp-config
```

### 4 plumbbob's Stop hook beside checkride's

The two run in parallel, 3 to 20 ms apart in either order, and each gets an identical
payload. When both block (run P2), the harness runs one continuation carrying two
separate `Stop hook feedback` turns, the model answers both in one reply, and the next
Stop fires both hooks again with `stop_hook_active: true`. A `systemMessage` from one
beside a block from the other renders as `Stop says:` above `Ran 2 stop hooks` (run I3).
Three interactions matter for step 15.

**`stop_hook_active` is shared, and names nobody.** No payload field says which hook
blocked. In run P4 only the project hook blocked, yet the plugin hook got
`stop_hook_active: true` on the continuation.

**checkride re-blocks while red, whatever the flag says.** Its gate script applies the
`stop_hook_active` guard only on its could-not-run path; a red verdict is forwarded on
every Stop. In run R1 the real gate blocked on round one and again on round two:

```json
{"decision":"block","reason":"checkride red in 1.8s ✘\ncheckride: the gate is red — read .check/summary.json, fix the failing slot, then finish (do not stop while checkride is red). Run `pnpm exec checkride triage` for full triage.","systemMessage":"\n\ncheckride red in 1.8s ✘"}
```

It let the turn end only on round three, after Haiku made `check` pass by editing the
script. Round two closed on `Would you like me to investigate the plumbbob handoff issue
further, or is this expected behavior for this test repository?`, and the plumbbob-shaped
hook, guarded by `stop_hook_active` the way [D16 (block-once)](intent.md#d16) words it,
let that through. A relay check guarded by the shared flag goes quiet for the rest of
any turn in which checkride has blocked once. That is exactly the turn that fixes code
at a pause and then has to render the card again.

**`continue: false` from either hook cancels the other's block.** In run P5 the project
hook blocked and the plugin hook returned `continue: false`. The feedback was recorded
(`hookErrors`, `preventedContinuation: true`), and the turn ended with no continuation
and an empty result. A relay check that ever emitted it would switch checkride's gate
off for that turn.

### 5 `TURN` has ticked when Stop fires under `-p`

With `plumbbob turn` on UserPromptSubmit, four `-p` sessions in a row read `TURN` three
ways: on disk before the session, through the model's own `cat` at its first tool call,
and in the Stop probe.

| Session | Before | First tool call | Stop |
| ------- | ------ | --------------- | ---- |
| T1 | absent | 1 | 1 |
| T2 | 1 | 2 | 2 |
| T3 | 2 | 3 | 3 |
| T4 (prompt on stdin) | 3 | 4 | 4 |

UserPromptSubmit does not fire again on a block's continuation; no run logged one
between Stop rounds. So `TURN` holds still across a retry, and `prompt_id` is the same
on every Stop of one prompt. The receipts' note that "the headless `UserPromptSubmit`
tick lands at ~session end" does not reproduce on 2.1.283 (parked). The verbs that will
write `RELAY` cannot see `prompt_id`: a Bash tool call's environment carries
`CLAUDE_CODE_SESSION_ID` and nothing per prompt, so `TURN` stays the key they can stamp.

### 6 `stop_hook_active` on the continuation

It is set every time: `false` on a prompt's first Stop and `true` on every Stop after a
continuation. That held under `-p` (runs C, G, P2, R1) and interactively (runs I2, I3,
I4), after a JSON block, an exit 2, or `additionalContext` alike. Run C, both Stops of
one prompt:

```json
{"stop_hook_active":false,"last_assistant_message":"PROBE-C-FIRST","prompt_id":"44040e45-c106-4ebf-a291-59ad269be064"}
{"stop_hook_active":true,"last_assistant_message":"PROBE-C-RETRY","prompt_id":"44040e45-c106-4ebf-a291-59ad269be064"}
```

As finding 4 shows, it is set after anyone's continuation, not only the hook's own.

## Verdict

**Verdict:** viable. The final text is readable at Stop, on stdin rather than in the
transcript, so [D16 (block-once)](intent.md#d16) is not reopened on that ground, and
`TURN` ticks before Stop under `-p`, so [D13 (gate-on-the-turn)](intent.md#d13) holds.
Two of the plan's mechanics have to change before step 15 builds them: how "once" is
counted, and the label the human reads when the check fires.

## What this decides

This feeds step 13's decision entry and step 15's verb. Nothing in `intent.md` changes
in this step.

- **Read `last_assistant_message` for the closing check, never the transcript.** Step
  15's note already allowed the move. The transcript is still the source for the earlier
  messages of a turn, which D15 (tier-picks-the-match)'s boundary tier needs, scoped by
  `prompt_id`. A payload without the field (an older Claude Code) is the unreadable case:
  exit 0 and no output, per [C2 (hooks-never-wedge)](intent.md#c2).
- **Count "once" in plumbbob's own record, not in `stop_hook_active`.** Keep D16
  (block-once)'s tier, but stamp `RELAY` with the `TURN` the check blocked in and block
  at most once per `TURN`. The shared flag would silence the check for the rest of any
  turn checkride blocked, and checkride keeps blocking while red. The harness cap still
  bounds the pair.
- **Never emit `continue: false`.** It cancels checkride's block in the same round.
- **Step 13 picks the channel: `decision: "block"` or `additionalContext`.** Both continue
  the turn, count toward the same cap, and set `stop_hook_active`. The difference is what
  the human reads: `Stop hook error` with a footer, or `Stop hook feedback` without one. A
  missed relay is the model's slip, not an error the human has to act on, which argues
  for `additionalContext`; `decision: "block"` is the form D16 (block-once) names and the
  one checkride uses.
- **Write the reason for two readers.** It prints in full on the human's screen, so it
  stays one line that names the command [D12 (retry-reruns)](intent.md#d12) records.
- **Keep step 15's empty-turn test, and expect it rarely in the field.** The harness now
  turns a silent ending into a forced reply before Stop, so a miss arrives as some text,
  not as none.
