# Media: the shot list

Every image in this folder is a placeholder: a labeled box standing where a real
capture belongs. The docs already reference each one by name, so filling a slot is
replacing the file and keeping the name, with no doc to edit. The `links`
check confirms that every referenced path exists on disk, which is why the
placeholders are files rather than comments.

The site keeps its own pictures under `site/media/`, because the Pages workflow deploys
`site/` alone, and the docs draw on them too. Three share a name with a slot below
(`loop-one-step.svg`, `pause.svg`, and `checkpoint-boundary.svg`), but they are
illustrations, not captures; a capture that fills a slot here leaves its namesake there
alone. A fourth, `build-record.svg`, stands in [`why.md`](../why.md) where the
`build-record-in-pr.svg` capture used to stand in the README, and that capture now
belongs to the happy path's finish.

## Capturing

- **The subject is the turn, not the terminal.** Crop to the block the doc is
  illustrating: the pause from `**Summary**:` to the `more details` link under the
  recommendation, the boundary from `**Checkpoint**:` to the state table's last row (the
  Parked row, while a park is open). The chrome around it is noise.
- **One repo, one goal.** Record every capture from the same session, so the step
  titles, SHAs, and counts agree across the docs. The rate limiter in
  [`happy-path.md`](../happy-path.md) is the running example, and its finished
  artifacts sit under [`examples/`](../../examples/); a spec in that shape is what
  `/plumbbob:plan` absorbs.
- **Width.** A pane about 100 columns wide keeps every readout row on one line without
  shrinking the type.
- **Format.** A still is a PNG. A recording is a GIF where it has to render inline on
  GitHub (an MP4 can only be linked there), and either on the site. Save it under the
  placeholder's name; if the extension changes (`pause.png` for `pause.svg`), update
  the one reference the table names.

## The slots

| File | Kind | Referenced from | What to capture | The state to be in |
| --- | --- | --- | --- | --- |
| `loop-one-step.svg` | video | `docs/happy-path.md` (the granular move) | `/plumbbob:build`, the pause block, `looks good`, the Checkpoint block, about twenty seconds | a planned build at the boundary with step 1 undone |
| `full-session.svg` | video | `docs/happy-path.md` (top) | plan, `/plumbbob:run` range 1 to step 1's pause, a park at that pause, `looks good`, `/plumbbob:run` range 2 to its stop card, one reply that settles the harvest, finish | a fresh repo with a clean tree and at least one commit |
| `pause.svg` | screenshot | `docs/happy-path.md` (section 3) | the whole pause block as Claude Code renders it, the Summary through the state table, the Recommendation, and the `more details` link | step 1 at its pause after a green check, so `looks good` is on the card |
| `checkpoint-boundary.svg` | screenshot | `docs/happy-path.md` (section 5) | the boundary block: the Checkpoint line and its state table | right after `looks good` lands step 1 |
| `plan-pause.svg` | screenshot | `docs/happy-path.md` (section 0) | the framed plan's tail and the plan-pause card under its rule | the plan pause, before `looks good` |
| `status-dashboard.svg` | screenshot | `docs/happy-path.md` (section 1) | the dashboard before any build: three steps undone, two ranges with their stops, nothing parked, and the next move | right after the plan is approved, before the first run |
| `park.svg` | screenshot | `docs/happy-path.md` (section 4) | the composed line, the OK, and the Parked block with its pointer back | step 1 at its pause, before `looks good` |
| `build-record-in-pr.svg` | screenshot | `docs/happy-path.md` (section 6) | a pull request's file list showing `.plumbbob/builds/<slug>/` beside the source | the finished build pushed and opened as a PR on GitHub |
| `doctor.svg` | screenshot | `docs/install.md` (verify) | `/plumbbob:doctor`'s report, every line green, including the check-gate table | a marketplace install in a repo with tools checkride detects |
| `local-reviewer.svg` | video | `docs/local-model-review.md` | the reviewer's narration streaming on stderr at a verify pause, then its findings folded into the self-review behind the card's `more details` link | the ollama-reviewer bound in `harness.json`, Ollama running |
| `run-header.svg` | screenshot | `docs/happy-path.md` (section 3), once the capture lands | the three-line run header: the range and where it ends, its stop, its grant | the moment `/plumbbob:run` is typed on the approved plan |
| `stop-card.svg` | screenshot | `docs/happy-path.md` (section 5), once the capture lands | the stop card: the Summary, the Readout measured across the range, the lean table, Your Call, the state table with its Stop row, the Recommendation, and the `more details` link | range 2 landed and its card showing, before `looks good` |

The last two slots have no placeholder file yet and no doc embeds them; filling one means
adding its image line to the section named, so the `links` check starts watching it.
