// Detect a marketplace-installed plumbbob plugin from Claude Code's plugin state.
// Keeps the skills-dir install (`plumbbob init`) from colliding with a marketplace
// install: two plugins both named `plumbbob` fight over the `/plumbbob:*` namespace
// and the skills can drop to flat names (`/pb-status`). Read-only, node builtins
// only: a missing, unreadable, or malformed file means "none installed".
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Marketplace plugin ids for plumbbob recorded in installed_plugins.json.
 *
 * Ids look like "plumbbob@robmclarty": a bare `plumbbob` or a
 * `plumbbob@<marketplace>` id matches; `plumbbob-spike@x` and the like do not.
 * Empty when none are installed, or the file is absent, unreadable, or malformed.
 */
export function marketplacePlumbbob(home: string): string[] {
  try {
    const raw = readFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8')
    const plugins = (JSON.parse(raw) as { plugins?: Record<string, unknown> }).plugins
    if (plugins === undefined || plugins === null) {
      return []
    }
    return Object.keys(plugins).filter((id) => id === 'plumbbob' || id.startsWith('plumbbob@'))
  } catch {
    return []
  }
}
