// `plumbbob doctor` — all three sections, in-process. The sidecar tests build a
// LEGACY flat sidecar (the pre-builds/ layout) in a throwaway repo and assert
// the move into the tracked builds/ layout: archive + active session become build
// folders, config becomes settings.json, and the result is STAGED but never
// committed (the human owns that commit), losing nothing on the way (the
// never-destroy rule: park lines, intent edits, and build folders all survive).
// The plugin-link tests pin
// process.env.HOME to a fixture home (the subprocess suite in
// test/integration/doctor.test.ts drives the same checks through the real CLI).

import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { doctor, inspectLegacy, migrateSidecar } from '../doctor.ts'
import type { GateEnv } from '../doctor.ts'
import { activeBuild, buildDir, intentPath, turnPath } from '../../lib/sidecar.ts'
import { setLocalSetting, settingsPath } from '../../lib/settings.ts'
import { gitPath, headSha } from '../../lib/git.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

function git(dir: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

function staged(dir: string): ReadonlyArray<string> {
  const out = git(dir, ['diff', '--cached', '--name-only'])
  return out.length === 0 ? [] : out.split('\n')
}

// A repo carrying the legacy flat sidecar: a flat active session, two archived builds,
// a `config`, and the blanket `.plumbbob/` exclude the old layout wrote.
function legacyRepo(): string {
  const dir = makeTempRepo()
  const sc = join(dir, '.plumbbob')
  mkdirSync(sc, { recursive: true })
  writeFileSync(join(sc, 'config'), 'check=pnpm run check\n')
  writeFileSync(join(sc, 'STATE'), 'active\n')
  writeFileSync(join(sc, 'intent.md'), '# My Legacy Build\n\n## Steps\n\n1. [ ] Do it.\n')
  writeFileSync(join(sc, 'build-log.md'), '- parked: keep me\n')
  writeFileSync(join(sc, 'checkpoints'), `baseline ${headSha(dir)}\n`)
  writeFileSync(join(sc, 'STEP'), '1\n')
  mkdirSync(join(sc, 'archive', 'old-one'), { recursive: true })
  writeFileSync(join(sc, 'archive', 'old-one', 'report.md'), '# done long ago\n')
  mkdirSync(join(sc, 'archive', 'old-two'), { recursive: true })
  writeFileSync(join(sc, 'archive', 'old-two', 'intent.md'), '# old two\n')
  writeFileSync(join(dir, '.git', 'info', 'exclude'), '.plumbbob/\n')
  return dir
}

// A legacy sidecar carrying only some of the pre-restructure markers — detection
// must treat each marker (config, archive/, flat session) as sufficient on its own.
function partialLegacyRepo(build: (sc: string) => void): string {
  const dir = makeTempRepo()
  const sc = join(dir, '.plumbbob')
  mkdirSync(sc, { recursive: true })
  build(sc)
  return dir
}

function settingsJson(dir: string): unknown {
  return JSON.parse(readFileSync(settingsPath(dir), 'utf8')) as unknown
}

// A deterministic toolchain probe for the tests that exercise the LIVE check gate
// (no `check` setting → checkride's doctor runs). checkride's real env spawns
// `pnpm --version` with a 5s cap; under the full-suite parallel load that probe
// intermittently times out, which renders a spurious `✗ pnpm` and breaks the
// exact problem-count assertions. Canned which/version keep it load-independent;
// `exists` stays real so install- and adapter-binary detection reads the temp repo
// (node_modules absent → `✗ install`, node_modules/.bin/tsc absent → `✗ types`).
const GATE_TOOLS = new Set(['node', 'git', 'pnpm'])
const gateEnv: GateEnv = {
  which: (cmd) => Promise.resolve(GATE_TOOLS.has(cmd) ? `/usr/bin/${cmd}` : null),
  version: (cmd) =>
    Promise.resolve(cmd === 'node' ? process.versions.node : cmd === 'pnpm' ? '11.1.2' : cmd === 'git' ? '2.40.0' : null),
  exists: existsSync,
  canWrite: () => Promise.resolve(true),
  readEngines: () => ({}),
  platform: () => ({ os: process.platform, arch: process.arch }),
  packageManager: () => 'pnpm',
}

// pluginChecks reads process.env.HOME, so pinning it to a throwaway home makes the
// plugin section deterministic no matter what the developer's real ~/.claude holds.
async function doctorWithHome(
  home: string,
  cwd: string,
  args: ReadonlyArray<string> = [],
  env?: GateEnv,
): Promise<{ readonly code: number; readonly stdout: string }> {
  const saved = process.env.HOME
  process.env.HOME = home
  try {
    return await captureIoAsync(() => doctor(cwd, args, env))
  } finally {
    if (saved === undefined) delete process.env.HOME
    else process.env.HOME = saved
  }
}

function linkPath(home: string): string {
  return join(home, '.claude', 'skills', 'plumbbob')
}

// The installed_plugins.json shape Claude Code writes for marketplace installs.
function seedMarketplace(home: string, ids: ReadonlyArray<string>): void {
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: Object.fromEntries(ids.map((id) => [id, [{ scope: 'user' }]])) }),
  )
}

