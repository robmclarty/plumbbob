import { describe, expect, it } from 'vitest'
import { formatHelp, run } from '../cli-core.ts'
import { captureIo } from '../../test/helpers/capture-io.ts'

describe('formatHelp', () => {
  it('lists the usage line and every verb', () => {
    const help = formatHelp()
    expect(help).toContain('Usage: plumbbob <verb> [args]')
    for (const verb of ['start', 'status', 'build', 'check', 'checkpoint', 'revert', 'park', 'spike', 'wrap', 'init', 'doctor']) {
      expect(help).toContain(verb)
    }
  })
})

describe('run', () => {
  it('prints help and exits 0 for help / --help / -h / no args', () => {
    for (const argv of [['help'], ['--help'], ['-h'], []]) {
      const { code, stdout } = captureIo(() => run(argv))
      expect(code).toBe(0)
      expect(stdout).toContain('Usage: plumbbob <verb> [args]')
    }
  })

  it('reports an unknown verb on stderr and exits 1', () => {
    const { code, stderr } = captureIo(() => run(['frobnicate']))
    expect(code).toBe(1)
    expect(stderr).toContain("unknown verb 'frobnicate'")
  })
})
