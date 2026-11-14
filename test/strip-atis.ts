// Keep the suite off whatever `atis` this machine has installed. plumbbob asks
// an atis on PATH for a step's reach when a plan is approved and when a step is
// entered, so a real one would write `reach.json` into every fixture build and
// change what the fixtures commit. Dropping each PATH folder that holds an
// `atis` makes the default the absent case; a test that wants an answer puts a
// fake one on PATH with test/helpers/fake-atis.ts. Child CLIs inherit the PATH.

import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

process.env['PATH'] = (process.env['PATH'] ?? '')
  .split(delimiter)
  .filter((dir) => dir.length > 0 && !existsSync(join(dir, 'atis')))
  .join(delimiter)
