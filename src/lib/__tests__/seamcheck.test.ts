import { describe, expect, it } from 'vitest'
import { seamFindings, type Tree } from '../seamcheck.ts'

/** A tree built from a flat list of repo-relative files; every ancestor directory exists. */
function treeOf(files: ReadonlyArray<string>): Tree {
  const dirs = new Set<string>()
  for (const f of files) {
    const parts = f.split('/')
    for (let i = 1; i < parts.length; i += 1) {
      dirs.add(parts.slice(0, i).join('/'))
    }
  }
  return {
    exists: (p) => files.includes(p) || dirs.has(p),
    entries: (d) => {
      const prefix = d === '' ? '' : `${d}/`
      const names = [...files, ...dirs].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length).split('/')[0] ?? '')
      return [...new Set(names)].filter((n) => n !== '')
    },
  }
}

/** A plan with one step per seam line given, every step undone unless its line starts with `x `. */
function planOf(seams: ReadonlyArray<string | null>): string {
  const steps = seams.flatMap((seam, i) => {
    const done = seam?.startsWith('x ') === true
    const line = `${i + 1}. [${done ? 'x' : ' '}] Step ${i + 1}, **done when:** it works.`
    const body = seam === null ? null : seam.replace(/^x /, '')
    return body === null ? [line] : [line, `   - seam: ${body}`]
  })
  return ['# Plan', '', '## Steps', '', ...steps, ''].join('\n')
}

const TREE = treeOf(['src/limiter.ts', 'src/user.ts', 'src/lib/intent.ts', 'src/verbs/build.ts', 'README.md'])

describe('seamFindings', () => {
  it('says nothing when every token exists or is a new file with no near sibling', () => {
    const plan = planOf(['`src/limiter.ts`', '`src/throttle.ts`, `src/lib/`', '`docs/new/guide.md`'])
    expect(seamFindings(plan, TREE)).toEqual([])
  })

  it('names a token one edit away from a sibling that exists, linked to its step', () => {
    const plan = planOf(['`src/limiter.ts`', '`src/limter.ts`'])
    expect(seamFindings(plan, TREE)).toEqual([
      { step: 2, line: 7, kind: 'near-miss', words: 'names `src/limter.ts`, which does not exist; `src/limiter.ts` does.' },
    ])
  })

  it('catches a swap of two neighbours and a near-miss directory grant', () => {
    const plan = planOf(['`src/limtier.ts`', '`src/vebrs/`'])
    expect(seamFindings(plan, TREE).map((f) => f.words)).toEqual([
      'names `src/limtier.ts`, which does not exist; `src/limiter.ts` does.',
      'names `src/vebrs/`, which does not exist; `src/verbs/` does.',
    ])
  })

  it('reads a stem grown or cut at its end as a new file on purpose, and keeps to the extension', () => {
    const plan = planOf(['`src/users.ts`', '`src/limiter2.ts`', '`src/limiter.js`', '`READMEE.md`'])
    expect(seamFindings(plan, TREE)).toEqual([])
  })

  it('reports a seam the build would refuse, in the parse’s own words less the step', () => {
    const plan = planOf([null, '`src/*.ts`'])
    expect(seamFindings(plan, TREE).map((f) => [f.step, f.kind, f.words])).toEqual([
      [1, 'unparsed', 'has no `seam:` line.'],
      [2, 'unparsed', "'s seam token `src/*.ts` is a glob; seams are exact paths or `dir/` grants, per D23 (no-glob-seams)."],
    ])
  })

  it('skips a landed step, whose files may have moved on since', () => {
    const plan = planOf(['x `src/limter.ts`', null])
    expect(seamFindings(plan, TREE).map((f) => f.step)).toEqual([2])
  })

  it('says nothing about a token whose directory does not exist yet', () => {
    expect(seamFindings(planOf(['`lib/limter.ts`']), TREE)).toEqual([])
  })
})
