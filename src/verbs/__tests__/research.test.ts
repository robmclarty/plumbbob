import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { research } from '../research.ts'
import { handoff } from '../handoff.ts'
import { start } from '../start.ts'
import { status } from '../status.ts'
import { blobHash } from '../../lib/git.ts'
import { formatOrientation, orient } from '../../lib/orient.ts'
import { researchPath, researchStale } from '../../lib/researchfile.ts'
import { activeBuild, intentPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

const NOW = new Date()
const TODAY = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-${String(NOW.getDate()).padStart(2, '0')}`

const INTENT = `# Research test

## Steps

1. [ ] First
   - seam: \`src/a.ts\`
2. [ ] Second
   - seam: \`src/b.ts\`
`

async function started(): Promise<{ readonly dir: string; readonly slug: string }> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Research test']))
  writeFileSync(intentPath(dir), INTENT)
  return { dir, slug: activeBuild(dir) ?? '' }
}

function install(dir: string, name: string, version: string): void {
  const folder = join(dir, 'node_modules', name)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name, version }))
}

function short(dir: string, file: string): string {
  return (blobHash(dir, file) ?? '').slice(0, 7)
}

describe('research --stamp', () => {
  it('creates research.md holding the stamp alone: the date, the lockfile hash, the versions', async () => {
    const { dir, slug } = await started()
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    install(dir, 'fascicle', '0.18.0')
    install(dir, '@scope/tool', '1.2.3')
    const r = captureIo(() => research(dir, ['--stamp', 'fascicle', '@scope/tool']))
    expect(r.code).toBe(0)
    const hash = short(dir, 'pnpm-lock.yaml')
    expect(hash).toMatch(/^[0-9a-f]{7}$/)
    expect(readFileSync(researchPath(dir), 'utf8')).toBe(`Researched ${TODAY} · pnpm-lock.yaml ${hash} · fascicle 0.18.0, @scope/tool 1.2.3\n`)
    expect(r.stdout).toBe(
      `**Researched**: .plumbbob/builds/${slug}/research.md (pnpm-lock.yaml ${hash}, fascicle 0.18.0, and 1 other)\n`,
    )
  })

  it('lists a dependency it cannot read without a version, and does not refuse', async () => {
    const { dir } = await started()
    const r = captureIo(() => research(dir, ['--stamp', 'missing', 'github.com/a/b', '../escape']))
    expect(r.code).toBe(0)
    expect(readFileSync(researchPath(dir), 'utf8')).toBe(`Researched ${TODAY} · missing, github.com/a/b, ../escape\n`)
  })

  it('stamps the date alone with no lockfile and no dependency, and says so', async () => {
    const { dir, slug } = await started()
    const r = captureIo(() => research(dir, ['--stamp']))
    expect(r.code).toBe(0)
    expect(readFileSync(researchPath(dir), 'utf8')).toBe(`Researched ${TODAY}\n`)
    expect(r.stdout).toBe(`**Researched**: .plumbbob/builds/${slug}/research.md (no lockfile at the repo root)\n`)
  })

  it('records every lockfile present, in the fixed order', async () => {
    const { dir } = await started()
    writeFileSync(join(dir, 'go.sum'), 'a v1 h1:x\n')
    writeFileSync(join(dir, 'package-lock.json'), '{}\n')
    captureIo(() => research(dir, ['--stamp']))
    expect(readFileSync(researchPath(dir), 'utf8')).toBe(
      `Researched ${TODAY} · package-lock.json ${short(dir, 'package-lock.json')}, go.sum ${short(dir, 'go.sum')}\n`,
    )
  })

  it('refreshes the stamp line and leaves every finding beneath it as it was', async () => {
    const { dir } = await started()
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'one\n')
    install(dir, 'fascicle', '0.18.0')
    const findings = '\n## Ecosystem\n\n- web_tools shipped in 0.18.0.\n  - source: https://example.com/changelog\n  - changes: nothing\n\n## Record\n\nResearched earlier, in D12.\n'
    writeFileSync(researchPath(dir), `Researched 2026-01-01 · pnpm-lock.yaml 0000000 · fascicle 0.1.0${findings}`)
    const r = captureIo(() => research(dir, ['--stamp', 'fascicle']))
    expect(r.code).toBe(0)
    expect(readFileSync(researchPath(dir), 'utf8')).toBe(`Researched ${TODAY} · pnpm-lock.yaml ${short(dir, 'pnpm-lock.yaml')} · fascicle 0.18.0${findings}`)
  })

  it('keeps the dependencies the stamp already names when none is named', async () => {
    const { dir } = await started()
    install(dir, 'fascicle', '0.19.2')
    writeFileSync(researchPath(dir), 'Researched 2026-01-01 · fascicle 0.18.0, checkride 0.20.0\n\n## Record\n')
    captureIo(() => research(dir, ['--stamp']))
    expect(readFileSync(researchPath(dir), 'utf8')).toBe(`Researched ${TODAY} · fascicle 0.19.2, checkride\n\n## Record\n`)
  })

  it('puts the stamp above findings written before any stamp, and keeps them', async () => {
    const { dir } = await started()
    writeFileSync(researchPath(dir), '## Record\n\n- tried in 2025\n')
    captureIo(() => research(dir, ['--stamp']))
    expect(readFileSync(researchPath(dir), 'utf8')).toBe(`Researched ${TODAY}\n\n## Record\n\n- tried in 2025\n`)
  })

  it('refuses a dependency name the stamp cannot hold, and writes nothing', async () => {
    const { dir } = await started()
    const r = captureIo(() => research(dir, ['--stamp', 'a,b']))
    expect(r.code).toBe(1)
    expect(r.stderr).toBe('plumbbob: a dependency name cannot hold a space, a comma, or a middle dot ("a,b")\n  → plumbbob research --stamp <dep>...\n')
    expect(existsSync(researchPath(dir))).toBe(false)
  })

  it('keeps a first line that opens on Researched and is not a stamp, and puts the stamp above it', async () => {
    const { dir } = await started()
    const prose = 'Researched the fascicle API on the train, it has no retries.\n\n## Record\n'
    writeFileSync(researchPath(dir), prose)
    expect(captureIo(() => research(dir, ['--stamp', 'fascicle'])).code).toBe(0)
    expect(readFileSync(researchPath(dir), 'utf8')).toBe(`Researched ${TODAY} · fascicle\n\n${prose}`)
    // A stamp edited past reading keeps its line too, so the names on it are still there to read.
    const edited = 'Researched 2026-11-11 · fascicle ^0.18.0 (peer)\n'
    writeFileSync(researchPath(dir), edited)
    expect(captureIo(() => research(dir, ['--stamp'])).code).toBe(0)
    expect(readFileSync(researchPath(dir), 'utf8')).toBe(`Researched ${TODAY}\n\n${edited}`)
  })

  it('refuses a build with no folder, and a slug that is a path, and writes nothing', async () => {
    const { dir, slug } = await started()
    for (const flag of ['--stamp', null]) {
      for (const named of ['nope', '../../outside', 'a/b', '..']) {
        const r = captureIo(() => research(dir, [...(flag === null ? [] : [flag]), '--build', named, 'fascicle']))
        expect(r.code).toBe(1)
        expect(r.stdout).toBe('')
        expect(r.stderr).toBe(`plumbbob: no build named ${JSON.stringify(named)} in .plumbbob/builds/ (${slug})\n`)
      }
    }
    expect(existsSync(join(dir, '.plumbbob', 'builds', 'nope'))).toBe(false)
    expect(existsSync(join(dir, 'outside'))).toBe(false)
    expect(existsSync(researchPath(dir))).toBe(false)
    // The build's own slug still stamps.
    expect(captureIo(() => research(dir, ['--stamp', '--build', slug])).code).toBe(0)
    expect(existsSync(researchPath(dir, slug))).toBe(true)
  })

  it('refuses outside a repo and with no session', () => {
    expect(captureIo(() => research(makeTempDir(), ['--stamp'])).code).toBe(1)
    const r = captureIo(() => research(makeTempRepo(), ['--stamp']))
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('plumbbob: no active session')
  })
})

