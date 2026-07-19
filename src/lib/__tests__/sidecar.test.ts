import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  activeBuild,
  beginSession,
  buildDir,
  buildLogPath,
  buildScope,
  checkpointsPath,
  clearSpike,
  bumpStepStat,
  clearTick,
  excludeControl,
  excludeSidecar,
  grantPath,
  hasSession,
  inSpike,
  intentPath,
  listBuilds,
  markSpike,
  readStats,
  seamPath,
  setActiveBuild,
  sidecarDir,
  slugify,
  spikePath,
  stampStepStat,
  stampTick,
  statsPath,
  stepPath,
  tickPath,
  turnPath,
} from '../sidecar.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

describe('path helpers', () => {
  it('all resolve under <root>/.plumbbob', () => {
    const root = '/tmp/x'
    expect(sidecarDir(root)).toBe('/tmp/x/.plumbbob')
    expect(seamPath(root)).toBe('/tmp/x/.plumbbob/SEAM')
    expect(stepPath(root)).toBe('/tmp/x/.plumbbob/STEP')
    expect(spikePath(root)).toBe('/tmp/x/.plumbbob/SPIKE')
    expect(checkpointsPath(root)).toBe('/tmp/x/.plumbbob/checkpoints')
    expect(intentPath(root)).toBe('/tmp/x/.plumbbob/intent.md')
    expect(buildLogPath(root)).toBe('/tmp/x/.plumbbob/build-log.md')
    // The turn ledger (D64) is per-worktree, so TURN/GRANT stay flat even when a
    // build is active; TICK is per-build and follows the artifact folder.
    expect(turnPath(root)).toBe('/tmp/x/.plumbbob/TURN')
    expect(grantPath(root)).toBe('/tmp/x/.plumbbob/GRANT')
    expect(tickPath(root)).toBe('/tmp/x/.plumbbob/TICK')
    expect(tickPath(root, 'my-build')).toBe('/tmp/x/.plumbbob/builds/my-build/TICK')
  })
})

describe('the entry stamp (TICK)', () => {
  it('stampTick copies the current TURN; clearTick consumes it', () => {
    const dir = makeTempRepo()
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(turnPath(dir), '7\n')
    stampTick(dir)
    expect(readFileSync(tickPath(dir), 'utf8')).toBe('7\n')
    clearTick(dir)
    expect(existsSync(tickPath(dir))).toBe(false)
    clearTick(dir) // absent is a no-op, not an error
  })

  it('skips the stamp when the turn ledger is absent or unreadable — dormant, never an error', () => {
    const dir = makeTempRepo()
    mkdirSync(sidecarDir(dir), { recursive: true })
    stampTick(dir) // no TURN at all — a hookless host grows no ledger
    expect(existsSync(tickPath(dir))).toBe(false)
    writeFileSync(turnPath(dir), 'not a number\n')
    stampTick(dir) // a garbage ledger stamps nothing rather than a garbage tick
    expect(existsSync(tickPath(dir))).toBe(false)
  })
})

describe('session sentinel', () => {
  it('beginSession opens the session; presence is the whole signal', () => {
    const dir = makeTempRepo()
    mkdirSync(sidecarDir(dir), { recursive: true })
    expect(hasSession(dir)).toBe(false)
    beginSession(dir)
    expect(hasSession(dir)).toBe(true)
  })

  it('beginSession homes the cursor in STATE content; setActiveBuild re-points it', () => {
    const dir = makeTempRepo()
    mkdirSync(buildDir(dir, 'first'), { recursive: true })
    mkdirSync(buildDir(dir, 'second'), { recursive: true })
    beginSession(dir, 'first')
    expect(activeBuild(dir)).toBe('first') // content wins over the ambiguous two-build fallback
    setActiveBuild(dir, 'second')
    expect(activeBuild(dir)).toBe('second')
    expect(hasSession(dir)).toBe(true) // re-pointing never disturbs the sentinel
  })
})

describe('spike marker', () => {
  it('mark/clear flips inSpike, presence is the whole signal', () => {
    const dir = makeTempRepo()
    mkdirSync(sidecarDir(dir), { recursive: true })
    expect(inSpike(dir)).toBe(false)
    markSpike(dir)
    expect(inSpike(dir)).toBe(true)
    clearSpike(dir)
    expect(inSpike(dir)).toBe(false)
  })
})

