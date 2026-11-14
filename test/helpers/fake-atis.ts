// A fake `atis` for the reach tests: an executable shell script in a temp bin
// folder, put first on PATH. plumbbob finds atis on PATH and nowhere else, so
// this is the whole seam; the real atis is never needed. Node builtins only.

import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

/** A fake atis on PATH: the log of the calls it took, and the way back. */
export type FakeAtis = {
  /** One line per call the fake took, its arguments joined by spaces. */
  readonly calls: () => ReadonlyArray<string>
  /** Take the fake off PATH and remove its folder. */
  readonly restore: () => void
}

/** How the fake behaves; every field has a working default. */
export type FakeAtisOptions = {
  /** What `--version` prints. Default `9.9.9`. */
  readonly version?: string
  /** The `reach` entries every answer carries. Default none. */
  readonly reach?: ReadonlyArray<Readonly<Record<string, unknown>>>
  /** Shell run in place of the default `reach` answer, e.g. `exit 2` or `echo nonsense`. */
  readonly reachScript?: string
  /** The `kind` the answer claims. Default `atis.reach`. */
  readonly kind?: string
  /** The `schema_version` the answer claims. Default 1. */
  readonly schemaVersion?: number
}

/**
 * Put a fake `atis` first on PATH and return its call log and its undo.
 *
 * It answers `--version` with a version and `reach --json -- <paths...>` with an
 * `atis.reach` object whose `paths` are the ones it was asked, in order, so
 * the stored answer matches the seam it was asked about.
 */
export function withFakeAtis(options: FakeAtisOptions = {}): FakeAtis {
  const dir = mkdtempSync(join(tmpdir(), 'plumbbob-fake-atis-'))
  const log = join(dir, 'calls.log')
  const reach = JSON.stringify(options.reach ?? [])
  const kind = JSON.stringify(options.kind ?? 'atis.reach')
  const answer =
    options.reachScript ??
    [
      'paths=""',
      'for p in "$@"; do',
      '  if [ -n "$paths" ]; then paths="$paths,"; fi',
      '  paths="$paths\\"$p\\""',
      'done',
      `printf '{"schema_version":${options.schemaVersion ?? 1},"kind":%s,"head":"abc123","paths":[%s],"new":[],"reach":%s,"muted":[]}\\n' '${kind}' "$paths" '${reach}'`,
    ].join('\n')
  const script = [
    '#!/bin/sh',
    `echo "$*" >> '${log}'`,
    'if [ "$1" = "--version" ]; then',
    `  echo '${options.version ?? '9.9.9'}'`,
    '  exit 0',
    'fi',
    'if [ "$1" = "reach" ] && [ "$2" = "--json" ]; then',
    '  shift 2',
    '  if [ "$1" = "--" ]; then shift; fi',
    answer,
    '  exit 0',
    'fi',
    'exit 2',
    '',
  ].join('\n')
  writeFileSync(join(dir, 'atis'), script)
  chmodSync(join(dir, 'atis'), 0o755)
  const before = process.env['PATH'] ?? ''
  process.env['PATH'] = `${dir}${delimiter}${before}`
  return {
    calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter((l) => l.length > 0) : []),
    restore: () => {
      process.env['PATH'] = before
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
