// End-to-end dogfood drive (step 8 done-when): a full Plumbbob session in a
// fixture repo, start → build → the LIVE pre-edit hook gating in/out of seam →
// done → park → report → wrap → finish → archive populated. The report SKILL is
// a Claude skill, so the e2e writes .plumbbob/report.md as its artifact (the CLI
// path under test is everything around it). Stub check per D14.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, readSidecar, runCli, sidecarExists } from './helpers/fixture-repo.ts'
import { preEdit } from './helpers/run-hook.ts'

afterAll(cleanupFixtures)

function writeSidecar(dir: string, name: string, content: string): void {
  writeFileSync(join(dir, '.plumbbob', name), content)
}
function writeRepo(dir: string, rel: string, content: string): void {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

describe('e2e: a full Plumbbob session under live enforcement', () => {
  it('drives start → build → hook gate → done → park → report → finish → archive', () => {
    const dir = makeFixtureRepo({ withCheckScript: true })

    // start → DESIGN, then stub the heavy check (D14) and write a one-step intent.
    expect(runCli(dir, ['start', 'E2E demo']).status).toBe(0)
    expect(readSidecar(dir, 'STATE').trim()).toBe('DESIGN')
    writeSidecar(dir, 'config', 'check=true\n')
    writeSidecar(
      dir,
      'intent.md',
      '# E2E demo\n\n## Steps\n\n1. [ ] Build the widget — **done when:** ok\n   - seam: `src/widget.ts`\n',
    )

    // build 1 → BUILD with the normalized SEAM.
    expect(runCli(dir, ['build', '1']).status).toBe(0)
    expect(readSidecar(dir, 'STATE').trim()).toBe('BUILD')
    expect(readSidecar(dir, 'SEAM').trim()).toBe('src/widget.ts')

    // the LIVE hook: blocks an out-of-seam edit, allows the in-seam one.
    expect(preEdit(dir, { rel: 'src/other.ts' }).status).toBe(2)
    expect(preEdit(dir, { rel: 'src/widget.ts' }).status).toBe(0)

    // make the allowed edit for real, then checkpoint → DESIGN.
    writeRepo(dir, 'src/widget.ts', 'export const widget = 1\n')
    expect(runCli(dir, ['done']).status).toBe(0)
    expect(readSidecar(dir, 'STATE').trim()).toBe('DESIGN')

    // capture a tangent (the dumb CLI path).
    expect(runCli(dir, ['park', 'a deferred idea for later']).status).toBe(0)
    expect(readSidecar(dir, 'build-log.md')).toContain('a deferred idea for later')

    // report artifact, then wrap → FINISH → finish.
    writeSidecar(dir, 'report.md', '# Report — E2E demo\n\n## What shipped\n\nThe widget.\n')
    expect(runCli(dir, ['wrap']).status).toBe(0)
    expect(readSidecar(dir, 'STATE').trim()).toBe('FINISH')
    expect(runCli(dir, ['finish']).status).toBe(0)

    // archive populated; the parked line and the SHA list survived into it.
    const names = readdirSync(join(dir, '.plumbbob', 'archive'))
    expect(names).toHaveLength(1)
    const name = names[0] ?? ''
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}-e2e-demo$/)
    const archived = join(dir, '.plumbbob', 'archive', name)
    expect(existsSync(join(archived, 'intent.md'))).toBe(true)
    expect(readFileSync(join(archived, 'build-log.md'), 'utf8')).toContain('a deferred idea for later')
    expect(readFileSync(join(archived, 'report.md'), 'utf8')).toMatch(/- step 1 [0-9a-f]{7,}/)

    // the session is cleared; the muzzle is off (STATE gone).
    expect(sidecarExists(dir, 'STATE')).toBe(false)
    expect(sidecarExists(dir, 'SEAM')).toBe(false)
    expect(sidecarExists(dir, 'intent.md')).toBe(false)

    // and the hook is dormant again with no session.
    expect(preEdit(dir, { rel: 'src/widget.ts' }).status).toBe(0)
  })
})