describe('slugify', () => {
  it('lowercases, collapses non-alphanumerics to single hyphens, and trims', () => {
    expect(slugify('Worktree-proof sidecar restructure')).toBe('worktree-proof-sidecar-restructure')
    expect(slugify('  Add   OAuth 2.0!! ')).toBe('add-oauth-2-0')
    expect(slugify('CamelCase & symbols')).toBe('camelcase-symbols')
  })

  it('yields an empty slug when the title has no alphanumerics (caller must reject)', () => {
    expect(slugify('!!! ??? ---')).toBe('')
  })
})

describe('buildScope (D68 — the Conventional-Commit scope)', () => {
  it('strips the YYYY-MM-DD- date prefix start prepends', () => {
    expect(buildScope('2026-07-18-escape-hatch')).toBe('escape-hatch')
  })

  it('leaves an already-dateless slug untouched (e.g. an explicit --slug)', () => {
    expect(buildScope('checkpoint-test')).toBe('checkpoint-test')
  })

  it('returns null when no build resolves or nothing survives the strip', () => {
    expect(buildScope(null)).toBeNull()
    expect(buildScope('2026-07-18-')).toBeNull()
  })
})

describe('buildDir', () => {
  it('resolves under <root>/.plumbbob/builds/<slug>', () => {
    expect(buildDir('/tmp/x', 'my-build')).toBe('/tmp/x/.plumbbob/builds/my-build')
  })
})

describe('listBuilds', () => {
  it('is empty before any build folder exists', () => {
    expect(listBuilds(makeTempRepo())).toEqual([])
  })

  it('returns the sorted directory names under builds/, ignoring files', () => {
    const dir = makeTempRepo()
    mkdirSync(buildDir(dir, 'beta'), { recursive: true })
    mkdirSync(buildDir(dir, 'alpha'), { recursive: true })
    writeFileSync(join(sidecarDir(dir), 'builds', 'stray.txt'), 'x\n')
    expect(listBuilds(dir)).toEqual(['alpha', 'beta'])
  })
})

describe('activeBuild', () => {
  it('prefers an explicit flag over everything else', () => {
    const dir = makeTempRepo()
    mkdirSync(sidecarDir(dir), { recursive: true })
    setActiveBuild(dir, 'from-cursor')
    expect(activeBuild(dir, 'from-flag')).toBe('from-flag')
  })

  it('falls back to the STATE cursor', () => {
    const dir = makeTempRepo()
    mkdirSync(sidecarDir(dir), { recursive: true })
    setActiveBuild(dir, 'the-cursor')
    expect(activeBuild(dir)).toBe('the-cursor')
  })

  it('treats a legacy `active` STATE sentinel as no cursor (pre-STATE-cursor migration)', () => {
    const dir = makeTempRepo()
    mkdirSync(buildDir(dir, 'only-one'), { recursive: true })
    writeFileSync(join(sidecarDir(dir), 'STATE'), 'active\n')
    // Old sessions wrote "active" here while the cursor lived in settings.local.json;
    // it must fall through to the sole build, not resolve a build named "active".
    expect(activeBuild(dir)).toBe('only-one')
  })

  it('falls back to the sole build folder when no cursor is set', () => {
    const dir = makeTempRepo()
    mkdirSync(buildDir(dir, 'only-one'), { recursive: true })
    expect(activeBuild(dir)).toBe('only-one')
  })

  it('is null when there is no cursor and the build is ambiguous or absent', () => {
    const dir = makeTempRepo()
    expect(activeBuild(dir)).toBeNull()
    mkdirSync(buildDir(dir, 'a'), { recursive: true })
    mkdirSync(buildDir(dir, 'b'), { recursive: true })
    expect(activeBuild(dir)).toBeNull()
  })
})