// A clean, already-migrated repo whose `check` setting overrides checkride: the
// gate section becomes one deterministic line and never probes for tools, so a
// test's failure count comes from the section under test alone.
function overrideRepo(): string {
  const dir = makeTempRepo()
  mkdirSync(join(dir, '.plumbbob'), { recursive: true })
  writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
  return dir
}

// This checkout is itself a valid plumbbob package (manifest, skills/, hooks/),
// so a link pointing at it is the healthy-install fixture.
const CHECKOUT = fileURLToPath(new URL('../../../', import.meta.url))

describe('doctor — legacy detection', () => {
  it('detects a legacy flat sidecar and reports its parts', () => {
    const legacy = inspectLegacy(legacyRepo())
    expect(legacy).not.toBeNull()
    expect(legacy?.session).toBe(true)
    expect(legacy?.config).toBe(true)
    expect(legacy?.archive).toEqual(['old-one', 'old-two'])
  })

  it('returns null for an already-migrated (builds/ + settings.json) layout', () => {
    const dir = makeTempRepo()
    mkdirSync(buildDir(dir, 'x'), { recursive: true })
    writeFileSync(settingsPath(dir), '{}\n')
    expect(inspectLegacy(dir)).toBeNull()
  })

  it('returns null for a --local layout (flat intent.md but settings.json present, no config)', () => {
    const dir = makeTempRepo()
    mkdirSync(join(dir, '.plumbbob'), { recursive: true })
    writeFileSync(join(dir, '.plumbbob', 'intent.md'), '# local\n')
    writeFileSync(settingsPath(dir), '{"check":"true"}\n')
    expect(inspectLegacy(dir)).toBeNull()
  })

  it('returns null when there is no sidecar at all', () => {
    expect(inspectLegacy(makeTempRepo())).toBeNull()
  })

  // Each pre-restructure marker must trip detection on its own — a repo that only
  // kept its config, or only its archive, is still legacy and must not slip through.
  it('detects a config-only sidecar (no session, no archive)', () => {
    const legacy = inspectLegacy(partialLegacyRepo((sc) => writeFileSync(join(sc, 'config'), 'check=x\n')))
    expect(legacy?.config).toBe(true)
    expect(legacy?.session).toBe(false) // no intent.md → no session, even unmigrated
    expect(legacy?.archive).toEqual([])
  })

  it('detects an archive-only sidecar, listing only real directories', () => {
    const dir = partialLegacyRepo((sc) => {
      mkdirSync(join(sc, 'archive', 'zz-later'), { recursive: true })
      mkdirSync(join(sc, 'archive', '@@'), { recursive: true })
      mkdirSync(join(sc, 'archive', 'aa-early'), { recursive: true })
      writeFileSync(join(sc, 'archive', 'notes.txt'), 'not a build\n') // must not be listed
    })
    const legacy = inspectLegacy(dir)
    expect(legacy?.archive).toEqual(['@@', 'aa-early', 'zz-later'])
    expect(legacy?.config).toBe(false)
  })

  it('detects a session-only sidecar (flat intent.md, unmigrated)', () => {
    const legacy = inspectLegacy(partialLegacyRepo((sc) => writeFileSync(join(sc, 'intent.md'), '# Solo\n')))
    expect(legacy?.session).toBe(true)
    expect(legacy?.config).toBe(false)
  })
})

