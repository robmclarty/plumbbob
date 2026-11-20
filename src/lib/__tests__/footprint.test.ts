import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { gatherFootprint, renderFootprint, type FootprintFacts, type FootprintStep } from '../footprint.ts'
import { settingsPath } from '../settings.ts'
import { checkpointsPath, intentPath, sidecarDir } from '../sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

// One landed step's facts: its number, the files its commit changed, each as
// `[path, added, removed]`, and whether a command proved it.
function landed(n: number, files: ReadonlyArray<readonly [string, number, number]>, byCommand = true): FootprintStep {
  return { n, files: files.map(([path, added, removed]) => ({ path, added, removed })), byCommand }
}

// The section as the renderer returns it: the heading, a blank line, the
// lines, and a closing newline.
function section(...lines: ReadonlyArray<string>): string {
  return ['## Footprint', '', ...lines, ''].join('\n')
}

describe('renderFootprint — D166 (finish-footprint)', () => {
  it('is null when no step landed, with a contract configured or without', () => {
    expect(renderFootprint({ steps: [], contract: [] })).toBeNull()
    expect(renderFootprint({ steps: [], contract: ['packages/shared/'] })).toBeNull()
  })

  it('renders Proof and Size alone, in the singular, for one step with no contract configured', () => {
    expect(renderFootprint({ steps: [landed(1, [['src/a.ts', 3, 1]])], contract: [] })).toBe(
      section('- **Proof**: 1 of 1 step by a command', '- **Size**: 1 file, +3 -1, over 1 step'),
    )
  })

  it('counts a file several steps changed once, and sums its lines across them', () => {
    const steps = [
      landed(1, [
        ['src/a.ts', 10, 0],
        ['src/b.ts', 2, 2],
      ]),
      landed(2, [['src/a.ts', 5, 3]]),
      landed(3, [['src/c.ts', 1, 0]]),
    ]
    expect(renderFootprint({ steps, contract: [] })).toBe(
      section('- **Proof**: 3 of 3 steps by a command', '- **Size**: 3 files, +18 -5, over 3 steps'),
    )
  })

  it('names the one step proved in words', () => {
    const steps = [landed(1, [['src/a.ts', 1, 0]]), landed(2, [['src/b.ts', 1, 0]], false), landed(3, [['src/c.ts', 1, 0]])]
    expect(renderFootprint({ steps, contract: [] })).toContain('\n- **Proof**: 2 of 3 steps by a command; step 2 in words\n')
  })

  it('names several steps proved in words, and counts 0 when no command proved any', () => {
    const some = [landed(1, [], false), landed(2, []), landed(3, [], false)]
    expect(renderFootprint({ steps: some, contract: [] })).toContain('\n- **Proof**: 1 of 3 steps by a command; steps 1, 3 in words\n')
    const none = [landed(1, [], false), landed(2, [], false)]
    expect(renderFootprint({ steps: none, contract: [] })).toContain('\n- **Proof**: 0 of 2 steps by a command; steps 1, 2 in words\n')
    expect(renderFootprint({ steps: [landed(1, [], false)], contract: [] })).toContain(
      '\n- **Proof**: 0 of 1 step by a command; step 1 in words\n',
    )
  })

  it('says none touched, on the first line, when a contract is configured and no step reached it', () => {
    const steps = [landed(1, [['src/a.ts', 3, 1]])]
    // A file entry covers that path alone, so a neighbour that shares its prefix is no touch.
    const beside = [landed(1, [['schemas/api.json.bak', 1, 0]])]
    expect(renderFootprint({ steps, contract: ['packages/shared/', 'schemas/api.json'] })).toBe(
      section('- **Contract**: none touched', '- **Proof**: 1 of 1 step by a command', '- **Size**: 1 file, +3 -1, over 1 step'),
    )
    expect(renderFootprint({ steps: beside, contract: ['schemas/api.json'] })).toContain('\n- **Contract**: none touched\n')
  })

  it('names the one entry a step touched, with that step, and leaves the others out', () => {
    const steps = [landed(1, [['src/a.ts', 3, 1]]), landed(2, [['schemas/api.json', 4, 0]])]
    expect(renderFootprint({ steps, contract: ['packages/shared/', 'schemas/api.json'] })).toContain(
      '\n- **Contract**: touched `schemas/api.json` (step 2)\n',
    )
  })

  it('names an entry the build changed outside every step as outside a step, so none touched speaks for the whole build', () => {
    const steps = [landed(1, [['src/a.ts', 3, 1]])]
    const contract = ['packages/shared/', 'schemas/api.json']
    expect(renderFootprint({ steps, contract, outside: ['schemas/api.json', 'README.md'] })).toContain(
      '\n- **Contract**: touched `schemas/api.json` (outside a step)\n',
    )
    // A path outside the steps that sits under no entry is no touch.
    expect(renderFootprint({ steps, contract, outside: ['README.md'] })).toContain('\n- **Contract**: none touched\n')
    // Size and Proof are the steps' alone.
    expect(renderFootprint({ steps, contract, outside: ['schemas/api.json'] })).toContain(
      '\n- **Proof**: 1 of 1 step by a command\n- **Size**: 1 file, +3 -1, over 1 step\n',
    )
  })

  it('names the steps for an entry a step reached, whether or not it was changed outside a step as well', () => {
    const steps = [landed(1, [['src/a.ts', 3, 1]]), landed(2, [['packages/shared/types.ts', 4, 0]])]
    const contract = ['packages/shared/', 'schemas/api.json']
    expect(renderFootprint({ steps, contract, outside: ['packages/shared/index.ts', 'schemas/api.json'] })).toContain(
      '\n- **Contract**: touched `packages/shared/` (step 2) and `schemas/api.json` (outside a step)\n',
    )
  })

  it('names two entries with every step that touched each, as the spec writes it', () => {
    const facts: FootprintFacts = {
      steps: [
        landed(1, [
          ['src/a.ts', 50, 0],
          ['src/b.ts', 40, 2],
          ['test/a.test.ts', 30, 0],
        ]),
        landed(2, [
          ['src/c.ts', 20, 5],
          ['src/d.ts', 10, 0],
          ['test/c.test.ts', 25, 0],
        ]),
        landed(3, [
          ['packages/shared/types.ts', 30, 10],
          ['src/a.ts', 5, 5],
        ]),
        landed(
          4,
          [
            ['docs/api.md', 40, 0],
            ['docs/guide.md', 10, 0],
          ],
          false,
        ),
        landed(5, [
          ['packages/shared/index.ts', 8, 4],
          ['schemas/api.json', 12, 6],
          ['src/e.ts', 10, 0],
        ]),
        landed(6, [
          ['src/f.ts', 15, 5],
          ['test/f.test.ts', 5, 5],
        ]),
      ],
      contract: ['packages/shared/', 'schemas/api.json'],
    }
    expect(renderFootprint(facts)).toBe(
      section(
        '- **Contract**: touched `packages/shared/` (steps 3, 5) and `schemas/api.json` (step 5)',
        '- **Proof**: 5 of 6 steps by a command; step 4 in words',
        '- **Size**: 14 files, +310 -42, over 6 steps',
      ),
    )
  })

  it("lists three entries in the setting's order, whatever order the steps reached them in", () => {
    const steps = [
      landed(1, [
        ['a/x.ts', 1, 0],
        ['c/y.ts', 1, 0],
      ]),
      landed(2, [['b.json', 1, 0]]),
      landed(3, [['c/z.ts', 1, 0]]),
    ]
    expect(renderFootprint({ steps, contract: ['c/', 'b.json', 'never/', 'a/'] })).toContain(
      '\n- **Contract**: touched `c/` (steps 1, 3), `b.json` (step 2) and `a/` (step 1)\n',
    )
  })

  it('counts a binary file as a file with no lines', () => {
    const steps = [
      landed(1, [
        ['src/a.ts', 3, 0],
        ['site/logo.png', 0, 0],
      ]),
    ]
    expect(renderFootprint({ steps, contract: [] })).toContain('\n- **Size**: 2 files, +3 -0, over 1 step\n')
  })

  it("leaves plumbbob's own artifacts out of Size, down to 0 files for a step that changed nothing else", () => {
    const bookkeeping: ReadonlyArray<readonly [string, number, number]> = [
      ['.plumbbob/builds/demo/intent.md', 1, 1],
      ['.plumbbob/builds/demo/build-log.md', 4, 0],
    ]
    expect(renderFootprint({ steps: [landed(1, [['src/a.ts', 3, 1], ...bookkeeping])], contract: [] })).toContain(
      '\n- **Size**: 1 file, +3 -1, over 1 step\n',
    )
    expect(renderFootprint({ steps: [landed(1, bookkeeping)], contract: [] })).toContain('\n- **Size**: 0 files, +0 -0, over 1 step\n')
  })

  it('still names a contract entry under .plumbbob/ that a step reached', () => {
    const steps = [
      landed(1, [
        ['.plumbbob/settings.json', 1, 1],
        ['src/a.ts', 1, 0],
      ]),
    ]
    expect(renderFootprint({ steps, contract: ['.plumbbob/settings.json'] })).toBe(
      section(
        '- **Contract**: touched `.plumbbob/settings.json` (step 1)',
        '- **Proof**: 1 of 1 step by a command',
        '- **Size**: 1 file, +1 -0, over 1 step',
      ),
    )
  })

  it('keeps the last record of a step number given twice', () => {
    const steps = [landed(2, [['src/old.ts', 9, 9]], false), landed(1, [['src/a.ts', 1, 0]]), landed(2, [['src/b.ts', 2, 0]])]
    expect(renderFootprint({ steps, contract: ['src/old.ts', 'src/b.ts'] })).toBe(
      section(
        '- **Contract**: touched `src/b.ts` (step 2)',
        '- **Proof**: 2 of 2 steps by a command',
        '- **Size**: 2 files, +3 -0, over 2 steps',
      ),
    )
  })

  it('reads the steps in number order, whatever order they were gathered in', () => {
    const steps = [landed(10, [['shared/a.ts', 1, 0]], false), landed(9, [['shared/b.ts', 1, 0]], false), landed(2, [['shared/c.ts', 1, 0]], false)]
    expect(renderFootprint({ steps, contract: ['shared/'] })).toBe(
      section(
        '- **Contract**: touched `shared/` (steps 2, 9, 10)',
        '- **Proof**: 0 of 3 steps by a command; steps 2, 9, 10 in words',
        '- **Size**: 3 files, +3 -0, over 3 steps',
      ),
    )
  })
})