describe('excludeControl', () => {
  it('excludes only the control patterns, leaving the tracked artifact plane visible', () => {
    const dir = makeTempRepo()
    excludeControl(dir)
    excludeControl(dir) // idempotent
    const lines = readFileSync(join(realpathSync(dir), '.git', 'info', 'exclude'), 'utf8').split('\n')
    for (const pattern of [
      '.plumbbob/STATE',
      '.plumbbob/settings.local.json',
      '.plumbbob/TURN', // the turn ledger and its grant (D64/D65) — per-worktree control
      '.plumbbob/GRANT',
      '.plumbbob/builds/*/STEP',
      '.plumbbob/builds/*/SEAM',
      '.plumbbob/builds/*/SPIKE',
      '.plumbbob/builds/*/TICK', // the entry stamp (D64) — never swept in by stageAll
      '.check/', // the checkride gate's raw output (D32) — never swept into a step commit
    ]) {
      expect(lines.filter((line) => line.trim() === pattern).length).toBe(1)
    }
    // The whole directory is NOT excluded — intent/build-log/checkpoints track.
    expect(lines).not.toContain('.plumbbob/')
  })
})

describe('excludeSidecar', () => {
  it('adds .plumbbob/ to info/exclude exactly once (idempotent)', () => {
    const dir = makeTempRepo()
    excludeSidecar(dir)
    excludeSidecar(dir)
    const exclude = readFileSync(join(realpathSync(dir), '.git', 'info', 'exclude'), 'utf8')
    const hits = exclude.split('\n').filter((line) => line.trim() === '.plumbbob/').length
    expect(hits).toBe(1)
  })

  it('from a linked worktree, writes to the common gitdir exclude git actually reads (D1)', () => {
    const main = makeTempRepo()
    const wt = join(makeTempDir(), 'wt')
    execFileSync('git', ['-C', main, 'worktree', 'add', '-q', wt, '-b', 'wt-sidecar'])

    excludeSidecar(wt)

    // Lands in the common gitdir's exclude — the only file git reads — not the
    // per-worktree gitdir, whose missing info/ was the ENOENT crash this fixes.
    const commonExclude = readFileSync(join(realpathSync(main), '.git', 'info', 'exclude'), 'utf8')
    expect(commonExclude.split('\n')).toContain('.plumbbob/')
  })
})

describe('per-build stats (research/07 Build 2b)', () => {
  function statsRepo(): string {
    const dir = makeTempRepo()
    mkdirSync(buildDir(dir, 'stats-build'), { recursive: true })
    beginSession(dir, 'stats-build')
    return dir
  }

  it('bumps counters per step, creating the file on first accrual', () => {
    const dir = statsRepo()
    bumpStepStat(dir, 'stats-build', 1, 'redChecks')
    bumpStepStat(dir, 'stats-build', 1, 'redChecks')
    bumpStepStat(dir, 'stats-build', 2, 'reverts')
    const stats = readStats(dir, 'stats-build')
    expect(stats['1']?.redChecks).toBe(2)
    expect(stats['2']?.reverts).toBe(1)
    expect(stats['1']?.reverts).toBeUndefined()
  })

  it('stamps timestamps without clobbering counters on the same step', () => {
    const dir = statsRepo()
    bumpStepStat(dir, 'stats-build', 1, 'driftWarnings')
    stampStepStat(dir, 'stats-build', 1, 'startedAt', '2026-07-11T10:00:00Z')
    stampStepStat(dir, 'stats-build', 1, 'landedAt', '2026-07-11T10:34:00Z')
    const step = readStats(dir, 'stats-build')['1']
    expect(step?.driftWarnings).toBe(1)
    expect(step?.startedAt).toBe('2026-07-11T10:00:00Z')
    expect(step?.landedAt).toBe('2026-07-11T10:34:00Z')
  })

  it('tolerates a corrupt file by starting fresh — never wedges the caller (D27)', () => {
    const dir = statsRepo()
    writeFileSync(statsPath(dir, 'stats-build'), '{corrupt')
    expect(readStats(dir, 'stats-build')).toEqual({})
    expect(() => bumpStepStat(dir, 'stats-build', 1, 'redChecks')).not.toThrow()
    expect(readStats(dir, 'stats-build')['1']?.redChecks).toBe(1)
  })

  it('resolves the flat sidecar under --local (null slug) and is NOT git-excluded when tracked', () => {
    const dir = statsRepo()
    stampStepStat(dir, null, 1, 'startedAt', 'x')
    expect(existsSync(join(sidecarDir(dir), 'stats.json'))).toBe(true)
    // Tracked layout: stats.json must ride the branch — nothing in excludeControl
    // may match it.
    excludeControl(dir)
    const exclude = readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8')
    expect(exclude).not.toContain('stats')
  })
})