describe('doctor — migration', () => {
  it('moves the active session into builds/<slug> and points the cursor at it', () => {
    const dir = legacyRepo()
    migrateSidecar(dir)
    expect(existsSync(intentPath(dir, 'my-legacy-build'))).toBe(true)
    expect(readFileSync(intentPath(dir, 'my-legacy-build'), 'utf8')).toContain('My Legacy Build')
    expect(activeBuild(dir)).toBe('my-legacy-build')
  })

  it('moves archive entries into builds/ (done: not the cursor) and removes archive/', () => {
    const dir = legacyRepo()
    migrateSidecar(dir)
    expect(existsSync(join(buildDir(dir, 'old-one'), 'report.md'))).toBe(true)
    expect(readFileSync(join(buildDir(dir, 'old-one'), 'report.md'), 'utf8')).toContain('done long ago')
    expect(existsSync(join(buildDir(dir, 'old-two'), 'intent.md'))).toBe(true)
    expect(existsSync(join(dir, '.plumbbob', 'archive'))).toBe(false)
  })

  it('turns config into settings.json carrying the check, and deletes config', () => {
    const dir = legacyRepo()
    migrateSidecar(dir)
    expect(existsSync(join(dir, '.plumbbob', 'config'))).toBe(false)
    const settings = JSON.parse(readFileSync(settingsPath(dir), 'utf8')) as { check?: string }
    expect(settings.check).toBe('pnpm run check')
  })

  it('stages the moved artifacts but never commits (Q8)', () => {
    const dir = legacyRepo()
    const before = headSha(dir)
    migrateSidecar(dir)
    expect(headSha(dir)).toBe(before) // no commit made
    const files = staged(dir)
    expect(files).toContain('.plumbbob/builds/my-legacy-build/intent.md')
    expect(files).toContain('.plumbbob/settings.json')
    expect(files).toContain('.plumbbob/builds/old-one/report.md')
    // control files stay excluded → never staged
    expect(files.some((f) => f.endsWith('/STEP'))).toBe(false)
    expect(files).not.toContain('.plumbbob/settings.local.json')
  })

  it('preserves park lines through the move (C4 — never destroy)', () => {
    const dir = legacyRepo()
    migrateSidecar(dir)
    expect(readFileSync(join(buildDir(dir, 'my-legacy-build'), 'build-log.md'), 'utf8')).toContain('keep me')
  })

  // The action list IS the migration report doctor prints — pin it whole so the
  // order (config, then the session, then the archive, then the stage) and every
  // human-facing rename line hold.
  it('returns the exact action list, in order', () => {
    expect(migrateSidecar(legacyRepo())).toEqual([
      'config → settings.json (check: pnpm run check)',
      'active session → builds/my-legacy-build (the cursor)',
      'archive/old-one → builds/old-one',
      'archive/old-two → builds/old-two',
      'staged the move (builds/ + settings.json) — commit it yourself',
    ])
  })

  // A legacy config is hand-edited ini-style: the check line may be indented and
  // spaced around `=`, and near-miss keys (`xcheck=`) must not match.
  it('parses a whitespace-y check line and ignores near-miss keys', () => {
    const dir = partialLegacyRepo((sc) => writeFileSync(join(sc, 'config'), 'xcheck=bogus\n  check = pnpm run check\n'))
    const actions = migrateSidecar(dir)
    expect(actions).toEqual([
      'config → settings.json (check: pnpm run check)',
      'staged the move (builds/ + settings.json) — commit it yourself',
    ])
    expect(settingsJson(dir)).toEqual({ check: 'pnpm run check' }) // only what the config held — no invented auto
  })

  it('writes an empty settings.json when config carries no check line', () => {
    const dir = partialLegacyRepo((sc) => writeFileSync(join(sc, 'config'), 'other=1\n'))
    const actions = migrateSidecar(dir)
    expect(actions[0]).toBe('config → settings.json')
    expect(settingsJson(dir)).toEqual({}) // no "check": null and no invented auto leaking in
  })

  it('never overwrites an existing settings.json', () => {
    const dir = partialLegacyRepo((sc) => {
      writeFileSync(join(sc, 'config'), 'check=clobber\n')
      writeFileSync(join(sc, 'settings.json'), '{"check":"keep"}\n')
    })
    const actions = migrateSidecar(dir)
    expect(settingsJson(dir)).toEqual({ check: 'keep' })
    expect(existsSync(join(dir, '.plumbbob', 'config'))).toBe(false) // still consumed
    expect(actions).toEqual(['staged the move (builds/ + settings.json) — commit it yourself'])
  })

  it('creates no settings.json when the legacy sidecar has no config', () => {
    const dir = partialLegacyRepo((sc) => writeFileSync(join(sc, 'intent.md'), '# Solo Session\n'))
    const actions = migrateSidecar(dir)
    expect(existsSync(settingsPath(dir))).toBe(false)
    expect(actions).toEqual([
      'active session → builds/solo-session (the cursor)',
      'staged the move (builds/ + settings.json) — commit it yourself',
    ])
  })

  // `start` refuses a colliding slug outright; migration instead suffixes -2, -3, … because
  // the folders it is moving already exist and aborting mid-move would destroy state.
  it('disambiguates colliding slugs with -2, -3 … suffixes', () => {
    const dir = partialLegacyRepo((sc) => {
      writeFileSync(join(sc, 'intent.md'), '# Old One\n') // migrates first → claims old-one
      mkdirSync(join(sc, 'archive', 'old one!!'), { recursive: true })
      writeFileSync(join(sc, 'archive', 'old one!!', 'a.md'), 'a\n')
      mkdirSync(join(sc, 'archive', 'old-one'), { recursive: true })
      writeFileSync(join(sc, 'archive', 'old-one', 'b.md'), 'b\n')
    })
    const actions = migrateSidecar(dir)
    expect(activeBuild(dir)).toBe('old-one')
    expect(actions).toContain('archive/old one!! → builds/old-one-2') // slugified, then suffixed
    expect(actions).toContain('archive/old-one → builds/old-one-3')
    expect(existsSync(join(buildDir(dir, 'old-one-2'), 'a.md'))).toBe(true)
    expect(existsSync(join(buildDir(dir, 'old-one-3'), 'b.md'))).toBe(true)
  })

  it('slugs the session from the first heading LINE, not a mid-line #', () => {
    const dir = partialLegacyRepo((sc) =>
      writeFileSync(join(sc, 'intent.md'), 'preamble mentioning a # Not This\n\n# Real Title\nbody\n'),
    )
    migrateSidecar(dir)
    expect(activeBuild(dir)).toBe('real-title')
  })

  it('falls back to migrated-build when the intent has no heading', () => {
    const dir = partialLegacyRepo((sc) => writeFileSync(join(sc, 'intent.md'), 'no heading at all\n'))
    migrateSidecar(dir)
    expect(activeBuild(dir)).toBe('migrated-build')
    expect(existsSync(intentPath(dir, 'migrated-build'))).toBe(true)
  })

  it('keeps an archive name whose slug would be empty', () => {
    const dir = partialLegacyRepo((sc) => {
      mkdirSync(join(sc, 'archive', '@@'), { recursive: true })
      writeFileSync(join(sc, 'archive', '@@', 'note.md'), 'kept\n')
    })
    const actions = migrateSidecar(dir)
    expect(actions).toContain('archive/@@ → builds/@@')
    expect(existsSync(join(buildDir(dir, '@@'), 'note.md'))).toBe(true)
  })

  // narrowExcludes must surgically remove the blanket exclude (any spelling, even
  // whitespace-padded) while leaving the human's own exclude lines alone.
  it('drops every blanket .plumbbob exclude line but keeps foreign lines', () => {
    const dir = partialLegacyRepo((sc) => writeFileSync(join(sc, 'config'), 'check=x\n'))
    writeFileSync(join(dir, '.git', 'info', 'exclude'), 'node_modules/\ndist/\n.plumbbob/\n.plumbbob\n.plumbbob/ \n')
    migrateSidecar(dir)
    const lines = readFileSync(gitPath(dir, 'info/exclude'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
    expect(lines).toContain('node_modules/')
    expect(lines).toContain('dist/')
    expect(lines).not.toContain('.plumbbob/')
    expect(lines).not.toContain('.plumbbob')
    expect(lines).toContain('.plumbbob/STATE') // the narrowed control plane took its place
  })
})

describe('doctor — the verb', () => {
  it('offers the migration and exits 1 when a legacy sidecar is present', async () => {
    const { code, stdout } = await captureIoAsync(() => doctor(legacyRepo(), []))
    expect(code).toBe(1)
    expect(stdout).toContain('legacy flat sidecar')
    expect(stdout).toContain('plumbbob doctor --migrate')
  })

  it('performs the move under --migrate and reports what it did', async () => {
    const dir = legacyRepo()
    const { stdout } = await captureIoAsync(() => doctor(dir, ['--migrate']))
    expect(stdout).toContain('migrated')
    expect(existsSync(intentPath(dir, 'my-legacy-build'))).toBe(true)
    expect(existsSync(join(dir, '.plumbbob', 'archive'))).toBe(false)
  })

  it('says nothing about the sidecar when the repo is not legacy', async () => {
    const { stdout } = await captureIoAsync(() => doctor(makeTempRepo(), []))
    expect(stdout).not.toContain('legacy flat sidecar')
  })

  // The check-gate section: checkride is the gate by default, and a configured
  // `check` setting overrides it.
  it('names a configured `check` setting as the gate and asks nothing more', async () => {
    const dir = makeTempRepo()
    mkdirSync(join(dir, '.plumbbob'), { recursive: true })
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
    const { stdout } = await captureIoAsync(() => doctor(dir, []))
    expect(stdout).toContain('check gate')
    expect(stdout).toContain(`gate: 'true' — the "check" setting overrides checkride`)
    expect(stdout).not.toContain('○ types') // no slot table on the override path
  })

  it("prints checkride's slot/adapter table when checkride is the gate", async () => {
    const { stdout } = await captureIoAsync(() => doctor(makeTempRepo(), []))
    expect(stdout).toContain('check gate')
    expect(stdout).toContain('types') // an empty slot row from checkride's doctor
  })

  it('names each legacy part and the exact migrate remedy', async () => {
    const { stdout } = await captureIoAsync(() => doctor(legacyRepo(), []))
    // the parts list tells the human what is at stake before they run --migrate
    expect(stdout).toContain(
      '\n\nplumbbob doctor — sidecar layout' +
        '\n  ✗ legacy flat sidecar detected at .plumbbob/ (an active session, 2 archived build(s), a config file) — the pre-builds/ layout',
    )
    expect(stdout).toContain('(archive/ + the active session → builds/, config → settings.json; staged, never committed)')
  })

  it('--migrate prints each ✓ action and the migrated check becomes the gate', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty']) // plugin section passes → the exit code is the sidecar/gate's
    const dir = legacyRepo()
    const { code, stdout } = await doctorWithHome(home, dir, ['--migrate'])
    expect(code).toBe(0)
    expect(stdout).toContain('  ✓ config → settings.json (check: pnpm run check)')
    expect(stdout).toContain('  ✓ active session → builds/my-legacy-build (the cursor)')
    expect(stdout).toContain('  ✓ staged the move (builds/ + settings.json) — commit it yourself')
    // the gate section runs after the move, so it already sees the migrated check
    expect(stdout).toContain("✓ gate: 'pnpm run check'")
    expect(stdout).toContain('\n\nplumbbob: all checks passed')
  })

  it("renders checkride's table for a bare repo: ○ empty slots, ✓ built-ins, ✗ counted failures", async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const { code, stdout } = await doctorWithHome(home, makeTempRepo(), [], gateEnv)
    expect(code).toBe(1)
    expect(stdout).toContain('\n\nplumbbob doctor — check gate (D32)\n')
    expect(stdout).toContain('  ✗ install\n      → ') // a required failure carries its hint on the arrow line
    expect(stdout).not.toContain('✗ node') // passing env checks stay silent
    expect(stdout).toContain('  ✓ links ← links (built-in)') // an ok adapter row carries what was found
    expect(stdout).toContain('  ○ types — Enable by adding') // an empty slot surfaces checkride's enable hint
    // The week-1-bounce callout (research/07 Build 2a): a bare repo's gate has
    // no code checks — say so with the exact settings fix, informationally.
    expect(stdout).toContain('○ gate: no code checks detected')
    expect(stdout).toContain('set {"check": "npm test"} in .plumbbob/settings.json')
    expect(stdout).toContain('\n\nplumbbob: 1 problem(s)') // install is the only required failure
  })

  it('flags a detected-but-missing tool with its hint (the D32 footgun)', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const dir = makeTempRepo()
    writeFileSync(join(dir, 'tsconfig.json'), '{}\n') // tsc detected, but no node_modules to run it
    const { code, stdout } = await doctorWithHome(home, dir, [], gateEnv)
    expect(code).toBe(1)
    expect(stdout).toContain('  ✗ types ← tsc\n      → ') // no version suffix when nothing was found
    expect(stdout).toContain('\n\nplumbbob: 2 problem(s)') // install + types
  })
})

