// Scaffold templates live at `<pkg-root>/templates/*.md` and carry `{{PLACEHOLDER}}`
// tokens the verbs fill in: `start` stamps intent.md and build-log.md, `spike` stamps
// spike-report.md. Shared here so every verb resolves the template dir the same way
// (relative to the compiled module URL) and substitutes with one mechanism. Pure and
// procedural, node builtins only.

import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

/**
 * Read a template by filename from the package's `templates/` directory.
 *
 * Resolved relative to the compiled module URL, so the same relative hop works
 * from `src/lib/` and `dist/lib/` alike: the templates ship with the package,
 * never with the consumer's repo.
 */
export function readTemplate(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../templates/${name}`, import.meta.url)), 'utf8')
}

/**
 * Replace every `{{KEY}}` in the template with its value from `subs`.
 *
 * Generic over the placeholder set so a new template can add tokens
 * (spike-report's `{{VIA}}`/`{{DATE}}`) without touching this.
 */
export function stampTemplate(template: string, subs: Readonly<Record<string, string>>): string {
  let out = template
  for (const [key, value] of Object.entries(subs)) {
    out = out.split(`{{${key}}}`).join(value)
  }
  return out
}