const SLUG = 'footprint'

// A plan whose six steps cover every way a proof reads: on a command, on
// words, as the older clause, absent, and doubled.
const INTENT = [
  '# Footprint fixture',
  '',
  '## Steps',
  '',
  '1. [x] First',
  '   - seam: `src/a.ts`',
  '   - proof: `pnpm test` passes',
  '2. [x] Second',
  '   - seam: `docs/`',
  '   - proof: the page reads right in a browser',
  '3. [x] Third — **done when:** c works.',
  '   - seam: `src/c.ts`',
  '4. [x] Fourth, with no proof at all',
  '   - seam: `src/d.ts`',
  '5. [x] Fifth, with two proofs',
  '   - seam: `src/e.ts`',
  '   - proof: `pnpm test` passes',
  '   - proof: `pnpm lint` passes',
  '',
].join('\n')

// Run git in a fixture and return its trimmed stdout.
function git(dir: string, ...args: ReadonlyArray<string>): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

// Commit `files` (path to content; none makes an empty commit) and return the
// commit's sha.
function commitFiles(dir: string, files: Readonly<Record<string, string | Buffer>> = {}): string {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'a step')
  return git(dir, 'rev-parse', 'HEAD')
}

// Write the build's ledger, and its plan unless `intent` is null, where the
// gatherer reads them. Written after the commits, so no commit carries them.
function writeBuild(dir: string, checkpoints: string, intent: string | null = INTENT): void {
  mkdirSync(dirname(checkpointsPath(dir, SLUG)), { recursive: true })
  writeFileSync(checkpointsPath(dir, SLUG), checkpoints)
  if (intent !== null) {
    writeFileSync(intentPath(dir, SLUG), intent)
  }
}

