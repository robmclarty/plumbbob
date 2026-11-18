import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  CONTRACT_VERSION,
  ENVELOPE_STATUSES,
  SLOTS,
  builtinAgentsDir,
  composeStepContext,
  formatAgentList,
  isPathBinding,
  isSlot,
  listAgents,
  parseEnvelope,
  parseManifest,
  personalAgentsDir,
  projectAgentsDir,
  resolveAgent,
  resolveBinding,
  runAgent,
  STOP_GRACE_SECONDS,
} from '../agents.ts'
import type { StepContext } from '../agents.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

// Drop an agent (its agent.json) into `agentsDir/name/`. Extra keys let a test
// write a malformed manifest without a typed escape hatch.
function writeAgent(agentsDir: string, name: string, manifest: Record<string, unknown>): void {
  const dir = join(agentsDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'agent.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { contract: CONTRACT_VERSION, name: 'reviewer', command: 'sh run.sh', slots: ['after'], ...overrides }
}

function validManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract: CONTRACT_VERSION,
    name: 'reviewer',
    command: 'sh run.sh',
    slots: ['before', 'after'],
    ...overrides,
  }
}

function validEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract: CONTRACT_VERSION,
    status: 'done',
    summary: 'reviewed the diff',
    ...overrides,
  }
}

