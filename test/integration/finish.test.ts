import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, readSidecar, runCli, sidecarExists, writeSidecar } from '../helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

function writeReport(dir: string): void {
  writeSidecar(dir, 'report.md', '# Report — Finish demo\n\n## What shipped\n\nThe thing.\n')
}
function headSubject(dir: string): string {
  return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
}
function gitTracked(dir: string, rel: string): boolean {
  return execFileSync('git', ['-C', dir, 'ls-files', rel], { encoding: 'utf8' }).trim().length > 0
}

describe('plumbbob finish — the close-out, D9 (finish-no-gate)/D29 (finish-replaces-wrap)', () => {
  it('refuses with no session', () => {
    expect(runCli(makeFixtureRepo(), ['finish']).status).toBe(1)
  })

  it('makes the final commit, keeps the folder, clears the control state — no archive', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Finish demo', '--slug', 'finish-demo'])
    writeReport(dir)
    expect(runCli(dir, ['finish']).status).toBe(0)

    // final commit under the Conventional `finish` subject — D68 (conventional-subjects); the `plumbbob
    // finish` identifier moved to the body, where `git log --grep` still finds it.
    expect(headSubject(dir)).toBe('chore(finish-demo): finish')
    const body = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%b'], { encoding: 'utf8' })
    expect(body).toContain('plumbbob finish')

    // the build folder IS the archive — D29 (finish-replaces-wrap): artifacts stay in place, committed, and
    // ride the branch into the PR. No local-only `archive/` copy is made.
    const built = join(dir, '.plumbbob', 'builds', 'finish-demo')
    expect(existsSync(join(dir, '.plumbbob', 'archive'))).toBe(false)
    expect(existsSync(join(built, 'intent.md'))).toBe(true)
    expect(gitTracked(dir, '.plumbbob/builds/finish-demo/intent.md')).toBe(true)
    expect(gitTracked(dir, '.plumbbob/builds/finish-demo/report.md')).toBe(true)

    // control state cleared: removing STATE drops the session sentinel AND the cursor
    // (they share the one file now — D28 (state-cursor)), tree clean.
    expect(sidecarExists(dir, 'STATE')).toBe(false)
    expect(execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' }).trim()).toBe('')
    expect(runCli(dir, ['status']).stdout).toContain('NO ACTIVE SESSION')
  })

  it('does NOT gate on a missing report — finishes anyway with a note, D9 (finish-no-gate)', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'No report here', '--slug', 'no-report-here'])
    const res = runCli(dir, ['finish'])
    expect(res.status).toBe(0) // the defining choice: no refuse-without-report gate
    expect(res.stdout).toContain('No report.md found ⚠')
    expect(existsSync(join(dir, '.plumbbob', 'builds', 'no-report-here', 'report.md'))).toBe(false)
    expect(headSubject(dir)).toBe('chore(no-report-here): finish')
  })

  it('appends the checkpoint SHAs to the committed report', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Shas', '--slug', 'shas'])
    writeReport(dir)
    writeSidecar(dir, 'checkpoints', 'baseline abc1234\nstep 1 def5678\n')
    runCli(dir, ['finish'])
    const report = readFileSync(join(dir, '.plumbbob', 'builds', 'shas', 'report.md'), 'utf8')
    expect(report).toContain('## Checkpoints')
    expect(report).toMatch(/- step 1 def5678/)
    // it rode into the final commit, not just the working tree.
    const committed = execFileSync('git', ['-C', dir, 'show', 'HEAD:.plumbbob/builds/shas/report.md'], {
      encoding: 'utf8',
    })
    expect(committed).toMatch(/- step 1 def5678/)
  })

  it('writes a Footprint above the Checkpoints of the committed report — D166 (finish-footprint)', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Footprint', '--slug', 'footprint'])
    writeSidecar(dir, 'intent.md', '# Footprint\n\n## Steps\n\n1. [x] The schema\n   - seam: `schemas/`\n   - proof: `pnpm test` passes\n')
    writeFileSync(join(dir, '.plumbbob', 'settings.json'), JSON.stringify({ contractPaths: ['schemas/'] }))
    // One landed step, as a checkpoint leaves it: a commit, and its line on the ledger.
    mkdirSync(join(dir, 'schemas'))
    writeFileSync(join(dir, 'schemas', 'api.json'), '{}\n')
    execFileSync('git', ['-C', dir, 'add', '-A'], { stdio: 'ignore' })
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'step 1'], { stdio: 'ignore' })
    const sha = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    writeSidecar(dir, 'checkpoints', `${readSidecar(dir, 'checkpoints')}step 1 ${sha}\n`)
    writeReport(dir)
    expect(runCli(dir, ['finish']).status).toBe(0)

    // The section rode into the final commit, between the model's report and the CLI's ledger.
    const committed = execFileSync('git', ['-C', dir, 'show', 'HEAD:.plumbbob/builds/footprint/report.md'], {
      encoding: 'utf8',
    })
    expect(committed).toContain(
      [
        'The thing.',
        '',
        '## Footprint',
        '',
        '- **Contract**: touched `schemas/` (step 1)',
        '- **Proof**: 1 of 1 step by a command',
        '- **Size**: 1 file, +1 -0, over 1 step',
        '',
        '## Checkpoints',
        '',
        '- baseline ',
      ].join('\n'),
    )
    expect(committed.endsWith(`\n- step 1 ${sha}\n`)).toBe(true)
  })

  it('finishes a --local build with an empty commit and no tracked artifacts', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', '--local', 'Local run'])
    writeReport(dir)
    expect(runCli(dir, ['finish']).status).toBe(0)
    // --local resolves no build, so no scope: a bare `chore: finish` — D68 (conventional-subjects).
    expect(headSubject(dir)).toBe('chore: finish')
    // --local excludes the whole sidecar, so nothing under .plumbbob is tracked.
    expect(gitTracked(dir, '.plumbbob/report.md')).toBe(false)
    expect(sidecarExists(dir, 'STATE')).toBe(false)
    expect(runCli(dir, ['status']).stdout).toContain('NO ACTIVE SESSION')
  })
})
