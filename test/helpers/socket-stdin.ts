// Gives the CLI subprocess a real socket as stdin (fd 0) — the exact shape an
// agent harness hands it, and the one commitbody.ts's guard must refuse
// rather than block on. A loopback TCP connection is a socket to
// `fstatSync(0).isSocket()` just as a unix-domain one would be, and needs no
// filesystem path. Kept out of src/ alongside fixture-repo.ts (D14 —
// throwaway-repo-tests): the src/ tree never imports across into test/.

import { spawn } from 'node:child_process'
import { connect, createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('../../src/cli.ts', import.meta.url))

type CliResult = {
  readonly stdout: string
  readonly stderr: string
  readonly status: number | null
}

/**
 * Run the CLI as a child process whose stdin (fd 0) is a connected socket,
 * standing in for an agent harness's stdin — the shape that used to make
 * `--body` block forever instead of refusing.
 */
export async function runCliWithSocketStdin(dir: string, args: ReadonlyArray<string>): Promise<CliResult> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  const client = connect(port, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve)
    client.once('error', reject)
  })

  const env: Record<string, string | undefined> = { ...process.env }
  delete env.CLAUDECODE // deterministic regardless of the host session, same as fixture-repo.ts's runCli

  const child = spawn('node', [CLI, ...args], { cwd: dir, env, stdio: [client, 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')))
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
  const status = await new Promise<number | null>((resolve) => child.on('close', resolve))

  client.destroy()
  server.close()
  return { stdout, stderr, status }
}
