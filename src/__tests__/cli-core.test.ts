import { describe, expect, it } from 'vitest'
import { formatHelp, readVersion, run } from '../cli-core.ts'
import { captureIoAsync } from '../../test/helpers/capture-io.ts'

describe('formatHelp', () => {
  it('lists the usage line and every verb', () => {
    const help = formatHelp()
    expect(help).toContain('Usage: plumbbob <verb> [args]')
    for (const verb of ['start', 'status', 'build', 'check', 'checkpoint', 'revert', 'park', 'spike', 'use', 'finish', 'init', 'doctor', 'agent']) {
      expect(help).toContain(verb)
    }
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
