import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

type CliResult = {
  readonly stdout: string
  readonly stderr: string
  readonly status: number
}

function runCli(args: ReadonlyArray<string>): CliResult {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { stdout, stderr: '', status: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', status: e.status ?? 1 }
  }
}

describe('plumbbob help', () => {
  it('prints the full verb table', () => {
    const { stdout, status } = runCli(['help'])
    expect(status).toBe(0)
    const verbs = ['start', 'status', 'build', 'check', 'checkpoint', 'revert', 'park', 'spike', 'reset', 'setup']
    for (const verb of verbs) {
      expect(stdout).toContain(verb)
    }
  })

  it('prints help when given no args', () => {
    const { stdout, status } = runCli([])
    expect(status).toBe(0)
    expect(stdout).toContain('Usage: plumbbob <verb>')
  })

  it('exits non-zero on an unknown verb', () => {
    const { status, stderr } = runCli(['frobnicate'])
    expect(status).toBe(1)
    expect(stderr).toContain('unknown verb')
  })
})