describe('gatherFootprint — D166 (finish-footprint)', () => {
  it("reads each landed step's commit and proof, and the contract from the tracked settings", () => {
    const dir = makeTempRepo()
    const base = git(dir, 'rev-parse', 'HEAD')
    const first = commitFiles(dir, { 'src/a.ts': 'one\ntwo\n', '.plumbbob/builds/footprint/build-log.md': 'a line\n' })
    const second = commitFiles(dir, { 'docs/page.md': 'a\n', 'docs/logo.png': Buffer.from([0x89, 0x50, 0x00, 0x4e, 0x47]) })
    writeBuild(dir, `baseline ${base}\nplan ${base}\nstep 1 ${first}\nstep 2 ${second}\n`)
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(settingsPath(dir), JSON.stringify({ contractPaths: ['docs/'] }))

    const facts = gatherFootprint(dir, SLUG)
    expect(facts).toMatchObject({
      steps: [
        {
          n: 1,
          files: [
            { added: 1, removed: 0, path: '.plumbbob/builds/footprint/build-log.md', untracked: false },
            { added: 2, removed: 0, path: 'src/a.ts', untracked: false },
          ],
          byCommand: true,
        },
        {
          n: 2,
          files: [
            { added: 0, removed: 0, path: 'docs/logo.png', untracked: false },
            { added: 1, removed: 0, path: 'docs/page.md', untracked: false },
          ],
          byCommand: false,
        },
      ],
      contract: ['docs/'],
    })
    // The whole road, ledger to markdown: the artifact is out of Size, and the
    // binary file is a file with no lines.
    expect(renderFootprint(facts as FootprintFacts)).toBe(
      section(
        '- **Contract**: touched `docs/` (step 2)',
        '- **Proof**: 1 of 2 steps by a command; step 2 in words',
        '- **Size**: 3 files, +3 -0, over 2 steps',
      ),
    )
  })

  it('reads a proof as by a command only when it opens on one: words, the older clause, none, a doubled line and a step the plan lacks are not', () => {
    const dir = makeTempRepo()
    const shas = [1, 2, 3, 4, 5, 6].map(() => commitFiles(dir))
    writeBuild(dir, shas.map((sha, i) => `step ${i + 1} ${sha}\n`).join(''))
    expect(gatherFootprint(dir, SLUG)?.steps.map((step) => [step.n, step.byCommand])).toEqual([
      [1, true],
      [2, false],
      [3, false],
      [4, false],
      [5, false],
      [6, false],
    ])
  })

  it('reads the landing on the branch for a step reverted and landed again, whether or not the repo still holds the commit it replaced', () => {
    const dir = makeTempRepo()
    const base = git(dir, 'rev-parse', 'HEAD')
    const reverted = commitFiles(dir, { 'src/old.ts': 'one\ntwo\nthree\n' })
    git(dir, 'reset', '-q', '--hard', base)
    const second = commitFiles(dir, { 'docs/page.md': 'a\n' })
    const again = commitFiles(dir, { 'src/a.ts': 'one\n' })
    const landed = [
      { n: 1, files: [{ added: 1, removed: 0, path: 'src/a.ts', untracked: false }], byCommand: true },
      { n: 2, files: [{ added: 1, removed: 0, path: 'docs/page.md', untracked: false }], byCommand: false },
    ]
    // The revert left the first landing in the repo and off the branch.
    writeBuild(dir, `step 1 ${reverted}\nstep 2 ${second}\nstep 1 ${again}\n`)
    expect(gatherFootprint(dir, SLUG)?.steps).toEqual(landed)
    // The same ledger in a clone that never held it.
    writeBuild(dir, `step 1 deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\nstep 2 ${second}\nstep 1 ${again}\n`)
    expect(gatherFootprint(dir, SLUG)?.steps).toEqual(landed)
  })

  it('reads both landings of a step that landed twice with no revert between, since both are on the branch', () => {
    const dir = makeTempRepo()
    const first = commitFiles(dir, { 'packages/shared/types.ts': 'export type A = 1\nexport type B = 2\n' })
    const second = commitFiles(dir, { 'docs/page.md': 'a\n' })
    // Step 1's tick was cleared by hand, and it landed again on top of step 2.
    const again = commitFiles(dir, { 'src/a.ts': 'one\n', 'packages/shared/types.ts': 'export type A = 1\n' })
    writeBuild(dir, `step 1 ${first}\nstep 2 ${second}\nstep 1 ${again}\n`)
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(settingsPath(dir), JSON.stringify({ contractPaths: ['packages/shared/'] }))

    const facts = gatherFootprint(dir, SLUG)
    expect(facts?.steps).toEqual([
      {
        n: 1,
        files: [
          { added: 2, removed: 0, path: 'packages/shared/types.ts', untracked: false },
          { added: 0, removed: 1, path: 'packages/shared/types.ts', untracked: false },
          { added: 1, removed: 0, path: 'src/a.ts', untracked: false },
        ],
        byCommand: true,
      },
      { n: 2, files: [{ added: 1, removed: 0, path: 'docs/page.md', untracked: false }], byCommand: false },
    ])
    expect(renderFootprint(facts as FootprintFacts)).toBe(
      section(
        '- **Contract**: touched `packages/shared/` (step 1)',
        '- **Proof**: 1 of 2 steps by a command; step 2 in words',
        '- **Size**: 3 files, +4 -1, over 2 steps',
      ),
    )
  })

  it('leaves out a step whose only landing a revert took off the branch, and counts the steps still on it', () => {
    const dir = makeTempRepo()
    const first = commitFiles(dir, { 'src/a.ts': 'one\n' })
    const second = commitFiles(dir, { 'docs/page.md': 'a\n' })
    const third = commitFiles(dir, { 'packages/shared/types.ts': 'export type A = 1\n' })
    // `plumbbob revert --to 2` carries the ledger across the reset, so step 3's line stays.
    git(dir, 'reset', '-q', '--hard', second)
    writeBuild(dir, `step 1 ${first}\nstep 2 ${second}\nstep 3 ${third}\n`)
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(settingsPath(dir), JSON.stringify({ contractPaths: ['packages/shared/'] }))

    const facts = gatherFootprint(dir, SLUG)
    expect(facts?.steps.map((step) => step.n)).toEqual([1, 2])
    expect(renderFootprint(facts as FootprintFacts)).toBe(
      section('- **Contract**: none touched', '- **Proof**: 1 of 2 steps by a command; step 2 in words', '- **Size**: 2 files, +2 -0, over 2 steps'),
    )
  })

  it('gathers no steps when a revert took every landing off the branch, so no section renders', () => {
    const dir = makeTempRepo()
    const base = git(dir, 'rev-parse', 'HEAD')
    const first = commitFiles(dir, { 'src/a.ts': 'one\n' })
    git(dir, 'reset', '-q', '--hard', base)
    writeBuild(dir, `baseline ${base}\nstep 1 ${first}\n`)
    const facts = gatherFootprint(dir, SLUG)
    expect(facts).toMatchObject({ steps: [], contract: [] })
    expect(renderFootprint(facts as FootprintFacts)).toBeNull()
  })

  it('gives a commit two steps recorded to the first of them, so its lines are summed once', () => {
    const dir = makeTempRepo()
    const shared = commitFiles(dir, { 'src/a.ts': 'one\ntwo\n' })
    writeBuild(dir, `step 1 ${shared}\nstep 2 ${shared}\n`)
    const facts = gatherFootprint(dir, SLUG)
    expect(facts?.steps.map((step) => step.files.map((file) => file.path))).toEqual([['src/a.ts'], []])
    expect(renderFootprint(facts as FootprintFacts)).toContain('\n- **Size**: 1 file, +2 -0, over 2 steps\n')
  })

  it('gathers the paths changed outside the steps: a commit made by hand between checkpoints, and the tree finish is about to commit', () => {
    const dir = makeTempRepo()
    const base = git(dir, 'rev-parse', 'HEAD')
    const first = commitFiles(dir, { 'src/a.ts': 'one\n' })
    commitFiles(dir, { 'schemas/api.json': '{}\n' }) // by hand, on no ledger line
    const second = commitFiles(dir, { 'src/b.ts': 'two\n' })
    writeBuild(dir, `baseline ${base}\nplan ${base}\nstep 1 ${first}\nstep 2 ${second}\n`)
    mkdirSync(join(dir, 'packages/shared'), { recursive: true })
    writeFileSync(join(dir, 'packages/shared/types.ts'), 'export type A = 1\n') // uncommitted
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(settingsPath(dir), JSON.stringify({ contractPaths: ['packages/shared/', 'schemas/api.json', 'src/b.ts'] }))

    const facts = gatherFootprint(dir, SLUG) as FootprintFacts
    expect(facts.outside).toContain('schemas/api.json')
    expect(facts.outside).toContain('packages/shared/types.ts')
    // A step's own commit is the step's, never outside.
    expect(facts.outside).not.toContain('src/a.ts')
    expect(facts.outside).not.toContain('src/b.ts')
    expect(renderFootprint(facts)).toContain(
      '\n- **Contract**: touched `packages/shared/` (outside a step), `schemas/api.json` (outside a step) and `src/b.ts` (step 2)\n',
    )
    // The steps' lines do not move for it.
    expect(renderFootprint(facts)).toContain('\n- **Size**: 2 files, +2 -0, over 2 steps\n')
  })

  it('still reads the uncommitted tree as outside when the ledger has no baseline, or one the repo does not hold', () => {
    const dir = makeTempRepo()
    const first = commitFiles(dir, { 'src/a.ts': 'one\n' })
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(settingsPath(dir), JSON.stringify({ contractPaths: ['schemas/'] }))
    writeFileSync(join(dir, 'schemas.txt'), 'beside\n')
    mkdirSync(join(dir, 'schemas'), { recursive: true })
    writeFileSync(join(dir, 'schemas/api.json'), '{}\n')
    for (const ledger of [`step 1 ${first}\n`, `baseline ${'0'.repeat(40)}\nstep 1 ${first}\n`]) {
      writeBuild(dir, ledger)
      expect(renderFootprint(gatherFootprint(dir, SLUG) as FootprintFacts)).toContain(
        '\n- **Contract**: touched `schemas/` (outside a step)\n',
      )
    }
  })

  it('is null when a recorded commit does not resolve', () => {
    const dir = makeTempRepo()
    const first = commitFiles(dir, { 'src/a.ts': 'one\n' })
    writeBuild(dir, `step 1 ${first}\nstep 2 def5678\n`)
    expect(gatherFootprint(dir, SLUG)).toBeNull()
  })

  it('is null when the ledger or the plan will not read', () => {
    const noLedger = makeTempRepo()
    expect(gatherFootprint(noLedger, SLUG)).toBeNull()
    const noPlan = makeTempRepo()
    writeBuild(noPlan, `step 1 ${commitFiles(noPlan, { 'src/a.ts': 'one\n' })}\n`, null)
    expect(gatherFootprint(noPlan, SLUG)).toBeNull()
  })

  it('gathers no steps from a ledger that records none, and no contract from a repo that sets none', () => {
    const dir = makeTempRepo()
    const base = git(dir, 'rev-parse', 'HEAD')
    writeBuild(dir, `baseline ${base}\nplan ${base}\n`)
    expect(gatherFootprint(dir, SLUG)).toMatchObject({ steps: [], contract: [] })
  })
})
