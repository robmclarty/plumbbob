// The eval driver (intent D2): one fascicle engine per fixture repo, one FRESH
// `claude -p` session per scripted human turn. No session resume — plumbbob's
// TURN/GRANT/TICK ledger is per-worktree filesystem state, so a new session's
// UserPromptSubmit tick is exactly a real human turn.
//
// fascicle 0.8.16 drops the typed `plugin_dirs`/`setting_sources` provider
// config (`run_cli` builds argv with `provider_config: {}`), so every plugin
// flag rides `extra_args`, which does flow. Drop the workaround when fascicle
// threads the real config (parked in the build log).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { create_engine, type Engine, type GenerateResult } from 'fascicle'
import { resolvePluginDir, type Sweep } from './plugin.ts'

export const EVAL_MODEL = process.env.PLUMBBOB_EVAL_MODEL ?? 'opus'
export const EVAL_N = readCount(process.env.PLUMBBOB_EVAL_N, 5)

// What a build session may touch. `git commit` is DELIBERATELY allowed in both
// sweeps (intent D3): contract 2 measures whether the prose routes around a
// refused checkpoint — denying commit at the permission layer would measure
// the harness instead of the skill.
export const BUILD_SESSION_TOOLS = [
  'Read',
  'Edit',
  'Write',
  'Grep',
  'Glob',
  'Bash(plumbbob:*)',
  'Bash(node check.js:*)',
  'Bash(node:*)',
  'Bash(git diff:*)',
  'Bash(git status:*)',
  'Bash(git log:*)',
  'Bash(git add:*)',
  'Bash(git commit:*)',
].join(',')

export type TurnOptions = {
  readonly allowedTools?: string // comma-joined; defaults to BUILD_SESSION_TOOLS
  readonly maxTurns?: number // agentic-loop runaway cap, default 50
  readonly timeoutMs?: number // wall-clock abort, default 10 minutes
}

export type TurnResult = {
  readonly content: string // the final assistant text (informational probes only, C1)
  readonly finishReason: string
  readonly costUsd: number | null // fascicle's estimate; 0/null under OAuth-trivial turns
  readonly inputTokens: number
  readonly outputTokens: number
  readonly durationMs: number
  readonly sessionId: string | null
}

export type EvalSession = {
  readonly repo: string
  readonly sweep: Sweep
  readonly model: string
  // Arm the turn ledger before the first measured turn: the `-p` tick lands at
  // ~session end, so a fixture's first session would otherwise run against an
  // absent ledger (no TICK stamp — latch dormant). One trivial turn makes the
  // ledger exist first, which is production-faithful: a real human has always
  // spoken at least once (plan approval) before a build turn. No-op on the
  // baseline sweep, whose whole point is a ledger that never exists.
  warmup(): Promise<void>
  turn(prompt: string, options?: TurnOptions): Promise<TurnResult>
  close(): Promise<void>
}

export async function openSession(options: {
  readonly repo: string
  readonly sweep: Sweep
  readonly model?: string
}): Promise<EvalSession> {
  const { repo, sweep } = options
  const model = options.model ?? EVAL_MODEL
  const pluginDir = resolvePluginDir(sweep)
  const pluginArgs = ['--plugin-dir', pluginDir, '--setting-sources', 'project,local']
  const engine: Engine = create_engine({
    providers: { claude_cli: { default_cwd: repo, auth_mode: 'auto' } },
  })

  async function turn(prompt: string, turnOptions: TurnOptions = {}): Promise<TurnResult> {
    const started = Date.now()
    const result = await engine.generate({
      model,
      provider: 'claude_cli',
      prompt,
      abort: AbortSignal.timeout(turnOptions.timeoutMs ?? 600_000),
      provider_options: {
        claude_cli: {
          extra_args: [
            ...pluginArgs,
            '--permission-mode',
            'acceptEdits',
            '--allowedTools',
            turnOptions.allowedTools ?? BUILD_SESSION_TOOLS,
            '--max-turns',
            String(turnOptions.maxTurns ?? 50),
          ],
        },
      },
    })
    return toTurnResult(result, Date.now() - started)
  }

  async function warmup(): Promise<void> {
    if (sweep === 'baseline') return
    await turn('Reply with exactly: ok', { allowedTools: 'Read', maxTurns: 3, timeoutMs: 120_000 })
    if (!existsSync(join(repo, '.plumbbob', 'TURN'))) {
      throw new Error('warmup turn completed but the turn ledger did not tick — is the plugin loading?')
    }
  }

  return {
    repo,
    sweep,
    model,
    warmup,
    turn,
    close: () => engine.dispose(),
  }
}

function toTurnResult(result: GenerateResult<string>, durationMs: number): TurnResult {
  const reported = (result.provider_reported?.claude_cli ?? {}) as { session_id?: unknown }
  return {
    content: String(result.content),
    finishReason: String(result.finish_reason),
    costUsd: result.cost?.total_usd ?? null,
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
    durationMs,
    sessionId: typeof reported.session_id === 'string' ? reported.session_id : null,
  }
}

function readCount(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// Read a worktree ledger file, or null when absent — shared by contracts that
// record ledger state as informational context.
export function readLedger(repo: string, name: 'TURN' | 'GRANT'): string | null {
  try {
    return readFileSync(join(repo, '.plumbbob', name), 'utf8').trim()
  } catch {
    return null
  }
}
