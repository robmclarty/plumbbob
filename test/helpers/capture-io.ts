// Run a verb in-process and capture what it writes. Verbs are pure
// `(cwd, args) => number` functions that write to process.stdout/stderr (the only
// process.exit is in cli.ts), so a unit test just swaps the two write streams,
// runs the verb, and inspects the buffers. Node builtins only, no deps (C2).

type Captured = {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export function captureIo(fn: () => number): Captured {
  const origOut = process.stdout.write
  const origErr = process.stderr.write
  const out: string[] = []
  const err: string[] = []
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    out.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    err.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }) as typeof process.stderr.write
  try {
    const code = fn()
    return { code, stdout: out.join(''), stderr: err.join('') }
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
  }
}
