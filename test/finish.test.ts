import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, readSidecar, runCli, sidecarExists } from './helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

function writeSidecar(dir: string, name: string, content: string): void {
  writeFileSync(join(dir, '.plumbbob', name), content)
}
function writeRepo(dir: string, rel: string, content: string): void {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}
function archiveNames(dir: string): string[] {
  const root = join(dir, '.plumbbob', 'archive')
  return existsSync(root) ? readdirSync(root) : []
}
function readArchived(dir: string, archiveName: string, file: string): string {
  return readFileSync(join(dir, '.plumbbob', 'archive', archiveName, file), 'utf8')
}

// Start a session with a one-step intent + stub check so build/done work, and stamp
// intent.md's title heading (the slug source) with `title`.
function started(dir: string, title: string): void {
  runCli(dir, ['start', title])
  writeSidecar(dir, 'intent.md', `# ${title}\n\n## Steps\n\n1. [ ] Do it — **done when:** ok\n   - seam: \`src/\`\n`)
  writeSidecar(dir, 'config', 'check=true\n')
}

describe('plumbbob finish', () => {
  it('refuses without a report and leaves the session intact', () => {
    const dir = makeFixtureRepo()
    started(dir, 'No report yet')
    const result = runCli(dir, ['finish'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('report')
    expect(sidecarExists(dir, 'STATE')).toBe(true)
  })

  it('archives intent + build-log + report with the SHA list, then clears the actives', () => {
    const dir = makeFixtureRepo()
    started(dir, 'Ship the widget')
    runCli(dir, ['build', '1'])
    writeRepo(dir, 'src/a.ts', 'export const a = 1\n')
    runCli(dir, ['done']) // checkpoint step 1 → DESIGN
    writeSidecar(dir, 'report.md', '# Report\n\nShipped the widget.\n')
    runCli(dir, ['wrap'])
    expect(readSidecar(dir, 'STATE').trim()).toBe('FINISH')

    const result = runCli(dir, ['finish'])
    expect(result.status).toBe(0)

    const names = archiveNames(dir)
    expect(names).toHaveLength(1)
    const name = names[0] ?? ''
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}-ship-the-widget$/)
    expect(existsSync(join(dir, '.plumbbob', 'archive', name, 'intent.md'))).toBe(true)
    expect(existsSync(join(dir, '.plumbbob', 'archive', name, 'build-log.md'))).toBe(true)

    const report = readArchived(dir, name, 'report.md')
    expect(report).toContain('Shipped the widget')
    expect(report).toContain('## Checkpoints')
    expect(report).toMatch(/- baseline [0-9a-f]{7,}/)
    expect(report).toMatch(/- step 1 [0-9a-f]{7,}/)

    // actives cleared; control files gone (STATE deleted last)
    expect(sidecarExists(dir, 'intent.md')).toBe(false)
    expect(sidecarExists(dir, 'build-log.md')).toBe(false)
    expect(sidecarExists(dir, 'report.md')).toBe(false)
    expect(sidecarExists(dir, 'STATE')).toBe(false)
  })

  it('deletes STATE, SEAM, and STEP on close', () => {
    const dir = makeFixtureRepo()
    started(dir, 'Teardown check')
    writeSidecar(dir, 'report.md', '# Report\n')
    writeSidecar(dir, 'SEAM', 'src/a.ts\n') // simulate leftover control files
    writeSidecar(dir, 'STEP', '1\n')
    runCli(dir, ['wrap'])

    expect(runCli(dir, ['finish']).status).toBe(0)
    expect(sidecarExists(dir, 'STATE')).toBe(false)
    expect(sidecarExists(dir, 'SEAM')).toBe(false)
    expect(sidecarExists(dir, 'STEP')).toBe(false)
    expect(archiveNames(dir)).toHaveLength(1)
  })

  it('archives a second same-titled session alongside the first (no overwrite)', () => {
    const dir = makeFixtureRepo()
    started(dir, 'Recurring task')
    writeSidecar(dir, 'report.md', '# Report one\n')
    runCli(dir, ['wrap'])
    runCli(dir, ['finish'])

    started(dir, 'Recurring task') // a fresh session in the same repo, same title
    writeSidecar(dir, 'report.md', '# Report two\n')
    runCli(dir, ['wrap'])
    runCli(dir, ['finish'])

    const names = archiveNames(dir)
    expect(names).toHaveLength(2)
    const reports = names.map((n) => readArchived(dir, n, 'report.md'))
    expect(reports.some((r) => r.includes('Report one'))).toBe(true)
    expect(reports.some((r) => r.includes('Report two'))).toBe(true)
  })
})

describe('plumbbob wrap', () => {
  it('enters FINISH from DESIGN', () => {
    const dir = makeFixtureRepo()
    started(dir, 'Wrapping up')
    const result = runCli(dir, ['wrap'])
    expect(result.status).toBe(0)
    expect(readSidecar(dir, 'STATE').trim()).toBe('FINISH')
  })

  it('refuses from BUILD (FINISH is entered only from DESIGN)', () => {
    const dir = makeFixtureRepo()
    started(dir, 'Mid build')
    runCli(dir, ['build', '1'])
    const result = runCli(dir, ['wrap'])
    expect(result.status).toBe(1)
    expect(readSidecar(dir, 'STATE').trim()).toBe('BUILD')
  })

  it('runs under CLAUDECODE — the /pb-wrap driver fires it from the chat (D21 revised)', () => {
    const dir = makeFixtureRepo()
    started(dir, 'Guarded')
    const result = runCli(dir, ['wrap'], { CLAUDECODE: '1' })
    expect(result.status).toBe(0)
    expect(readSidecar(dir, 'STATE').trim()).toBe('FINISH')
  })
})