// The agent-validation section. overrideRepo + a seeded marketplace make the
// plugin and gate sections pass, so a test's problem count comes from the agents
// alone; HOME is pinned so the personal tier is the throwaway home, not the dev's.
type AgentOpts = {
  readonly contract?: number
  readonly slots?: ReadonlyArray<string>
  readonly command: string
  readonly script?: string
  readonly executable?: boolean
}

// Drop an agent under `<agentsRoot>/.plumbbob/agents/<name>/`. `agentsRoot` is the
// repo (project tier) or a home (personal tier). A `script` writes run.sh with the
// requested mode so the command check can see a missing / non-executable file.
function putAgent(agentsRoot: string, name: string, opts: AgentOpts): void {
  const dir = join(agentsRoot, '.plumbbob', 'agents', name)
  mkdirSync(dir, { recursive: true })
  if (opts.script !== undefined) {
    const script = join(dir, 'run.sh')
    writeFileSync(script, opts.script)
    chmodSync(script, opts.executable ? 0o755 : 0o644)
  }
  writeFileSync(
    join(dir, 'agent.json'),
    JSON.stringify({ contract: opts.contract ?? 1, name, command: opts.command, slots: opts.slots ?? ['build'] }, null, 2),
  )
}

describe('doctor — agent validation (D48)', () => {
  it('validates a healthy agent with a ✓ and its declared slots', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const dir = overrideRepo()
    putAgent(dir, 'good', {
      command: 'sh "$PLUMBBOB_AGENT_DIR/run.sh"',
      script: '#!/bin/sh\necho hi\n',
      executable: true,
      slots: ['build', 'after'],
    })
    const { code, stdout } = await doctorWithHome(home, dir)
    expect(code).toBe(0)
    expect(stdout).toContain('plumbbob doctor — agents (D48)')
    expect(stdout).toContain('✓ good (project) [build, after]')
    expect(stdout).toContain('all checks passed')
  })

  it('flags a malformed agent.json (an unknown slot)', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const dir = overrideRepo()
    putAgent(dir, 'badslots', { command: 'sh "$PLUMBBOB_AGENT_DIR/run.sh"', slots: ['nope'] })
    const { code, stdout } = await doctorWithHome(home, dir)
    expect(code).toBe(1)
    expect(stdout).toContain('✗ badslots (project) —')
    expect(stdout).toContain('slots') // names the offending "slots" field
    expect(stdout).toContain('plumbbob: 1 problem(s)')
  })

  it('flags an unsupported contract version', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const dir = overrideRepo()
    putAgent(dir, 'future', { contract: 2, command: 'sh "$PLUMBBOB_AGENT_DIR/run.sh"' })
    const { code, stdout } = await doctorWithHome(home, dir)
    expect(code).toBe(1)
    expect(stdout).toContain('✗ future (project) —')
    expect(stdout).toContain('contract 2')
  })

  it('flags a command whose script does not exist', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const dir = overrideRepo()
    putAgent(dir, 'ghost', { command: 'sh "$PLUMBBOB_AGENT_DIR/gone.sh"' }) // no run.sh written
    const { code, stdout } = await doctorWithHome(home, dir)
    expect(code).toBe(1)
    expect(stdout).toContain('✗ ghost (project) —')
    expect(stdout).toContain('does not exist')
  })

  it('flags a directly-invoked command that is not executable', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const dir = overrideRepo()
    putAgent(dir, 'noexec', {
      command: '"$PLUMBBOB_AGENT_DIR/run.sh"', // invoked directly, so +x matters
      script: '#!/bin/sh\necho hi\n',
      executable: false,
    })
    const { code, stdout } = await doctorWithHome(home, dir)
    expect(code).toBe(1)
    expect(stdout).toContain('✗ noexec (project) —')
    expect(stdout).toContain('not executable')
  })

  it('aggregates every broken agent into the problem count', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const dir = overrideRepo()
    putAgent(dir, 'a-bad', { contract: 2, command: 'sh "$PLUMBBOB_AGENT_DIR/run.sh"' })
    putAgent(dir, 'z-ghost', { command: 'sh "$PLUMBBOB_AGENT_DIR/none.sh"' })
    const { code, stdout } = await doctorWithHome(home, dir)
    expect(code).toBe(1)
    expect(stdout).toContain('plumbbob: 2 problem(s)')
  })

  it('validates the personal tier too, labeled (personal)', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    putAgent(home, 'mine', { contract: 2, command: 'sh "$PLUMBBOB_AGENT_DIR/run.sh"' }) // home = personal tier
    const { code, stdout } = await doctorWithHome(home, overrideRepo())
    expect(code).toBe(1)
    expect(stdout).toContain('✗ mine (personal) —')
    expect(stdout).toContain('contract 2')
  })

  it('shows no agents section when none are defined', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const { stdout } = await doctorWithHome(home, overrideRepo())
    expect(stdout).not.toContain('plumbbob doctor — agents')
  })
})