describe('parseManifest', () => {
  it('accepts a well-formed manifest and narrows its fields', () => {
    const result = parseManifest(validManifest({ description: 'a reviewer', when: 'before every build step' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest).toEqual({
      contract: CONTRACT_VERSION,
      name: 'reviewer',
      command: 'sh run.sh',
      slots: ['before', 'after'],
      description: 'a reviewer',
      when: 'before every build step',
    })
  })

  it('trims the name and defaults absent prose fields to empty', () => {
    const result = parseManifest(validManifest({ name: '  reviewer  ' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.name).toBe('reviewer')
    expect(result.manifest.description).toBe('')
    expect(result.manifest.when).toBe('')
  })

  it('tolerates unknown keys, dropping them from the narrowed manifest', () => {
    const result = parseManifest(validManifest({ author: 'rob', model: 'fable-5' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest).not.toHaveProperty('author')
    expect(result.manifest).not.toHaveProperty('model')
  })

  it('collapses duplicate slots', () => {
    const result = parseManifest(validManifest({ slots: ['before', 'before', 'after'] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.slots).toEqual(['before', 'after'])
  })

  it('rejects a non-object manifest', () => {
    expect(parseManifest(null).ok).toBe(false)
    expect(parseManifest([]).ok).toBe(false)
    expect(parseManifest('nope').ok).toBe(false)
  })

  it('rejects a missing or blank name', () => {
    const missing = parseManifest(validManifest({ name: undefined }))
    expect(missing.ok).toBe(false)
    const blank = parseManifest(validManifest({ name: '   ' }))
    expect(blank.ok).toBe(false)
    if (blank.ok) return
    expect(blank.error).toMatch(/name/)
  })

  it('rejects a missing or blank command', () => {
    const result = parseManifest(validManifest({ command: '' }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/command/)
  })

  it('rejects an empty, non-array, or stranger slots list', () => {
    expect(parseManifest(validManifest({ slots: [] })).ok).toBe(false)
    expect(parseManifest(validManifest({ slots: 'before' })).ok).toBe(false)
    const stranger = parseManifest(validManifest({ slots: ['before', 'during'] }))
    expect(stranger.ok).toBe(false)
    if (stranger.ok) return
    expect(stranger.error).toMatch(/during/)
  })

  it('refuses a contract major-version mismatch with an upgrade hint', () => {
    const newer = parseManifest(validManifest({ contract: CONTRACT_VERSION + 1 }))
    expect(newer.ok).toBe(false)
    if (newer.ok) return
    expect(newer.error).toMatch(/contract/)
    expect(newer.error).toMatch(/plumbbob CLI/)

    const older = parseManifest(validManifest({ contract: CONTRACT_VERSION - 1 }))
    expect(older.ok).toBe(false)
    if (older.ok) return
    expect(older.error).toMatch(/Upgrade the agent/)
  })

  it('refuses a missing or non-integer contract', () => {
    expect(parseManifest(validManifest({ contract: undefined })).ok).toBe(false)
    expect(parseManifest(validManifest({ contract: 1.5 })).ok).toBe(false)
    expect(parseManifest(validManifest({ contract: '1' })).ok).toBe(false)
  })
})

describe('parseEnvelope', () => {
  it('accepts a minimal envelope and defaults its optional fields', () => {
    const result = parseEnvelope(validEnvelope())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.envelope).toEqual({
      contract: CONTRACT_VERSION,
      status: 'done',
      summary: 'reviewed the diff',
      body: '',
      parked: [],
      notes: '',
      evidence: [],
    })
  })

  it('carries body, notes, and trims parked lines', () => {
    const result = parseEnvelope(
      validEnvelope({ body: 'the long form', notes: 'a heads-up', parked: ['  refactor the parser  ', 'add a test'] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.envelope.body).toBe('the long form')
    expect(result.envelope.notes).toBe('a heads-up')
    expect(result.envelope.parked).toEqual(['refactor the parser', 'add a test'])
  })

  it('accepts every declared status', () => {
    for (const status of ENVELOPE_STATUSES) {
      expect(parseEnvelope(validEnvelope({ status })).ok).toBe(true)
    }
  })

  it('tolerates unknown envelope keys', () => {
    const result = parseEnvelope(validEnvelope({ elapsedMs: 1200 }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.envelope).not.toHaveProperty('elapsedMs')
  })

  it('rejects a non-object envelope', () => {
    expect(parseEnvelope(null).ok).toBe(false)
    expect(parseEnvelope([]).ok).toBe(false)
    expect(parseEnvelope(42).ok).toBe(false)
  })

  it('rejects an unknown or missing status', () => {
    const unknown = parseEnvelope(validEnvelope({ status: 'finished' }))
    expect(unknown.ok).toBe(false)
    if (unknown.ok) return
    expect(unknown.error).toMatch(/status/)
    expect(parseEnvelope(validEnvelope({ status: undefined })).ok).toBe(false)
  })

  it('rejects a missing or blank summary', () => {
    expect(parseEnvelope(validEnvelope({ summary: '' })).ok).toBe(false)
    expect(parseEnvelope(validEnvelope({ summary: '   ' })).ok).toBe(false)
    expect(parseEnvelope(validEnvelope({ summary: undefined })).ok).toBe(false)
  })

  it('rejects a malformed parked list rather than dropping concerns', () => {
    expect(parseEnvelope(validEnvelope({ parked: 'refactor' })).ok).toBe(false)
    expect(parseEnvelope(validEnvelope({ parked: ['ok', ''] })).ok).toBe(false)
    expect(parseEnvelope(validEnvelope({ parked: ['ok', 3] })).ok).toBe(false)
  })

  it('refuses a contract major-version mismatch with an upgrade hint', () => {
    const result = parseEnvelope(validEnvelope({ contract: CONTRACT_VERSION + 1 }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/contract/)
    expect(result.error).toMatch(/envelope is only stable within a major/)
  })
})

describe('composeStepContext', () => {
  const intent = [
    '# Rate-limit the login endpoint',
    '',
    '## Frame',
    '',
    'stuff',
    '',
    '## Decisions',
    '',
    '- D1: use a token bucket — *because* it smooths bursts',
    '  and is cheap to reason about',
    '- D2: keep the limit in settings',
    '',
    '## Constraints',
    '',
    '- C1: node builtins only',
    '',
    '## Steps',
    '',
    '1. [ ] The limiter — **done when:** requests over the cap get a 429',
    '   - seam: `src/limiter.ts`, `src/limiter.test.ts`',
    '2. [ ] Wire it in — **done when:** the route uses it',
    '   - seam: `src/route.ts`',
  ].join('\n')

  it('composes the whole input JSON deterministically from intent + settings', () => {
    const result = composeStepContext({
      intent,
      slug: '2026-07-03-rate-limit-the-login-endpoint',
      step: 1,
      mode: 'build',
      context: ['a before-agent said hello'],
      settings: { agentTimeout: 30 },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toEqual([])
    expect(result.input).toEqual({
      contract: CONTRACT_VERSION,
      mode: 'build',
      build: { slug: '2026-07-03-rate-limit-the-login-endpoint', title: 'Rate-limit the login endpoint' },
      step: {
        n: 1,
        title: 'The limiter',
        doneWhen: 'requests over the cap get a 429',
        proof: { command: null, text: 'requests over the cap get a 429' },
        seam: ['src/limiter.ts', 'src/limiter.test.ts'],
        like: [],
        evidenceDir: '',
      },
      decisions: ['D1: use a token bucket — *because* it smooths bursts and is cheap to reason about', 'D2: keep the limit in settings'],
      constraints: ['C1: node builtins only'],
      context: ['a before-agent said hello'],
      settings: { agentTimeout: 30 },
    })
  })

  it('defaults context and settings to empty', () => {
    const result = composeStepContext({ intent, slug: 'slug', step: 2, mode: 'after' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.context).toEqual([])
    expect(result.input.settings).toEqual({})
    expect(result.input.step.title).toBe('Wire it in')
  })

  it("carries the step's like paths, and an empty list for a like line that names none", () => {
    const liked = intent.replace('   - seam: `src/route.ts`', '   - seam: `src/route.ts`\n   - like: `src/throttle.ts`, `src/*.ts`, `src/nowhere.ts`')
    const result = composeStepContext({ intent: liked, slug: 'slug', step: 2, mode: 'after' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.step.like).toEqual(['src/throttle.ts', 'src/nowhere.ts'])
    expect(result.warnings).toEqual([])

    const empty = composeStepContext({ intent: intent.replace('   - seam: `src/route.ts`', '   - seam: `src/route.ts`\n   - like:\n   - like: nothing quoted'), slug: 'slug', step: 2, mode: 'after' })
    expect(empty.ok).toBe(true)
    if (!empty.ok) return
    expect(empty.input.step.like).toEqual([])
  })

  it('surfaces a malformed bullet as a warning without dropping the good decisions', () => {
    const malformed = intent.replace('- D2: keep the limit in settings', 'D2 lost its dash')
    const result = composeStepContext({ intent: malformed, slug: 'slug', step: 1, mode: 'build' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.decisions).toEqual(['D1: use a token bucket — *because* it smooths bursts and is cheap to reason about'])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/## Decisions/)
    expect(result.warnings[0]).toMatch(/D2 lost its dash/)
  })

  it('fails loud when the step seam cannot be parsed (strict half)', () => {
    const result = composeStepContext({ intent, slug: 'slug', step: 9, mode: 'build' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/no step 9/)
  })
})

describe('isSlot', () => {
  it('recognizes exactly the three slots', () => {
    for (const slot of SLOTS) {
      expect(isSlot(slot)).toBe(true)
    }
    expect(isSlot('during')).toBe(false)
    expect(isSlot('')).toBe(false)
  })
})

describe('resolveAgent', () => {
  it('resolves a project agent, carrying origin and directory', () => {
    const root = makeTempRepo()
    writeAgent(projectAgentsDir(root), 'reviewer', manifest({ description: 'a reviewer' }))

    const result = resolveAgent(root, 'reviewer', { home: makeTempDir() })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.agent.origin).toBe('project')
    expect(result.agent.dir).toBe(join(projectAgentsDir(root), 'reviewer'))
    expect(result.agent.manifest.description).toBe('a reviewer')
  })

  it('project shadows personal — a name defined in both resolves from project', () => {
    const root = makeTempRepo()
    const home = makeTempDir()
    writeAgent(projectAgentsDir(root), 'reviewer', manifest({ description: 'project one' }))
    writeAgent(personalAgentsDir(home), 'reviewer', manifest({ description: 'personal one' }))

    const result = resolveAgent(root, 'reviewer', { home })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.agent.origin).toBe('project')
    expect(result.agent.manifest.description).toBe('project one')
  })

  it('falls through to an HOME-overridden personal library when the project has none', () => {
    const root = makeTempRepo()
    const home = makeTempDir()
    writeAgent(personalAgentsDir(home), 'reviewer', manifest({ description: 'personal one' }))

    const result = resolveAgent(root, 'reviewer', { home })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.agent.origin).toBe('personal')
    expect(result.agent.manifest.description).toBe('personal one')
  })

  it('takes an explicit --agent flag path over both tiers', () => {
    const root = makeTempRepo()
    const home = makeTempDir()
    writeAgent(projectAgentsDir(root), 'reviewer', manifest({ description: 'project one' }))
    const loose = join(makeTempDir(), 'loose')
    mkdirSync(loose, { recursive: true })
    writeFileSync(join(loose, 'agent.json'), `${JSON.stringify(manifest({ description: 'flagged one' }))}\n`)

    const result = resolveAgent(root, 'reviewer', { flagPath: loose, home })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.agent.origin).toBe('flag')
    expect(result.agent.manifest.description).toBe('flagged one')
  })

  it('errors when no tier holds the named agent', () => {
    const root = makeTempRepo()
    const result = resolveAgent(root, 'ghost', { home: makeTempDir() })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/no agent named "ghost"/)
  })

  it('surfaces a malformed project manifest rather than silently using personal', () => {
    const root = makeTempRepo()
    const home = makeTempDir()
    writeAgent(projectAgentsDir(root), 'reviewer', manifest({ slots: ['during'] })) // invalid slot
    writeAgent(personalAgentsDir(home), 'reviewer', manifest())

    const result = resolveAgent(root, 'reviewer', { home })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/during/)
  })

  it('reports invalid JSON at an agent directory', () => {
    const root = makeTempRepo()
    const dir = join(projectAgentsDir(root), 'reviewer')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'agent.json'), '{ not json')

    const result = resolveAgent(root, 'reviewer', { home: makeTempDir() })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/not valid JSON/)
  })
})

describe('listAgents', () => {
  it('lists agents from both tiers, sorted, project shadowing personal by name', () => {
    const root = makeTempRepo()
    const home = makeTempDir()
    writeAgent(projectAgentsDir(root), 'reviewer', manifest({ name: 'reviewer' }))
    writeAgent(personalAgentsDir(home), 'reviewer', manifest({ name: 'reviewer' })) // shadowed
    writeAgent(personalAgentsDir(home), 'formatter', manifest({ name: 'formatter' }))

    const listings = listAgents(root, { home })
    expect(listings.map((l) => l.name)).toEqual(['formatter', 'reviewer'])
    expect(listings.find((l) => l.name === 'reviewer')?.origin).toBe('project')
    expect(listings.find((l) => l.name === 'formatter')?.origin).toBe('personal')
  })

  it('is empty when neither tier has agents', () => {
    expect(listAgents(makeTempRepo(), { home: makeTempDir() })).toEqual([])
  })

  it('skips a bare folder with no agent.json', () => {
    const root = makeTempRepo()
    mkdirSync(join(projectAgentsDir(root), 'not-an-agent'), { recursive: true })
    expect(listAgents(root, { home: makeTempDir() })).toEqual([])
  })

  it('keeps a malformed agent in the listing as an errored resolution', () => {
    const root = makeTempRepo()
    writeAgent(projectAgentsDir(root), 'broken', manifest({ slots: [] }))
    const listings = listAgents(root, { home: makeTempDir() })
    expect(listings).toHaveLength(1)
    expect(listings[0]?.resolution.ok).toBe(false)
  })
})

describe('formatAgentList', () => {
  it('renders name, origin, slots, and description per agent', () => {
    const root = makeTempRepo()
    writeAgent(projectAgentsDir(root), 'reviewer', manifest({ slots: ['before', 'after'], description: 'a reviewer' }))
    const out = formatAgentList(listAgents(root, { home: makeTempDir() }))
    expect(out).toContain('reviewer (project) [before, after] — a reviewer')
  })

  it('omits the dash when an agent has no description', () => {
    const root = makeTempRepo()
    writeAgent(projectAgentsDir(root), 'reviewer', manifest({ slots: ['after'] }))
    const out = formatAgentList(listAgents(root, { home: makeTempDir() }))
    expect(out).toContain('reviewer (project) [after]')
    expect(out).not.toContain('reviewer (project) [after] —')
  })

  it('flags a malformed agent with an invalid line', () => {
    const root = makeTempRepo()
    writeAgent(projectAgentsDir(root), 'broken', manifest({ slots: [] }))
    const out = formatAgentList(listAgents(root, { home: makeTempDir() }))
    expect(out).toMatch(/✗ broken \(project\) — invalid:/)
  })

  it('has a friendly empty message', () => {
    expect(formatAgentList([])).toMatch(/no agents/)
  })
})

// The built-in tier is injected as a temp directory throughout: no test writes
// an agent into the shipped `builtin-agents/`.
describe('the built-in tier — D159 (builtin-tier)', () => {
  it('resolves a built-in agent when no other tier holds the name, carrying origin and directory', () => {
    const root = makeTempRepo()
    const builtinDir = makeTempDir()
    writeAgent(builtinDir, 'walkthrough', manifest({ name: 'walkthrough', description: 'shipped one' }))

    const result = resolveAgent(root, 'walkthrough', { home: makeTempDir(), builtinDir })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.agent.origin).toBe('builtin')
    expect(result.agent.dir).toBe(join(builtinDir, 'walkthrough'))
    expect(result.agent.manifest.description).toBe('shipped one')
  })

  it('project shadows a built-in of the same name', () => {
    const root = makeTempRepo()
    const builtinDir = makeTempDir()
    writeAgent(projectAgentsDir(root), 'reviewer', manifest({ description: 'project one' }))
    writeAgent(builtinDir, 'reviewer', manifest({ description: 'shipped one' }))

    const result = resolveAgent(root, 'reviewer', { home: makeTempDir(), builtinDir })
    expect(result.ok && result.agent.origin).toBe('project')
    expect(result.ok && result.agent.manifest.description).toBe('project one')
  })

  it('personal shadows a built-in of the same name', () => {
    const root = makeTempRepo()
    const home = makeTempDir()
    const builtinDir = makeTempDir()
    writeAgent(personalAgentsDir(home), 'reviewer', manifest({ description: 'personal one' }))
    writeAgent(builtinDir, 'reviewer', manifest({ description: 'shipped one' }))

    const result = resolveAgent(root, 'reviewer', { home, builtinDir })
    expect(result.ok && result.agent.origin).toBe('personal')
    expect(result.ok && result.agent.manifest.description).toBe('personal one')
  })

  it('project wins when all three tiers hold the name, and personal still beats project-less', () => {
    const root = makeTempRepo()
    const home = makeTempDir()
    const builtinDir = makeTempDir()
    writeAgent(projectAgentsDir(root), 'reviewer', manifest({ description: 'project one' }))
    writeAgent(personalAgentsDir(home), 'reviewer', manifest({ description: 'personal one' }))
    writeAgent(builtinDir, 'reviewer', manifest({ description: 'shipped one' }))

    const all = resolveAgent(root, 'reviewer', { home, builtinDir })
    expect(all.ok && all.agent.origin).toBe('project')
    const elsewhere = resolveAgent(makeTempRepo(), 'reviewer', { home, builtinDir })
    expect(elsewhere.ok && elsewhere.agent.origin).toBe('personal')
  })

  it('a --agent path still outranks a built-in', () => {
    const root = makeTempRepo()
    const builtinDir = makeTempDir()
    const loose = join(makeTempDir(), 'loose')
    writeAgent(join(loose, '..'), 'loose', manifest({ description: 'flagged one' }))
    writeAgent(builtinDir, 'reviewer', manifest({ description: 'shipped one' }))

    const result = resolveAgent(root, 'reviewer', { flagPath: loose, home: makeTempDir(), builtinDir })
    expect(result.ok && result.agent.origin).toBe('flag')
  })

  it('surfaces a malformed personal manifest rather than falling through to the built-in', () => {
    const root = makeTempRepo()
    const home = makeTempDir()
    const builtinDir = makeTempDir()
    writeAgent(personalAgentsDir(home), 'reviewer', manifest({ slots: ['during'] }))
    writeAgent(builtinDir, 'reviewer', manifest())

    const result = resolveAgent(root, 'reviewer', { home, builtinDir })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/during/)
  })

  it('resolves cleanly past an empty tier directory and a missing one', () => {
    const root = makeTempRepo()
    const home = makeTempDir()
    for (const builtinDir of [makeTempDir(), join(makeTempDir(), 'not-there')]) {
      expect(listAgents(root, { home, builtinDir })).toEqual([])
      const result = resolveAgent(root, 'ghost', { home, builtinDir })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe(
        `no agent named "ghost", looked in ${projectAgentsDir(root)}, ${personalAgentsDir(home)}, and plumbbob's built-in agents`,
      )
    }
  })

  it('never reads the tier README, or any loose file, as an agent', () => {
    const root = makeTempRepo()
    const home = makeTempDir()
    const builtinDir = makeTempDir()
    writeFileSync(join(builtinDir, 'README.md'), '# Built-in agents\n')
    writeFileSync(join(builtinDir, 'agent.json'), JSON.stringify(manifest()))

    expect(listAgents(root, { home, builtinDir })).toEqual([])
    for (const name of ['README.md', 'README', 'agent.json']) {
      const result = resolveAgent(root, name, { home, builtinDir })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toMatch(/no agent named/)
    }
  })

  it('lists a built-in with its origin, and each shadowed name once from the tier that wins', () => {
    const root = makeTempRepo()
    const home = makeTempDir()
    const builtinDir = makeTempDir()
    writeAgent(projectAgentsDir(root), 'reviewer', manifest())
    writeAgent(personalAgentsDir(home), 'formatter', manifest({ name: 'formatter' }))
    for (const name of ['reviewer', 'formatter', 'walkthrough']) {
      writeAgent(builtinDir, name, manifest({ name, description: 'shipped one' }))
    }

    const listings = listAgents(root, { home, builtinDir })
    expect(listings.map((l) => [l.name, l.origin])).toEqual([
      ['formatter', 'personal'],
      ['reviewer', 'project'],
      ['walkthrough', 'builtin'],
    ])
    const out = formatAgentList(listings)
    expect(out).toContain('  walkthrough (builtin) [after] — shipped one')
    expect(out).toContain('  reviewer (project) [after]')
    expect(out).not.toContain('reviewer (builtin)')
  })

  it('flags a malformed built-in in the listing with its origin', () => {
    const root = makeTempRepo()
    const builtinDir = makeTempDir()
    writeAgent(builtinDir, 'broken', manifest({ slots: [] }))
    const out = formatAgentList(listAgents(root, { home: makeTempDir(), builtinDir }))
    expect(out).toMatch(/✗ broken \(builtin\) — invalid:/)
  })

  it('ships as builtin-agents/ at the package root, holding a README and no agent', () => {
    const dir = builtinAgentsDir()
    expect(basename(dir)).toBe('builtin-agents')
    expect(existsSync(join(dir, '..', 'package.json'))).toBe(true)
    expect(readdirSync(dir)).toEqual(['README.md'])
    // With no injected directory the shipped one is walked, and it lists nothing.
    expect(listAgents(makeTempRepo(), { home: makeTempDir() })).toEqual([])
  })
})

describe('isPathBinding — D160 (path-bindings)', () => {
  it('reads ./, ../, ~/ and an absolute path as a path', () => {
    for (const binding of ['./tools/walk', '../walk', '~/agents/walk', '/opt/agents/walk', '.', '..', '~']) {
      expect(isPathBinding(binding)).toBe(true)
    }
  })

  it('reads anything else as a name', () => {
    for (const binding of ['reviewer', 'tools/walk', '.hidden', '..hidden', '~user/walk', 'walk.v2', 'a/./b']) {
      expect(isPathBinding(binding)).toBe(false)
    }
  })
})

describe('resolveBinding — D160 (path-bindings)', () => {
  it('resolves a name through the tiers, and a missing name is quiet', () => {
    const root = makeTempRepo()
    const home = makeTempDir()
    const builtinDir = makeTempDir()
    writeAgent(builtinDir, 'walkthrough', manifest({ name: 'walkthrough' }))

    const hit = resolveBinding(root, 'walkthrough', { home, builtinDir })
    expect(hit.ok && hit.agent.origin).toBe('builtin')
    const miss = resolveBinding(root, 'ghost', { home, builtinDir })
    expect(miss).toMatchObject({ ok: false, loud: false })
    expect(!miss.ok && miss.error).toMatch(/no agent named "ghost"/)
  })

  it('a malformed named agent stays quiet, as it was before paths', () => {
    const root = makeTempRepo()
    writeAgent(projectAgentsDir(root), 'reviewer', manifest({ slots: ['during'] }))
    expect(resolveBinding(root, 'reviewer', { home: makeTempDir() })).toMatchObject({ ok: false, loud: false })
  })

  it('resolves ./ from the repo root, as a directory, with origin path', () => {
    const root = makeTempRepo()
    writeAgent(join(root, 'tools'), 'walk', manifest({ name: 'walker' }))

    for (const binding of ['./tools/walk', './tools/walk/', './tools/../tools/walk']) {
      const result = resolveBinding(root, binding, { home: makeTempDir() })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.agent.origin).toBe('path')
      expect(result.agent.dir).toBe(join(root, 'tools', 'walk'))
      expect(result.agent.manifest.name).toBe('walker')
    }
  })

  it('a ./ path does not look in any tier for its last segment', () => {
    const root = makeTempRepo()
    writeAgent(projectAgentsDir(root), 'walk', manifest({ name: 'walk' }))
    expect(resolveBinding(root, './walk', { home: makeTempDir() })).toMatchObject({ ok: false, loud: true })
  })

  it('a missing ./ path is loud', () => {
    const root = makeTempRepo()
    const result = resolveBinding(root, './tools/walk', { home: makeTempDir() })
    expect(result).toEqual({ ok: false, error: 'no agent.json at binding path ./tools/walk', loud: true })
  })

  it('a broken ./ path is loud, for bad JSON and for a bad manifest', () => {
    const root = makeTempRepo()
    writeAgent(join(root, 'tools'), 'walk', manifest({ slots: ['during'] }))
    mkdirSync(join(root, 'tools', 'torn'), { recursive: true })
    writeFileSync(join(root, 'tools', 'torn', 'agent.json'), '{ not json')

    const bad = resolveBinding(root, './tools/walk', { home: makeTempDir() })
    expect(bad).toMatchObject({ ok: false, loud: true })
    expect(!bad.ok && bad.error).toMatch(/during/)
    const torn = resolveBinding(root, './tools/torn', { home: makeTempDir() })
    expect(torn).toMatchObject({ ok: false, loud: true })
    expect(!torn.ok && torn.error).toMatch(/not valid JSON/)
  })

  it('refuses ../ and a ./ that climbs out through .. segments, even when an agent is there', () => {
    const parent = makeTempDir()
    const root = join(parent, 'repo')
    mkdirSync(root)
    writeAgent(parent, 'walk', manifest())

    for (const binding of ['../walk', './../walk', './tools/../../walk', '..']) {
      const result = resolveBinding(root, binding, { home: makeTempDir() })
      expect(result).toEqual({
        ok: false,
        error: `binding path ${binding} leaves the repo, and a relative binding must stay inside it`,
        loud: true,
      })
    }
  })

  it('refuses a path that climbs above the repo and comes back in by its folder name', () => {
    const parent = makeTempDir()
    const root = join(parent, 'repo')
    mkdirSync(root)
    writeAgent(join(root, 'tools'), 'walk', manifest())
    expect(resolveBinding(root, './tools/walk', { home: makeTempDir() }).ok).toBe(true)

    for (const binding of ['../repo/tools/walk', './../repo/tools/walk', './tools/../../repo/tools/walk']) {
      expect(resolveBinding(root, binding, { home: makeTempDir() })).toEqual({
        ok: false,
        error: `binding path ${binding} leaves the repo, and a relative binding must stay inside it`,
        loud: true,
      })
    }
    // A `..` that never rises above the root is still a path inside the repo.
    expect(resolveBinding(root, './tools/../tools/walk', { home: makeTempDir() }).ok).toBe(true)
  })

  it('refuses a ./ path a symlinked folder carries out of the repo', () => {
    const root = makeTempRepo()
    const outside = makeTempDir()
    writeAgent(outside, 'walk', manifest())
    mkdirSync(join(root, 'tools'))
    symlinkSync(join(outside, 'walk'), join(root, 'tools', 'walk'))
    symlinkSync(outside, join(root, 'linked'))

    for (const binding of ['./tools/walk', './linked/walk']) {
      expect(resolveBinding(root, binding, { home: makeTempDir() })).toEqual({
        ok: false,
        error: `binding path ${binding} resolves outside the repo, and a relative binding must stay inside it`,
        loud: true,
      })
    }
  })

  it('refuses a ./ path whose agent.json is a symlink out of the repo', () => {
    const root = makeTempRepo()
    const outside = makeTempDir()
    writeAgent(outside, 'walk', manifest())
    mkdirSync(join(root, 'tools', 'walk'), { recursive: true })
    symlinkSync(join(outside, 'walk', 'agent.json'), join(root, 'tools', 'walk', 'agent.json'))

    const result = resolveBinding(root, './tools/walk', { home: makeTempDir() })
    expect(result).toMatchObject({ ok: false, loud: true })
    expect(!result.ok && result.error).toMatch(/resolves outside the repo/)
  })

  it('allows a symlink that stays inside the repo', () => {
    const root = makeTempRepo()
    writeAgent(join(root, 'tools'), 'walk', manifest())
    symlinkSync(join(root, 'tools', 'walk'), join(root, 'alias'))
    expect(resolveBinding(root, './alias', { home: makeTempDir() }).ok).toBe(true)
  })

  it('resolves ~/ from the home directory, and a missing or broken one is quiet', () => {
    const root = makeTempRepo()
    const home = makeTempDir()
    writeAgent(join(home, 'agents'), 'walk', manifest({ name: 'walker' }))
    writeAgent(join(home, 'agents'), 'bad', manifest({ slots: [] }))

    const hit = resolveBinding(root, '~/agents/walk', { home })
    expect(hit.ok && hit.agent.origin).toBe('path')
    expect(hit.ok && hit.agent.dir).toBe(join(home, 'agents', 'walk'))
    expect(resolveBinding(root, '~/agents/ghost', { home })).toEqual({
      ok: false,
      error: 'no agent.json at binding path ~/agents/ghost',
      loud: false,
    })
    expect(resolveBinding(root, '~/agents/bad', { home })).toMatchObject({ ok: false, loud: false })
  })

  it('takes an absolute path as written, and a missing or broken one is quiet', () => {
    const root = makeTempRepo()
    const elsewhere = makeTempDir()
    writeAgent(elsewhere, 'walk', manifest({ name: 'walker' }))
    writeAgent(elsewhere, 'bad', manifest({ slots: [] }))

    const hit = resolveBinding(root, join(elsewhere, 'walk'), { home: makeTempDir() })
    expect(hit.ok && hit.agent.dir).toBe(join(elsewhere, 'walk'))
    expect(resolveBinding(root, join(elsewhere, 'ghost'), { home: makeTempDir() })).toEqual({
      ok: false,
      error: `no agent.json at binding path ${join(elsewhere, 'ghost')}`,
      loud: false,
    })
    expect(resolveBinding(root, join(elsewhere, 'bad'), { home: makeTempDir() })).toMatchObject({
      ok: false,
      loud: false,
    })
  })
})

// The stop path. Each agent here is a shell script in a temp dir; one that
// starts something of its own writes that process's pid to a file, so the test
// can ask the system whether it is still there once the run has settled.
const AGENTS_MODULE = fileURLToPath(new URL('../agents.ts', import.meta.url))

const STOP_INPUT: StepContext = {
  contract: CONTRACT_VERSION,
  mode: 'after',
  build: { slug: 'stop-test', title: 'Stop test' },
  step: { n: 1, title: 'First', doneWhen: '', proof: { command: null, text: '' }, seam: [], like: [], evidenceDir: '' },
  decisions: [],
  constraints: [],
  context: [],
  settings: {},
}

const DONE_ENVELOPE = '{"contract":1,"status":"done","summary":"walked it"}'

// Write `script` as run.sh in a fresh temp dir and return the dir, which is
// both the run's root and the agent's own directory.
function stopAgent(script: string): string {
  const dir = makeTempDir()
  writeFileSync(join(dir, 'run.sh'), script)
  return dir
}

function runStopAgent(dir: string, opts: { readonly timeoutSeconds: number; readonly graceSeconds?: number }) {
  return runAgent({
    root: dir,
    command: 'sh "$PLUMBBOB_AGENT_DIR/run.sh"',
    agentDir: dir,
    input: STOP_INPUT,
    ...opts,
  })
}

// Whether a pid names a process at all, running or a zombie: `ps` lists both
// and exits non-zero when it finds neither.
function isThere(pid: number): boolean {
  try {
    execFileSync('ps', ['-p', String(pid)], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Whether `pid` is still there once it has had a few seconds to go. A killed
 * process stays in the table until its parent reaps it, and on a loaded
 * machine that can trail the run's report by a moment, so a stop is judged
 * by the process being gone soon, not gone at the instant the run returned.
 */
async function stillThere(pid: number): Promise<boolean> {
  const deadline = Date.now() + 5000
  while (isThere(pid) && Date.now() < deadline) {
    await new Promise((tick) => setTimeout(tick, 50))
  }
  return isThere(pid)
}

function pidIn(dir: string, file: string): number {
  const pid = Number(readFileSync(join(dir, file), 'utf8').trim())
  expect(Number.isInteger(pid) && pid > 0).toBe(true)
  return pid
}

// A process of the agent's own that shrugs off SIGTERM and holds none of the
// agent's pipes, so only a signal sent to the whole group can end it.
const STUBBORN_GRANDCHILD = `sh -c 'trap "" TERM; echo $$ > "$PLUMBBOB_AGENT_DIR/grandchild.pid"; while :; do sleep 0.1; done' >/dev/null 2>&1 &
while [ ! -s "$PLUMBBOB_AGENT_DIR/grandchild.pid" ]; do sleep 0.05; done
`

describe('runAgent — the stop — D161 (graceful-agent-stop)', () => {
  it('gives an agent five seconds to stop by default', () => {
    expect(STOP_GRACE_SECONDS).toBe(5)
  })

  it('lets an agent that traps TERM clean up and exit inside the grace', async () => {
    // The shell names a foreground sleep that a signal ended; that line is
    // sent nowhere, to keep the test's own output clean.
    const dir = stopAgent(`exec 2>/dev/null
echo $$ > "$PLUMBBOB_AGENT_DIR/agent.pid"
trap 'echo cleaned > "$PLUMBBOB_AGENT_DIR/cleaned"; exit 0' TERM
cat >/dev/null
while :; do sleep 0.1; done
`)
    const began = Date.now()
    const result = await runStopAgent(dir, { timeoutSeconds: 1, graceSeconds: 20 })
    const took = Date.now() - began

    // It went on the SIGTERM, so the result says no SIGKILL was sent.
    expect(result).toEqual({ ok: false, reason: 'timeout', seconds: 1, graceSeconds: 20, killed: false })
    expect(readFileSync(join(dir, 'cleaned'), 'utf8')).toBe('cleaned\n')
    // It settled when the agent went, well short of the grace it was offered.
    expect(took).toBeLessThan(10_000)
    expect(await stillThere(pidIn(dir, 'agent.pid'))).toBe(false)
  }, 30_000)

  it('kills an agent that ignores TERM once the grace runs out', async () => {
    const dir = stopAgent(`echo $$ > "$PLUMBBOB_AGENT_DIR/agent.pid"
trap '' TERM
cat >/dev/null
while :; do sleep 0.1; done
`)
    const began = Date.now()
    const result = await runStopAgent(dir, { timeoutSeconds: 1, graceSeconds: 1 })
    const took = Date.now() - began

    expect(result).toEqual({ ok: false, reason: 'timeout', seconds: 1, graceSeconds: 1, killed: true })
    // The timeout, then the whole grace: TERM alone did not end it.
    expect(took).toBeGreaterThanOrEqual(2000)
    expect(await stillThere(pidIn(dir, 'agent.pid'))).toBe(false)
  }, 30_000)

  it('takes a grandchild down with a timed-out agent', async () => {
    const dir = stopAgent(`${STUBBORN_GRANDCHILD}cat >/dev/null
while :; do sleep 0.1; done
`)
    const result = await runStopAgent(dir, { timeoutSeconds: 1, graceSeconds: 0.5 })

    expect(result).toMatchObject({ ok: false, reason: 'timeout', killed: true })
    expect(await stillThere(pidIn(dir, 'grandchild.pid'))).toBe(false)
  }, 30_000)

  it('sweeps what a cleanly exiting agent left running, and still reads its envelope', async () => {
    const dir = stopAgent(`${STUBBORN_GRANDCHILD}cat >/dev/null
echo '${DONE_ENVELOPE}'
`)
    const result = await runStopAgent(dir, { timeoutSeconds: 0, graceSeconds: 0.5 })

    expect(result).toMatchObject({
      ok: true,
      envelope: { status: 'done', summary: 'walked it' },
      stdout: `${DONE_ENVELOPE}\n`,
    })
    expect(await stillThere(pidIn(dir, 'grandchild.pid'))).toBe(false)
  }, 30_000)

  it('sweeps what a failing agent left running, and still reports its exit code', async () => {
    const dir = stopAgent(`${STUBBORN_GRANDCHILD}cat >/dev/null
echo partial
exit 3
`)
    const result = await runStopAgent(dir, { timeoutSeconds: 0, graceSeconds: 0.5 })

    expect(result).toEqual({ ok: false, reason: 'exit', code: 3, stdout: 'partial\n' })
    expect(await stillThere(pidIn(dir, 'grandchild.pid'))).toBe(false)
  }, 30_000)

  it('settles at once for an agent that leaves nothing behind', async () => {
    const dir = stopAgent(`cat >/dev/null\necho '${DONE_ENVELOPE}'\n`)
    const began = Date.now()
    const result = await runStopAgent(dir, { timeoutSeconds: 0, graceSeconds: 20 })

    expect(result).toMatchObject({ ok: true, stdout: `${DONE_ENVELOPE}\n` })
    expect(Date.now() - began).toBeLessThan(10_000)
  }, 30_000)

  // plumbbob being stopped is a signal to the process itself, so this one runs
  // runAgent in a process of its own and signals that.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    it(`stops the agent and its grandchild when plumbbob itself gets ${signal}`, async () => {
      const dir = stopAgent(`${STUBBORN_GRANDCHILD}echo $$ > "$PLUMBBOB_AGENT_DIR/agent.pid"
cat >/dev/null
while :; do sleep 0.1; done
`)
      writeFileSync(
        join(dir, 'driver.mjs'),
        `import { runAgent } from ${JSON.stringify(AGENTS_MODULE)}
const dir = ${JSON.stringify(dir)}
const result = await runAgent({
  root: dir,
  command: 'sh "$PLUMBBOB_AGENT_DIR/run.sh"',
  agentDir: dir,
  input: ${JSON.stringify(STOP_INPUT)},
  timeoutSeconds: 0,
  graceSeconds: 0.5,
})
process.stdout.write(JSON.stringify(result))
`,
      )
      const driver = spawn(process.execPath, [join(dir, 'driver.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] })
      let out = ''
      driver.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString()
      })
      const closed = new Promise<number | null>((done) => driver.on('close', done))

      // Wait until the agent is up and has started its grandchild.
      const deadline = Date.now() + 20_000
      while (!existsSync(join(dir, 'agent.pid')) && Date.now() < deadline) {
        await new Promise((tick) => setTimeout(tick, 50))
      }
      expect(existsSync(join(dir, 'agent.pid'))).toBe(true)
      driver.kill(signal)

      // The driver outlives the signal long enough to stop the agent and say so.
      expect(await closed).toBe(0)
      expect(JSON.parse(out)).toEqual({ ok: false, reason: 'interrupted' })
      expect(await stillThere(pidIn(dir, 'agent.pid'))).toBe(false)
      expect(await stillThere(pidIn(dir, 'grandchild.pid'))).toBe(false)
    }, 40_000)
  }
})
