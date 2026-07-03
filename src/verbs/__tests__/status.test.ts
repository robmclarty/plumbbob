import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { status } from '../status.ts'
import { start } from '../start.ts'
import { buildDir } from '../../lib/sidecar.ts'
import { setLocalSetting } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

describe('status', () => {
  it('prints the NO ACTIVE SESSION sentinel with no session (exit 0)', () => {
    const { code, stdout } = captureIo(() => status(makeTempRepo()))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('NO ACTIVE SESSION')
  })

  it('prints NO ACTIVE SESSION outside a git repo', () => {
    const { code, stdout } = captureIo(() => status(makeTempDir()))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('NO ACTIVE SESSION')
  })

  it('prints the orientation dashboard for an active session', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['Dashboards']))
    const { code, stdout } = captureIo(() => status(dir))
    expect(code).toBe(0)
    expect(stdout).toContain('[DESIGN]')
    expect(stdout).toContain('Dashboards')
  })

  it('lists the builds instead of a broken dashboard when the session has no resolvable cursor', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['First Build']))
    // a second build folder + no cursor → activeBuild cannot resolve one
    mkdirSync(buildDir(dir, 'second-build'), { recursive: true })
    writeFileSync(join(buildDir(dir, 'second-build'), 'intent.md'), '# Second\n')
    setLocalSetting(dir, 'activeBuild', '') // clear the cursor

    const { code, stdout } = captureIo(() => status(dir))
    expect(code).toBe(0)
    expect(stdout).toContain('NO ACTIVE BUILD')
    expect(stdout).toContain('first-build')
    expect(stdout).toContain('second-build')
  })

  it('renders the dashboard for the build named by --build', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['First Build']))
    mkdirSync(buildDir(dir, 'second-build'), { recursive: true })
    writeFileSync(
      join(buildDir(dir, 'second-build'), 'intent.md'),
      '# Second Feature\n\n## Steps\n\n1. [ ] Go — **done when:** ok\n   - seam: `src/`\n',
    )
    const { code, stdout } = captureIo(() => status(dir, ['--build', 'second-build']))
    expect(code).toBe(0)
    expect(stdout).toContain('Second Feature')
  })
})
