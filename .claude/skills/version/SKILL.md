---
name: version
description: Bump the project version (major, minor, or patch), add a changelog entry, then tag and push to trigger the npm publish + GitHub Release. Use when preparing a release, cutting a version, or the user says "/version".
argument-hint: "[major | minor | patch]"
allowed-tools: Read Edit Bash(git:*), Bash(date:*)
---

Bump the project version using semver, add the changelog entry, then tag and push
the release to trigger publishing. Accepts one argument: `major`, `minor`, or `patch`.

## Semver rules

Given a version `MAJOR.MINOR.PATCH`:

- `patch` → increment PATCH, e.g. 0.1.4 → 0.1.5
- `minor` → increment MINOR, reset PATCH, e.g. 0.1.4 → 0.2.0
- `major` → increment MAJOR, reset MINOR and PATCH, e.g. 0.1.4 → 1.0.0

## Files to update

1. `package.json` — top-level `"version"` field (the source of truth for the current version)
2. `.claude-plugin/plugin.json` — top-level `"version"` field, force-written to the new version (its prior value may be stale; overwrite it regardless)
3. `CHANGELOG.md` — new dated version section inserted above the latest entry

## Changelog format

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Each release is a dated heading followed by bullets grouped under bold category
labels — only include the categories that apply:

```markdown
## [A.B.C] - YYYY-MM-DD

- **Added:** new capabilities.
- **Changed:** behaviour that differs from before.
- **Fixed:** bug fixes.
- **Removed:** things taken away.
```

Match the existing entries: bullets are full sentences (prose, not terse
fragments), wrapped to roughly the same width as the surrounding entries.

## Publishing

Both the npm package and the GitHub Release are driven by CI, triggered by a
pushed `vA.B.C` git tag — **not** by this skill running `npm publish` directly:

- `.github/workflows/publish.yaml` reruns the check gate, builds, and runs
  `npm publish --provenance` over tokenless OIDC. It **pauses at the `npm-publish`
  environment for a required-reviewer approval** — nothing reaches npm until a
  maintainer approves that run in the Actions tab.
- `.github/workflows/release.yaml` creates the GitHub Release immediately on the
  tag push (no approval gate), pulling notes from the matching `## [A.B.C]`
  section of `CHANGELOG.md`.

So this skill's release step ends at pushing the tag; the npm publish completes
after the human approval gate. The tag must sit on the `chore: release A.B.C`
commit so `package.json`'s version matches the tag — publish.yaml verifies this
and fails the run otherwise.

## Steps

1. If no argument is provided, ask the user which bump type they want (major, minor, or patch).
2. Read `package.json` to get the current version.
3. Compute the new version according to the semver rules above.
4. Tell the user: "Bumping version from X.Y.Z to A.B.C"
5. Update `package.json` using the Edit tool.
6. Update `.claude-plugin/plugin.json`'s `"version"` field to the new version A.B.C using the Edit tool. Do not read its current value to compute the bump — `package.json` is the sole source of truth; force-write A.B.C here. (This also self-heals any pre-existing skew, e.g. `plugin.json` lagging behind `package.json`.)
7. Get today's date with `date +%Y-%m-%d` for the new entry's heading.
8. Find the last release commit with `git log --oneline --grep='chore: release' -1`, then run `git log --format='%s%n%n%b' <last-release-hash>..HEAD` to gather the changes since it. If no release commit exists, use all commits from the beginning of history. Use the commit subjects and bodies as context to write the categorized bullet list for the new entry.
9. Read `CHANGELOG.md` and insert the new version section immediately before the first existing `## [` entry (i.e. after the Keep a Changelog / Semantic Versioning preamble) using the Edit tool:

   ```markdown
   ## [A.B.C] - YYYY-MM-DD

   - **Added:** ...
   - **Changed:** ...
   - **Fixed:** ...
   ```

10. Report the updated version.
11. Stage the changed files (`package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md`) and commit with the message: `chore: release A.B.C`.
12. **Confirm before publishing.** Tell the user exactly what the next step does and ask them to confirm: pushing the current branch and a `vA.B.C` tag to `origin` triggers the npm publish (which then waits on their approval in the `npm-publish` GitHub environment) and immediately creates the GitHub Release. If they decline, stop here — the `chore: release A.B.C` commit stays local for them to push by hand.
13. Push the release commit, then create and push the tag — the tag is the publish trigger:

    ```bash
    git push origin HEAD
    git tag -a vA.B.C -m "vA.B.C"
    git push origin vA.B.C
    ```

    Use the exact new version in the tag name and message. First check that a `vA.B.C` tag does not already exist (`git tag -l vA.B.C` and `git ls-remote --tags origin vA.B.C`); if it does, stop and tell the user rather than overwriting it.
14. Report what was triggered and the one manual step left: the **Publish** workflow is now paused for approval — direct the user to GitHub → Actions → the Publish run → approve the `npm-publish` environment to complete `npm publish --provenance`. The **Release** workflow creates the GitHub Release from the `## [A.B.C]` changelog section automatically.
