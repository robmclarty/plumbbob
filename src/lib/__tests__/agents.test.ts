import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  CONTRACT_VERSION,
  ENVELOPE_STATUSES,
  SLOTS,
  formatAgentList,
  isSlot,
  listAgents,
  parseEnvelope,
  parseManifest,
  personalAgentsDir,
  projectAgentsDir,
  resolveAgent,
} from '../agents.ts'
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
