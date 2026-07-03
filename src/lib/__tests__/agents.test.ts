import { describe, expect, it } from 'vitest'
import {
  CONTRACT_VERSION,
  ENVELOPE_STATUSES,
  SLOTS,
  isSlot,
  parseEnvelope,
  parseManifest,
} from '../agents.ts'

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
