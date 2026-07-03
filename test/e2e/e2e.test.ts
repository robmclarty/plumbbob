// End-to-end dogfood drive: a full PlumbBob session in a fixture repo,
// start → build → checkpoint → park → wrap → archive populated. The report is
// written here as the /plumbbob:pb-wrap skill would; the CLI path under test is everything
// around it. Stub check per D14.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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

describe('e2e: a full PlumbBob session end to end', () => {
  it('drives start → build → checkpoint → park → wrap → archive', () => {
    const dir = makeFixtureRepo({ withCheckScript: true })

    // start → DESIGN; stub the check and write a one-step intent.
    expect(runCli(dir, ['start', 'E2E demo']).status).toBe(0)
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

    // close out: write the report (as /plumbbob:pb-wrap would), then wrap → archive + clear.
    writeSidecar(dir, 'report.md', '# Report — E2E demo\n\n## What shipped\n\nThe widget.\n')
    expect(runCli(dir, ['wrap']).status).toBe(0)

    // archive populated; the parked line and the SHA list survived into it.
    const names = readdirSync(join(dir, '.plumbbob', 'archive'))
    expect(names).toHaveLength(1)
    const name = names[0] ?? ''
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}-e2e-demo$/)
    const archived = join(dir, '.plumbbob', 'archive', name)
    expect(existsSync(join(archived, 'intent.md'))).toBe(true)
    expect(readFileSync(join(archived, 'build-log.md'), 'utf8')).toContain('a deferred idea for later')
    expect(readFileSync(join(archived, 'report.md'), 'utf8')).toMatch(/- step 1 [0-9a-f]{7,}/)

    // the session is cleared — no STATE, so no active session.
    expect(sidecarExists(dir, 'STATE')).toBe(false)
    expect(sidecarExists(dir, 'intent.md')).toBe(false)
    expect(runCli(dir, ['status']).stdout).toContain('NO ACTIVE SESSION')
  })
})
