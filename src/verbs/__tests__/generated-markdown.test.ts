// The gate's blind spot, covered: the repo's own markdownlint run ignores
// `.plumbbob/**` because build records are append-only, so a lint bug in the
// markdown the CLI generates never fails this repo. It fails the consumer
// whose docs gate lints everything, which is exactly how the first-park
// blank-line bug and the Stats table's mixed pipes shipped. These tests lint
// what the CLI actually writes, in a throwaway repo, under the same rules
// .markdownlint-cli2.jsonc enforces on the docs we track.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { main } from 'markdownlint-cli2'
import { start } from '../start.ts'
import { park } from '../park.ts'
import { finish } from '../finish.ts'
import { checkpoint } from '../checkpoint.ts'
import { appendToSection, checkpointLogLine } from '../../lib/buildlog.ts'
import { buildLogPath, bumpStepStat, detailPath, intentPath, reportPath, stampStepStat } from '../../lib/sidecar.ts'
import { settingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Mirror of .markdownlint-cli2.jsonc's `config` block: the default rules minus
// the five prose choices that file documents (wrapping, inline HTML, italic
// guidance, bare fences, comment openers). Inlined rather than read from the
// file, because the file is jsonc and this test should not grow a parser; when
// the config block changes, change this mirror with it.
const RULES = {
  default: true,
  MD013: false,
  MD033: false,
  MD036: false,
  MD040: false,
  MD041: false,
}

// Lint the given files with markdownlint-cli2's programmatic API and return
// the findings, one `file:line error MDxxx/...` string each. Empty means clean.
async function lintFindings(dir: string, files: ReadonlyArray<string>): Promise<ReadonlyArray<string>> {
  const findings: string[] = []
  await main({
    argv: files.map((f) => relative(dir, f)),
    directory: dir,
    logMessage: () => {},
    logError: (message) => findings.push(message),
    optionsOverride: { config: RULES },
  })
  return findings
}

describe('generated markdown lints clean under a consumer-strict gate', () => {
  it('a fresh start: the stamped build-log and intent', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Lint the templates', '--slug', 'lint-the-templates']))
    expect(await lintFindings(dir, [buildLogPath(dir), intentPath(dir)])).toEqual([])
  })

  it('the first park and the first Log line: a list opening after prose', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Park then log', '--slug', 'park-then-log']))
    captureIo(() => park(dir, ['a first idea']))
    captureIo(() => park(dir, ['a second idea']))
    // The first checkpoint's Log append, without the checkpoint fixture: the
    // verb composes exactly these two calls on the same file.
    const path = buildLogPath(dir)
    const logged = appendToSection(
      readFileSync(path, 'utf8'),
      'Log',
      checkpointLogLine('2026-08-26', 1, 'a1b2c3d4e5f6', 'First step'),
    )
    writeFileSync(path, logged as string)
    expect(await lintFindings(dir, [path])).toEqual([])
  })

  it('a checkpoint with a detail file: the record nested under the Log line, fence and lists included', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Log the record', '--slug', 'log-the-record']))
    writeFileSync(intentPath(dir), '# Log the record\n\n## Steps\n\n1. [ ] First — **done when:** a works.\n   - seam: `src/a.ts`\n')
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.ts'), 'in seam\n')
    writeFileSync(
      detailPath(dir),
      [
        '# Detail · Step 1 · First',
        '',
        '── recap · step 1 of 1 ──',
        'done-when    met',
        'decisions    none exercised',
        'constraints  all honored',
        '',
        '## Summary',
        '',
        'A works now, and the story below has a list and a fence of its own.',
        '',
        '## 1 The first move',
        '',
        'The whole story, in two paragraphs.',
        '',
        '- one thing it tried',
        '- one thing it dropped',
        '',
        '```ts',
        'export const a = 1',
        '```',
        '',
        '## 2 The second move',
        '',
        '## Recommendation',
        '',
        'Approve it. Nothing is off.',
        '',
      ].join('\n'),
    )
    await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(readFileSync(buildLogPath(dir), 'utf8')).toContain('  **Summary**: A works now')
    expect(await lintFindings(dir, [buildLogPath(dir)])).toEqual([])
  })

  it('a plan commit with a cold read: the plan line and its record', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Log the read', '--slug', 'log-the-read']))
    writeFileSync(intentPath(dir), '# Log the read\n\n## Steps\n\n1. [ ] First — **done when:** a works.\n   - seam: `src/a.ts`\n')
    writeFileSync(detailPath(dir), '# Detail · Plan · Log the read\n\n## 1 The done-when names no test\n\nNothing in the seam is a test file.\n\n## Recommendation\n\nSharpen step 1 first. Its done-when names no test.\n')
    await captureIoAsync(() => checkpoint(dir, ['--plan']))
    expect(readFileSync(buildLogPath(dir), 'utf8')).toContain('plan committed')
    expect(await lintFindings(dir, [buildLogPath(dir)])).toEqual([])
  })

  it('the finish report: Checkpoints and a Stats table', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Stats table', '--slug', 'stats-table']))
    writeFileSync(reportPath(dir), '# Report\n')
    stampStepStat(dir, 'stats-table', 1, 'startedAt', '2026-08-26T10:00:00Z')
    stampStepStat(dir, 'stats-table', 1, 'landedAt', '2026-08-26T10:30:00Z')
    bumpStepStat(dir, 'stats-table', 1, 'redChecks')
    captureIo(() => finish(dir))
    expect(await lintFindings(dir, [reportPath(dir)])).toEqual([])
  })
})