// The plugin-link section, in-process with HOME pinned (Stryker cannot see the
// subprocess integration suite, and these checks are pure fs reads anyway).
describe('doctor — plugin link (HOME pinned)', () => {
  it('reports not-linked with the exact link path and both remedies', async () => {
    const home = makeTempDir()
    const { code, stdout } = await doctorWithHome(home, overrideRepo())
    expect(code).toBe(1)
    expect(stdout).toContain('plumbbob doctor — plugin install')
    // the path names WHERE init would link; the fix names both install routes
    expect(stdout).toContain(`✗ not linked — no plugin at ${linkPath(home)}`)
    expect(stdout).toContain('→ install the marketplace plugin (/plugin install plumbbob@<marketplace>) or run: plumbbob init')
    expect(stdout).toContain('\n\nplumbbob: 1 problem(s) — apply the → fixes')
    expect(stdout).toContain('npm i -g plumbbob') // the no-terminal-plumbbob pointer
  })

  it('treats a marketplace install as passing and names every plugin id', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@one', 'plumbbob@two'])
    const { code, stdout } = await doctorWithHome(home, overrideRepo())
    expect(code).toBe(0)
    expect(stdout).toContain('✓ installed via marketplace (plumbbob@one, plumbbob@two)')
    expect(stdout).toContain('\n\nplumbbob: all checks passed')
  })

  it('passes every check when the link points at a real plumbbob package', async () => {
    const home = makeTempDir()
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
    symlinkSync(CHECKOUT, linkPath(home))
    const { code, stdout } = await doctorWithHome(home, overrideRepo())
    expect(code).toBe(0)
    expect(stdout).toContain(`✓ linked (${linkPath(home)} → ${CHECKOUT})`)
    expect(stdout).toContain('✓ plugin manifest present (.claude-plugin/plugin.json)')
    expect(stdout).toMatch(/✓ skills present \(\d+\) — load as \/plumbbob:\*/)
    expect(stdout).toContain('✓ post-edit hook present')
  })

  it('flags a copied dir missing manifest and hook, counting only real skills', async () => {
    const home = makeTempDir()
    const pkg = linkPath(home) // a real directory, not a symlink — the copied-install shape
    mkdirSync(join(pkg, 'skills', 'alpha'), { recursive: true })
    writeFileSync(join(pkg, 'skills', 'alpha', 'SKILL.md'), '# a\n')
    mkdirSync(join(pkg, 'skills', 'beta'), { recursive: true })
    writeFileSync(join(pkg, 'skills', 'beta', 'SKILL.md'), '# b\n')
    mkdirSync(join(pkg, 'skills', 'empty-dir'), { recursive: true }) // no SKILL.md → not a skill
    writeFileSync(join(pkg, 'skills', 'junk.txt'), 'not a skill\n')
    const { code, stdout } = await doctorWithHome(home, overrideRepo())
    expect(code).toBe(1)
    expect(stdout).toContain('✗ plugin manifest missing — the link does not point at a plumbbob package')
    expect(stdout).toContain('→ re-link: plumbbob init')
    expect(stdout).toMatch(/✗ skills incomplete \(2\/\d+\)/) // junk.txt and empty-dir must not count
    expect(stdout).toContain('✗ hook missing (hooks/hooks.json)')
    expect(stdout).toContain('\n\nplumbbob: 3 problem(s)')
  })

  it('counts zero skills when the linked package has no skills dir', async () => {
    const home = makeTempDir()
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
    symlinkSync(makeTempDir(), linkPath(home))
    const { code, stdout } = await doctorWithHome(home, overrideRepo())
    expect(code).toBe(1)
    expect(stdout).toMatch(/✗ skills incomplete \(0\/\d+\)/)
  })

  it('flags the collision when a link and a marketplace install coexist', async () => {
    const home = makeTempDir()
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
    symlinkSync(CHECKOUT, linkPath(home))
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const { code, stdout } = await doctorWithHome(home, overrideRepo())
    expect(code).toBe(1)
    expect(stdout).toContain('✗ collision — also installed via marketplace (plumbbob@robmclarty)')
    expect(stdout).toContain('plumbbob init --uninstall')
    expect(stdout).toContain('\n\nplumbbob: 1 problem(s)') // the collision, not the (healthy) link checks
  })

  it('prints only the plugin section outside a git repo', async () => {
    const home = makeTempDir()
    const { code, stdout } = await doctorWithHome(home, makeTempDir())
    expect(code).toBe(1) // not linked
    expect(stdout).not.toContain('sidecar layout')
    expect(stdout).not.toContain('check gate')
    expect(stdout).not.toContain('approval latch') // no worktree ledger to probe
    // header + the two-line ✗ + blank + summary + PATH note: outside a repo the
    // sidecar, gate, and latch sections must contribute zero lines, not empty headers.
    expect(stdout.trimEnd().split('\n')).toHaveLength(6)
  })
})