describe('research, without --stamp', () => {
  it('says there is no research.md, and writes none', async () => {
    const { dir } = await started()
    const r = captureIo(() => research(dir, []))
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('plumbbob: no research.md in this build\n  → plumbbob research --stamp <dep>...\n')
    expect(existsSync(researchPath(dir))).toBe(false)
  })

  it('says a research.md has no stamp', async () => {
    const { dir, slug } = await started()
    writeFileSync(researchPath(dir), '## Record\n')
    const r = captureIo(() => research(dir, []))
    expect(r.stdout).toBe(`plumbbob: .plumbbob/builds/${slug}/research.md has no stamp on its first line\n  → plumbbob research --stamp <dep>...\n`)
  })

  it('prints the stamp and says it is current', async () => {
    const { dir } = await started()
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'one\n')
    captureIo(() => research(dir, ['--stamp']))
    const r = captureIo(() => research(dir, []))
    expect(r.code).toBe(0)
    expect(r.stdout).toBe(`Researched ${TODAY} · pnpm-lock.yaml ${short(dir, 'pnpm-lock.yaml')}\nplumbbob: research is current, nothing stamped has moved\n`)
  })

  it('names what moved, and leaves the file alone', async () => {
    const { dir } = await started()
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'one\n')
    install(dir, 'fascicle', '0.18.0')
    captureIo(() => research(dir, ['--stamp', 'fascicle']))
    const before = readFileSync(researchPath(dir), 'utf8')
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'two\n')
    install(dir, 'fascicle', '0.19.2')
    const r = captureIo(() => research(dir, []))
    expect(r.code).toBe(0)
    expect(r.stdout).toBe(
      `${before}plumbbob: research predates a lockfile change (fascicle 0.18.0 → 0.19.2)\n  → run the ecosystem lens again, then plumbbob research --stamp\n`,
    )
    expect(readFileSync(researchPath(dir), 'utf8')).toBe(before)
  })
})

