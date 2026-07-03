// End-to-end dogfood drive: a full PlumbBob session in a fixture repo,
// start → build → checkpoint → park → finish. The report is written here as the
// /plumbbob:pb-finish skill would; the CLI path under test is everything around it.
// The build folder IS the archive now (D8): finish commits it in place so it rides
// the branch into the PR — no `archive/` copy. Stub check per D14.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  cleanupFixtures,
  makeFixtureRepo,
  phase,
  readSidecar,
  runCli,
  sidecarExists,
  writeSidecar,
} from '../helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

function writeRepo(dir: string, rel: string, content: string): void {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function gitTracked(dir: string, rel: string): boolean {
  return execFileSync('git', ['-C', dir, 'ls-files', rel], { encoding: 'utf8' }).trim().length > 0
}

function headSubject(dir: string): string {
  return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
}

describe('e2e: a full PlumbBob session end to end', () => {
  it('drives start → build → checkpoint → park → finish', () => {
    const dir = makeFixtureRepo({ withCheckScript: true })

    // start → DESIGN; stub the check and write a one-step intent.
    expect(runCli(dir, ['start', 'E2E demo', '--slug', 'e2e-demo']).status).toBe(0)
    expect(phase(dir)).toBe('DESIGN')
    writeSidecar(dir, 'settings.json', JSON.stringify({ check: 'true' }))
    writeSidecar(
      dir,
      'intent.md',
      '# E2E demo\n\n## Steps\n\n1. [ ] Build the widget — **done when:** ok\n   - seam: `src/widget.ts`\n',
    )

    // build 1 → BUILD with the in-flight STEP + SEAM (orientation, not a lock).
    expect(runCli(dir, ['build', '1']).status).toBe(0)
    expect(phase(dir)).toBe('BUILD')
    expect(readSidecar(dir, 'SEAM').trim()).toBe('src/widget.ts')

    // implement the step (nothing gates the edit), then checkpoint the tick.
    writeRepo(dir, 'src/widget.ts', 'export const widget = 1\n')
    expect(runCli(dir, ['checkpoint']).status).toBe(0) // no arg → resolves STEP=1
    expect(phase(dir)).toBe('DESIGN')
    expect(readSidecar(dir, 'checkpoints')).toMatch(/step 1 [0-9a-f]{7,}/)
    expect(readSidecar(dir, 'intent.md')).toContain('1. [x] Build the widget') // box flipped

    // capture a tangent (the dumb CLI path).
    expect(runCli(dir, ['park', 'a deferred idea for later']).status).toBe(0)
    expect(readSidecar(dir, 'build-log.md')).toContain('a deferred idea for later')

    // close out: write the report (as /plumbbob:pb-finish would), then finish →
    // final commit, no archive copy.
    writeSidecar(dir, 'report.md', '# Report — E2E demo\n\n## What shipped\n\nThe widget.\n')
    expect(runCli(dir, ['finish']).status).toBe(0)

    // the final commit lands under the greppable `finish` subject (D15).
    expect(headSubject(dir)).toBe('plumbbob: finish — E2E demo')

    // the build folder IS the archive (D8): its artifacts stay in place, committed,
    // so they ride the branch into the PR. No `archive/` copy exists.
    const built = join(dir, '.plumbbob', 'builds', 'e2e-demo')
    expect(existsSync(join(dir, '.plumbbob', 'archive'))).toBe(false)
    expect(gitTracked(dir, '.plumbbob/builds/e2e-demo/intent.md')).toBe(true)
    expect(gitTracked(dir, '.plumbbob/builds/e2e-demo/report.md')).toBe(true)
    // the parked line and the appended SHA list survived into the committed folder.
    expect(readFileSync(join(built, 'build-log.md'), 'utf8')).toContain('a deferred idea for later')
    expect(readFileSync(join(built, 'report.md'), 'utf8')).toMatch(/- step 1 [0-9a-f]{7,}/)

    // the session is cleared — no STATE, so no active session.
    expect(sidecarExists(dir, 'STATE')).toBe(false)
    expect(runCli(dir, ['status']).stdout).toContain('NO ACTIVE SESSION')
  })
})