// The approval-latch health probe. overrideRepo + a seeded marketplace keep the
// plugin and gate sections passing, so the probe's own line is what a test reads; the
// probe never fails (dormant is legitimate), so the exit code stays 0 either way.
describe('doctor — approval latch (D64)', () => {
  it('reports the latch live with the turn count when the ledger exists', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const dir = overrideRepo()
    writeFileSync(turnPath(dir), '42\n') // the UserPromptSubmit hook has ticked
    const { code, stdout } = await doctorWithHome(home, dir)
    expect(code).toBe(0)
    expect(stdout).toContain('plumbbob doctor — approval latch (D64)')
    expect(stdout).toContain('✓ latch: live (turn 42)')
  })

  it('reports the latch dormant with the hook hint when no ledger exists', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const { code, stdout } = await doctorWithHome(home, overrideRepo())
    expect(code).toBe(0) // dormant is legitimate, never a failure
    // Dormant must read as a state, not an accusation — a wired hook simply may not
    // have ticked yet this session.
    expect(stdout).toContain(
      '○ latch: dormant — guidance only (no turn ledger yet; it ticks on your first prompt when the UserPromptSubmit hook is wired — re-run after one to confirm)',
    )
  })

  it('reads dormant when the ledger is present but garbled (never wedges on it)', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const dir = overrideRepo()
    writeFileSync(turnPath(dir), 'not a number\n')
    const { code, stdout } = await doctorWithHome(home, dir)
    expect(code).toBe(0)
    expect(stdout).toContain('○ latch: dormant')
  })

  it('surfaces a set settings `auto` as informational (D67) — no longer a grant, never a problem', async () => {
    const home = makeTempDir()
    seedMarketplace(home, ['plumbbob@robmclarty'])
    const dir = overrideRepo()
    setLocalSetting(dir, 'auto', true)
    const { code, stdout } = await doctorWithHome(home, dir)
    expect(code).toBe(0) // informational, not a failure
    expect(stdout).toContain('○ auto: set in settings but not a grant since D67')
  })
})