describe('the staleness row', () => {
  it('says nothing with no research.md, no stamp, or nothing moved', async () => {
    const { dir } = await started()
    expect(researchStale(dir)).toBeNull()
    writeFileSync(researchPath(dir), '## Record\n')
    expect(researchStale(dir)).toBeNull()
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'one\n')
    captureIo(() => research(dir, ['--stamp']))
    expect(researchStale(dir)).toBeNull()
  })

  it('names the lockfile when only its hash moved, and the dependency when its version moved with it', async () => {
    const { dir } = await started()
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'one\n')
    install(dir, 'fascicle', '0.18.0')
    captureIo(() => research(dir, ['--stamp', 'fascicle']))
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'two\n')
    expect(researchStale(dir)).toBe('predates a lockfile change: pnpm-lock.yaml')
    install(dir, 'fascicle', '0.19.2')
    expect(researchStale(dir)).toBe('predates a lockfile change: fascicle 0.18.0 → 0.19.2')
  })

  it('rides the dashboard and the plan card once a stamped lockfile moves, and leaves both byte-identical until then', async () => {
    const { dir } = await started()
    const dashboard = (): string => captureIo(() => status(dir)).stdout
    const card = (): string => captureIo(() => handoff(dir, ['--plan'])).stdout

    // No research.md: the output this build printed before the research pass existed.
    const plainDashboard = dashboard()
    const plainCard = card()
    expect(plainDashboard).not.toContain('research')
    expect(plainCard).not.toContain('Research')

    // A research.md with no stamp, then a current stamp: still the same bytes.
    writeFileSync(researchPath(dir), '## Record\n\n- nothing found\n')
    expect(dashboard()).toBe(plainDashboard)
    expect(card()).toBe(plainCard)
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'one\n')
    install(dir, 'fascicle', '0.18.0')
    captureIo(() => research(dir, ['--stamp', 'fascicle']))
    expect(dashboard()).toBe(plainDashboard)
    expect(card()).toBe(plainCard)

    // The lockfile moves, and the dependency with it: one row on each surface, and nothing else changes.
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'two\n')
    install(dir, 'fascicle', '0.19.2')
    const row = 'research predates a lockfile change: fascicle 0.18.0 → 0.19.2'
    const staleDashboard = dashboard().split('\n')
    expect(staleDashboard.filter((l) => l !== row)).toEqual(plainDashboard.split('\n'))
    expect(staleDashboard[staleDashboard.indexOf(row) - 1]).toBe('last checkpoint  none yet')
    const staleCard = card().split('\n')
    const cardRow = '| Research | predates a lockfile change: fascicle 0.18.0 → 0.19.2 |'
    expect(staleCard.filter((l) => l !== cardRow)).toEqual(plainCard.split('\n'))
    expect(staleCard.filter((l) => l === cardRow)).toHaveLength(1)

    // Restamped, both read as they did.
    captureIo(() => research(dir, ['--stamp']))
    expect(dashboard()).toBe(plainDashboard)
    expect(card()).toBe(plainCard)
  })

  it('renders on the dashboard only when orient is handed a clause', () => {
    const input = { intent: INTENT, buildLog: '', checkpoints: '', inFlight: null, spiking: false, requested: null, outOfBand: 0, waiting: null }
    const plain = formatOrientation(orient(input))
    expect(formatOrientation(orient({ ...input, research: null }))).toBe(plain)
    expect(formatOrientation(orient({ ...input, research: 'predates a lockfile change: pnpm-lock.yaml' }))).toContain(
      '\nresearch predates a lockfile change: pnpm-lock.yaml\n',
    )
  })

  it('stays off the step pause and the boundary', async () => {
    const { dir } = await started()
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'one\n')
    captureIo(() => research(dir, ['--stamp']))
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'two\n')
    expect(captureIo(() => handoff(dir, [])).stdout).not.toContain('Research')
  })
})
