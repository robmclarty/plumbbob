# Media: the shot list

Every image in this folder is a placeholder: a labeled box standing where a real
capture belongs. The docs and the site already reference each one by name, so filling
a slot is replacing the file and keeping the name, with no doc to edit. The `links`
check confirms that every referenced path exists on disk, which is why the
placeholders are files rather than comments.

The landing page and the docs page use three of these captures too. Their copies live
under `site/media/`, because the Pages workflow deploys `site/` alone; a capture that
replaces a file here replaces its copy there as well.

## Capturing

- **The subject is the turn, not the terminal.** Crop to the block the doc is
  illustrating: the pause from `**Summary**:` to the recommendation's last line, the
  boundary from `**Checkpoint**:` to `**Next Up**:`. The chrome around it is noise.
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
| `loop-one-step.svg` | video | `README.md` (the loop in one picture); `site/index.html` (the loop) | `/plumbbob:build`, the pause block, `looks good`, the Checkpoint block, about twenty seconds | a planned build at the boundary with step 1 undone |
| `full-session.svg` | video | `docs/happy-path.md` (top) | plan, three builds, a park during step 2, harvest, finish | a fresh repo with a clean tree |
| `pause.svg` | screenshot | `README.md` (first session, step 2); `docs/happy-path.md` (section 3); `site/index.html` and `site/docs.html` (the pause) | the whole pause block as Claude Code renders it, Summary through Recommendation | step 1 at its pause after a green check, so `looks good` is on the card |
| `checkpoint-boundary.svg` | screenshot | `README.md` (first session, step 3); `docs/happy-path.md` (section 3); `site/docs.html` | the three-line boundary block | right after `looks good` lands step 1 |
| `plan-pause.svg` | screenshot | `docs/happy-path.md` (section 0) | the framed plan's tail and the plan-pause card under its rule | the plan pause, before `looks good` |
| `status-dashboard.svg` | screenshot | `docs/happy-path.md` (section 1) | the dashboard with a done step, a step in flight, and one parked item | mid step 2, after the park |
| `park.svg` | screenshot | `docs/happy-path.md` (section 4) | the composed line, the OK, and the Parked block with its pointer back | mid step 2 |
| `build-record-in-pr.svg` | screenshot | `README.md` (the five edges) | a pull request's file list showing `.plumbbob/builds/<slug>/` beside the source | the finished build pushed and opened as a PR on GitHub |
| `doctor.svg` | screenshot | `docs/install.md` (verify) | `/plumbbob:doctor`'s report, every line green, including the check-gate table | a marketplace install in a repo with tools checkride detects |
| `local-reviewer.svg` | video | `docs/local-model-review.md` | the reviewer's narration streaming on stderr at a verify pause, then its findings folded into the readout | the ollama-reviewer bound in `harness.json`, Ollama running |
