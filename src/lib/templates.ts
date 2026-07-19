// Scaffold templates live at `<pkg-root>/templates/*.md` and carry `{{PLACEHOLDER}}`
// tokens the verbs fill in. `start` stamps intent.md / build-log.md; `spike` stamps
// spike-report.md. Shared here so both resolve the template dir the same way (relative
// to the compiled module URL) and substitute with one mechanism. Pure/procedural,
// node-builtins-only (C1/C2).

import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

export function readTemplate(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../templates/${name}`, import.meta.url)), 'utf8')
}

// Replace every `{{KEY}}` with its value. Generic over the placeholder set so a new
// template can add tokens (spike-report's `{{VIA}}`/`{{DATE}}`) without touching this.
export function stampTemplate(template: string, subs: Readonly<Record<string, string>>): string {
  let out = template
  for (const [key, value] of Object.entries(subs)) {
    out = out.split(`{{${key}}}`).join(value)
  }
  return out
}
