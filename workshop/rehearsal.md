# Rehearsal: traps, reset, snapshots

Rehearse on the machine the room will see, at least twice end to end, the second time with
the timer running and the recorder on. Everything below is in the order it is needed: the
traps first, because each one is cheaper to meet alone than in front of forty people; then
the reset, the snapshots, the recordings, the model table, the two tables to fill in, and
the assertions a dry run has to pass before the playbook is trusted.

## The traps, ordered by bite

Each entry is the trap, then the move that avoids it. The first three can end the demo;
the rest cost a minute each.

1. **The 48 h release window.** pnpm's `minimumReleaseAge` is 2880 minutes here, strict. A
   checkride or plumbbob release inside 48 hours of the workshop is invisible to `pnpm dlx`
   and `pnpm add`, and `pnpm dlx checkride` would fetch an older version or refuse. Seen in
   the 2026-11-04 dry run, inside the window: `ERR_PNPM_NO_MATURE_MATCHING_VERSION`,
   `checkride@0.19.3 was published at 2026-11-03T03:32:40Z, within the minimumReleaseAge
   cutoff`; the same `dlx` with `checkride@0.19.2` scaffolded a green repo.
   checkride 0.19.3 clears the window at 19:32 PST on 2026-11-04. The move: pin
   `checkride@0.19.3` in `P1` regardless, and publish nothing in the two days before. To
   take a fresh release anyway, add `minimumReleaseAgeExclude: [checkride]` to pnpm's
   global rc, `~/Library/Preferences/pnpm/config.yaml` on this machine, beside the
   `minimumReleaseAge` it holds; the `dlx` line runs before the scaffold's
   `pnpm-workspace.yaml` exists, so an exclude written there never reaches it.
2. **The plugin updates itself.** A marketplace plugin can move under you mid-demo. The
   move: update the plugin the day before, freeze plumbbob releases, and read
   `plumbbob 0.13.10` from `! plumbbob --version` at `B2` (doctor names the marketplace,
   not the version).
3. **A dirty tree makes `start` refuse.** An uncommitted `docs/spec.md`, a build artifact,
   or `.claude/settings.local.json` written by an "always allow" click. The move: `P4`
   ends on `git status --short`, and it prints nothing or the demo waits. Pre-add the allow
   list to `.claude/settings.json` in the scaffold commit, rehearsal deciding the entries
   (`Bash(pnpm check:*)`, `Bash(pnpm build:*)`, `Bash(git add:*)`, `Bash(git commit:*)`,
   `Bash(git status:*)`, `Bash(plumbbob:*)` is the first draft); `P1` and the reset fence
   hold a commented placeholder for the write until the entries are fixed. Check
   `git status` after every click in rehearsal. `--allow-dirty` exists, and a later revert
   to baseline would discard the uncommitted file, so it is not the move.
4. **`/plan` and `/status` are Claude Code's.** The flat name is the built-in, and it wins.
   Type `/plumbbob:plan` and `/plumbbob:status`, every time; the same holds for `run`,
   `verify`, and `doctor`.
5. **The first plan commit has no latch.** `start` runs before the turn hook has ever
   ticked, so `checkpoint --plan` is guidance-only. The move: plan on Opus, which stops at
   the card, and give `looks good` a message of its own at `P10`.
6. **Plan mode cannot write the spec.** Claude Code's plan mode writes no files. `P3` runs
   in normal mode.
7. **`pnpm doctor` is pnpm's own.** pnpm 11 has a built-in `doctor` that shadows the
   scaffold's script. The move: `pnpm exec checkride doctor`, and `/plumbbob:doctor` for
   plumbbob's.
8. **The spec is linted.** MD040 (a fence without a language) and MD029 (a list starting
   past 1) are the usual spec failures; `P4` catches them and `checkride fix` repairs most.
   The intent is not: `P1`'s ignore keeps `.plumbbob/**` out of the `docs` slot (trap 23).
9. **The harvest may lean tangent.** The honest lean for the `2w` park is blocker (step 6
   stores a life and step 7 judges one past, and both would document a unit the parser
   refuses), and the model may still say tangent. The move is on the card:
   `make Pn a blocker`, rehearsed, with the handle read off the lean table.
10. **The step 1 refusal text may drift.** The `2w` moment is deterministic only because
    step 1's done-when fixes the text `a shelf life is written in days, like 3d`. Range 1's
    stop is exactly where that text is approved; `expand 1` at `P12` reads it, and the
    direction `make the refusal read: a shelf life is written in days, like 3d` fixes it
    before anything lands.
