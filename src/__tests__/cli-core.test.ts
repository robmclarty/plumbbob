import { describe, expect, it } from 'vitest'
import { formatHelp, formatVerbHelp, readVersion, run, verbNames, verbSpec } from '../cli-core.ts'
import { captureIoAsync } from '../../test/helpers/capture-io.ts'

function declaredFlags(name: string): ReadonlyArray<string> {
  return (verbSpec(name)?.flags ?? []).map((f) => f.name)
}

describe('formatHelp', () => {
  it('lists the usage line and every verb', () => {
    const help = formatHelp()
    expect(help).toContain('Usage: plumbbob <verb> [args]')
    for (const verb of ['start', 'status', 'build', 'handoff', 'check', 'checkpoint', 'revert', 'park', 'spike', 'use', 'finish', 'init', 'doctor', 'agent']) {
      expect(help).toContain(verb)
    }
  })

  it('points at per-verb help', () => {
    expect(formatHelp()).toContain("Run 'plumbbob <verb> --help'")
  })
})

describe('formatVerbHelp', () => {
  it('leads with the synopsis and glosses every declared flag', () => {
    const help = formatVerbHelp('checkpoint')
    expect(help).toContain('plumbbob checkpoint [<n>] [-m <msg>] [--body]')
    expect(help).toContain('--plan')
    expect(help).toContain('-m <msg>')
    expect(help).toContain('See: docs/cli-reference.md#checkpoint')
  })

  it('renders a synopsis and a docs pointer for every verb', () => {
    for (const name of verbNames()) {
      const help = formatVerbHelp(name)
      expect(help, name).toContain(`plumbbob ${name}`)
      expect(help, name).toContain(`docs/cli-reference.md#${name}`)
    }
  })

  it('returns null for a name that is not a verb', () => {
    expect(formatVerbHelp('frobnicate')).toBeNull()
  })

  it('shows every declared flag in the synopsis, not only in the gloss list', () => {
    // The synopsis is what gets skimmed and copied; a flag that appears only in
    // the list below it reads as undocumented. This also keeps the CLI's own
    // synopsis honest against the doc synopses the contract test pins.
    for (const name of verbNames()) {
      const help = formatVerbHelp(name) as string
      const synopsis = help.slice(0, help.indexOf('\n\n'))
      for (const flag of declaredFlags(name)) {
        expect(synopsis, `${name} synopsis omits ${flag}`).toContain(flag)
      }
    }
  })
})

describe('per-verb help', () => {
  it('answers --help and -h for every verb, exit 0, without dispatching', async () => {
    for (const name of verbNames()) {
      for (const flag of ['--help', '-h']) {
        const { code, stdout } = await captureIoAsync(() => run([name, flag]))
        expect(code, `${name} ${flag}`).toBe(0)
        expect(stdout, `${name} ${flag}`).toContain(`docs/cli-reference.md#${name}`)
      }
    }
  })

  it('treats `help <verb>` as an alias for `<verb> --help`', async () => {
    const viaAlias = await captureIoAsync(() => run(['help', 'revert']))
    const viaFlag = await captureIoAsync(() => run(['revert', '--help']))
    expect(viaAlias.code).toBe(0)
    expect(viaAlias.stdout).toBe(viaFlag.stdout)
  })

  it('reports an unknown verb passed to `help`', async () => {
    const { code, stderr } = await captureIoAsync(() => run(['help', 'frobnicate']))
    expect(code).toBe(1)
    expect(stderr).toContain("unknown verb 'frobnicate'")
  })
})

describe('unknown flags', () => {
  it('refuses an undeclared flag before the verb runs', async () => {
    const { code, stderr } = await captureIoAsync(() => run(['checkpoint', '--typo']))
    expect(code).toBe(1)
    expect(stderr).toContain("unknown flag '--typo'")
    expect(stderr).toContain("plumbbob checkpoint --help")
  })

  it('refuses --build on a verb that does not resolve a build', async () => {
    const { code, stderr } = await captureIoAsync(() => run(['checkpoint', '--build', 'x']))
    expect(code).toBe(1)
    expect(stderr).toContain("unknown flag '--build'")
  })

  it("reads a value flag's value as a value, never as help", async () => {
    // `checkpoint -m "--help"` must not print help — the token is the commit
    // subject. It reaches the verb, which refuses for want of a session.
    const { code, stdout } = await captureIoAsync(() => run(['checkpoint', '-m', '--help']))
    expect(stdout).not.toContain('See: docs/cli-reference.md')
    expect(code).toBe(1)
  })

  it('never refuses for turn — a wedged hook would block every prompt', async () => {
    const { code } = await captureIoAsync(() => run(['turn', '--anything']))
    expect(code).toBe(0)
  })

  it('does not refuse free text for park', async () => {
    // park's text is the human's content; only the missing session refuses.
    const { code, stderr } = await captureIoAsync(() => run(['park', '--not-a-flag']))
    expect(stderr).not.toContain('unknown flag')
    expect(code).toBe(1)
  })
})

describe('run', () => {
  it('prints help and exits 0 for help / --help / -h / no args', async () => {
    for (const argv of [['help'], ['--help'], ['-h'], []]) {
      const { code, stdout } = await captureIoAsync(() => run(argv))
      expect(code).toBe(0)
      expect(stdout).toContain('Usage: plumbbob <verb> [args]')
    }
  })

  it('reports an unknown verb on stderr and exits 1', async () => {
    const { code, stderr } = await captureIoAsync(() => run(['frobnicate']))
    expect(code).toBe(1)
    expect(stderr).toContain("unknown verb 'frobnicate'")
  })

  it('dispatches the agent verb — an unknown subcommand is the verb\'s own error, not "unknown verb"', async () => {
    const { code, stderr } = await captureIoAsync(() => run(['agent', 'bogus']))
    expect(code).toBe(1)
    expect(stderr).toContain("unknown 'agent' subcommand 'bogus'")
    expect(stderr).not.toContain('unknown verb')
  })

  it('prints the version and exits 0 for version / --version / -v', async () => {
    for (const argv of [['version'], ['--version'], ['-v']]) {
      const { code, stdout } = await captureIoAsync(() => run(argv))
      expect(code).toBe(0)
      expect(stdout).toContain(`plumbbob ${readVersion()}`)
    }
  })
})

describe('readVersion', () => {
  it('reads a semver string from the shipped package.json', () => {
    expect(readVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })
})
