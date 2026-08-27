// The gate's blind spot, covered: the repo's own markdownlint run ignores
// `.plumbbob/**` because build records are append-only, so a lint bug in the
// markdown the CLI generates never fails this repo. It fails the consumer
// whose docs gate lints everything, which is exactly how the first-park
// blank-line bug and the Stats table's mixed pipes shipped. These tests lint
// what the CLI actually writes, in a throwaway repo, under the same rules
// .markdownlint-cli2.jsonc enforces on the docs we track.

import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { main } from 'markdownlint-cli2'
import { start } from '../start.ts'
import { park } from '../park.ts'
import { finish } from '../finish.ts'
import { appendToSection, checkpointLogLine } from '../../lib/buildlog.ts'
import { buildLogPath, bumpStepStat, intentPath, reportPath, stampStepStat } from '../../lib/sidecar.ts'
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