11. **The order of the replies at the stop card.** Park then `looks good`, or `looks good`
    then park. Rehearse both and keep the one the model handles cleanly; `P15` is written
    park-first, and the record line reads the same either way.
12. **fallow's `unused-files` and `unused-exports`.** The scaffold sets both to error.
    `src/bin.ts` is reachable only through `package.json`'s `bin`; rehearsal confirms fallow
    counts a `bin` entry as an entry point, else `fallow.toml` gets it as one in the
    scaffold commit. Every other module is wired through `src/index.ts`, which the spec's
    last rule says.
13. **The 70 percent coverage threshold.** `vitest.config.ts` sets it. Steps 4 and 5 test
    `main` with injected deps, so `cli.ts` is covered; `bin.ts` is three lines and its
    miss is within the budget. A red check here is narrated as the gate working and settled
    on the pause card.
14. **The ast-grep rules.** No class, no default export, `.js` extensions on imports, tests
    under `src/__tests__/`. They are in the spec's rules of the build so the model reads
    them in every step's Constraints; a halt on one is the same narration as 13.
15. **`plumbbob` is not on the terminal PATH.** A marketplace install has no terminal
    binary; the shim is on PATH only inside the session. Every hand-typed verb goes
    through `!` in pane 1, never pane 2.
16. **Zed folds reply text.** Zed's terminal and agent panel hide reply text written before
    a tool call, and half the demo is that text. Use a plain terminal.
17. **The network.** `pnpm install --prefer-offline` after a rehearsal has warmed the
    store; a hotspot in the bag. The `dlx` line also needs the cache warm, so `P1` runs in
    full in rehearsal and not for the first time in the room.
18. **The scaffold's `src/sift.ts` starter.** `--name sift` seeds `src/sift.ts` exporting
    `SIFT = 'sift'`, its barrel, and a smoke test. Step 5 replaces it and its seam says so.
    Rehearsal decides whether `--name siftlist` is cleaner; if it is, `P1` changes and
    nothing else does.
19. **`--body` reads stdin only.** By hand, `plumbbob checkpoint --plan --body <<'BODY'`
    with nothing after the heredoc marker on that line, not even `2>&1`; `$(cat <<EOF)`
    hangs the CLI and drops the body. The demo types no `--body` line, but a repair might.
20. **`--help` on a verb that takes a value.** Bare `--help` is caught before dispatch
    since 0.9.3, and `checkpoint -m --help` still commits, because `-m` swallows the
    flag. Read `plumbbob help <verb>` instead.
21. **Two versions of checkride.** plumbbob's gate runs the 0.12.5 it bundles against a
    config 0.19.3 wrote, and it works with `{}` settings. To make the gate and `pnpm check`
    the same binary, write `{"check": "pnpm check"}` into `.plumbbob/settings.json` at `P1`
    instead of `{}`; the cost is that plumbbob's own `--only` narrowing is ignored with a
    configured command.
22. **The vitest coverage provider.** Only the hand-rolled scaffold path meets this: without
    `@vitest/coverage-v8`, checkride's init probe disables the `test` slot with no obvious
    reason. The flat scaffold pins it, so the demo never meets the trap; a rehearsal that
    builds the repo by hand does.
23. **The scaffold's markdownlint reads `.plumbbob/`.** Its `.markdownlint-cli2.jsonc` globs
    every `.md` file, hidden folders included, and the intent and build log PlumbBob writes
    from its templates trip rules the scaffold keeps on, so the first `plumbbob check` after
    `start` is red on the `docs` slot. Found in the 2026-11-04 dry run; `P1` adds `.plumbbob/**`
    to the config's `ignores` before the scaffold commit, which is what PlumbBob's own repo
    does, and with it the same check is green.

## The reset procedure

One block, pane 2, from nothing to the state `B2` starts from:

```sh
rm -rf ~/demo/sift ~/demo/sift.json ~/demo/sift.archive.json
mkdir -p ~/demo/sift && cd ~/demo/sift
git init -b main
pnpm dlx checkride@0.19.3 init --shape flat --name sift
pnpm install --prefer-offline
pnpm check
sed -i '' 's/"ignores": \[/"ignores": [".plumbbob\/**", /' .markdownlint-cli2.jsonc
mkdir -p .plumbbob && printf '{}\n' > .plumbbob/settings.json
# add .claude/settings.json allow list here once rehearsal fixes the entries
git add -A && git commit -qm "chore: scaffold with checkride"
git status --short
```

Then `claude` in pane 1, `/plumbbob:doctor`, and `! plumbbob --version` reading
`plumbbob 0.13.10`. The alias and the two exports in
[`README.md`](README.md#the-three-screens) are set in pane 2 afterward, since `rm -rf` does
not unset them but a fresh shell would.

## The snapshot procedure

After each beat in a rehearsal, with pane 1 idle, copy the folder whole and the list beside
it:

```sh
mkdir -p ~/demo/snap
cp -R ~/demo/sift ~/demo/snap/B7
cp ~/demo/sift.json ~/demo/snap/B7.sift.json 2>/dev/null || true
cp ~/demo/sift.archive.json ~/demo/snap/B7.sift.archive.json 2>/dev/null || true
```

The copy carries `.plumbbob/STATE`, `TURN`, `TICK`, the grant, the detail file, and the
build folder exactly as they stood, which is what a git tag cannot carry: the plan commit
and each checkpoint land one commit behind the control state they describe
([D37 (bookkeeping-sweep)](../docs/decisions.md#d37)), and `recover --fix` cannot rebuild a
cursor after `finish`. Name each snapshot for the beat it ends, so `B7` is the tree after
step 1 landed and `B11` is the tree after the harvest recorded.

Restoring is the reverse copy and one line in pane 1:

```sh
rm -rf ~/demo/sift && cp -R ~/demo/snap/B7 ~/demo/sift
cp ~/demo/snap/B7.sift.json ~/demo/sift.json 2>/dev/null || true
cp ~/demo/snap/B7.sift.archive.json ~/demo/sift.archive.json 2>/dev/null || true
cd ~/demo/sift
```

Then `! plumbbob status` in pane 1 proves the cursor reads. The Claude Code session is not
restored and does not need to be: the skills read the files, and the next skill typed
injects the dashboard fresh. If a restored tree reports `NO ACTIVE SESSION`, the snapshot
was taken after `finish`, and the one-line fallback is writing the build slug into
`.plumbbob/STATE` by hand and running `plumbbob recover --fix`; verify this in rehearsal
before relying on it.

## The recordings

Every beat from the last full rehearsal, recorded as the screen the room will see, to
`~/demo/recordings/`, outside the repo:

| File | Beat | Why it is kept |
| --- | --- | --- |
| `beat-01.mov` | `B1` | the scaffold, in case the network is down |
| `beat-04.mov` | `B4` | the plan card arriving, in case Opus runs long |
| `beat-06.mov` | `B6` | the three replies and the hand edit, as one piece |
| `beat-07.mov` | `B7` | the pause card and the checkpoint |
| `beat-08.mov` | `B8` | the long one: four commits arriving and the stop card |
| `beat-11.mov` | `B11` | the lean table, the re-cut line, the dashboard |
| `beat-14.mov` | `B14` | the re-cut range running as re-cut, and the archive file |
| `beat-15.mov` | `B15` | the finish and the record |
| `move-1.mov` | `B16` | keyframes Move 1, live at `B16`, in case the check runs long (below) |
| `move-2.mov` | `B16` | keyframes Move 2, recorded only: the `(new)` pointer and `--strict` |
| `move-3.mov` | `B16` | keyframes Move 3, recorded only: the `held-by` the schema refuses |

A recording of a card is a card; the switch rule plays the recording at the point the live
beat was abandoned, and the snapshot restores the state for the beat after it.

## The keyframes moves (`B16`)

The sits page's keyframes moment is Move 1 on plumbbob's own `keyframes.md`, not `init` on a
fresh file. Move 1 runs live in pane 2 from the plumbbob checkout,
`cd ~/Projects/plumbbob/code/plumbbob`, not from `~/demo/sift`; the other two play as
recordings. The exact message text of each move is captured in rehearsal and pasted here;
each ends green again.

| Move | What is done | Expected | Captured text |
| --- | --- | --- | --- |
| 1 (live) | shorten the title `mid-step park lines survive a revert` in `test/e2e/build-loop.test.ts` by one word with `sed -i ''`, run `pnpm exec keyframes check --strict`, then `git checkout test/e2e/build-loop.test.ts` | `constraints   7 · 5 linked · 1 review · 1 broken`, then `keyframes.md:78  error  broken-pointer  file:test/e2e/build-loop.test.ts#"mid-step park lines survive a revert" doesn't contain that text; fix it, or add "(new)" if it's planned`, then `1 error`, exit 1; green after the checkout | |
| 2 (recorded) | add a `(new)` pointer to `S5`, run the check; create the file with `printf`, run it under `--strict`; `rm` and remove the pointer | `planned`, exit 0; then `built-not-new`, exit 1 | |
| 3 (recorded) | a `held-by` under `T3` | `key-not-allowed`, exit 1 | |

## The model and effort per beat

Rob asked for sonnet at low effort or haiku at medium for the build beats, Opus for the
plan. The `/model` picker carries the effort setting beside the model; set both at the
beat the table names and leave them until the next row.

| Beat | `/model` | Effort | Why |
| --- | --- | --- | --- |
| `B2` to `B6` | opus | high | the plan, the refine, and the plan commit; Opus stops at the card, and the first plan commit has no latch |
| `B7` | haiku | medium | step 1 is one function, fully specified |
| `B8` | sonnet | low | four steps with fs, argv, and two modules meeting |
| `B10` to `B12` | sonnet | low | the park, the harvest, and the sharpen are reads of the plan |
| `B13` | none | | a hand edit and one `!` line |
| `B14` | sonnet | low | step 8 is haiku's by the plan, and the range's line names sonnet; the run inherits the session's model |
| `B15` | sonnet | low | the report |

The Next Up row names the step's own model and the range line beneath it the range's
([D115 (card-weights)](../docs/decisions.md#d115),
[D122 (next-range-under-next-up)](../docs/decisions.md#d122)); the row is guidance, and the
session's model is what runs.

## Timings and cost, to fill in

One row per beat, measured in the second full rehearsal. The budget column is the run of
show's; the switch rule fires at twice it.

| Beat | Budget | Rehearsal 1 | Rehearsal 2 | Model turns | Cost | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `B0` | 4 min | | | 0 | | |
| `B1` | 4 min | | | 0 | | |
| `B2` | 2 min | | | 1 | | |
| `B3` | 6 min | | | | | |
| `B4` | 5 min | | | 1 | | |
| `B5` | 4 min | | | 1 | | |
| `B6` | 5 min | | | 4 | | |
| `B7` | 6 min | | | | | |
| `B8` | 14 min | | | | | |
| `B9` | 3 min | | | 0 | | |
| `B10` | 3 min | | | | | |
| `B11` | 5 min | | | | | |
| `B12` | 2 min | | | 2 | | |
| `B13` | 2 min | | | 0 | | |
| `B14` | 10 min | | | | | |
| `B15` | 3 min | | | 1 | | |
| `B16` | 2 min | | | 0 | | |
| Total | 80 min | | | | | |

Estimates to replace: a haiku step takes one to two minutes, a sonnet step two to four,
range 2 about twelve minutes, range 3 about eight.

## The dry-run assertions

A dry run in `~/demo/sift` passes when every line below is true, in order. Any line that
fails is a trap to add above, with its move.

1. The scaffold is green in under 10 seconds, and `git status --short` prints nothing
   before `start`.
2. `/plumbbob:doctor` names all four hooks on its `hooks present` line and `latch: dormant`
   beneath; `! plumbbob --version` prints `plumbbob 0.13.10`.
3. The spec passes `pnpm check --only docs,spell,links` as written, or after one
   `checkride fix`.
4. `/plumbbob:plan docs/spec.md` reaches the plan card in one turn, with the two-question
   table and a Next Up row naming range 1.
5. The plan converges on seven steps and three ranges, or is brought there by one direction
   at the card.
6. Step 1's done-when carries the refusal text verbatim, and `sift add x --for 2w` prints
   it at `B9`.
7. The harvest appends a Decision slugged `weeks-are-days` at the next free number, and
   step 8, and the order verb's ending reads `range 3 of 3 re-cut (steps 8,6-7)`.
8. `! plumbbob status --questions` prints `plumbbob: no open questions in this plan` after
   the second hand edit.
9. `/plumbbob:run` at step 8's pause lands 8, 6, and 7 and ends on range 3's stop card.
10. `SIFT_NOW` four days on prints one line, and `$SIFT_ARCHIVE` holds the library book and
    the plants.
11. `git log --oneline` after `finish` is twelve lines.
12. The whole show, timed, fits in eighty minutes with the timings table filled in and the
    recordings cut.
