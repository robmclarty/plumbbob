import { describe, expect, it } from 'vitest'
import { expandStepList, formatStepList, hasStep, normalizeStepList, parseStepList, readBuildArgs } from '../steplist.ts'

describe('parseStepList — D12 (step-list-grants)', () => {
  it('reads a number, a span, and numbers and spans joined by commas, in the order written', () => {
    expect(parseStepList('3')).toEqual([{ from: 3, to: 3 }])
    expect(parseStepList('2-4')).toEqual([{ from: 2, to: 4 }])
    expect(parseStepList('4-4')).toEqual([{ from: 4, to: 4 }])
    expect(parseStepList('20,5-9')).toEqual([
      { from: 20, to: 20 },
      { from: 5, to: 9 },
    ])
  })

  it('refuses anything else, so a malformed range names nothing', () => {
    for (const text of ['', '0', '0-3', '5-3', '1-', '-3', '1,,2', ',1', '1,', '1 2', '1, 2', 'x', '1-2-3', '2.5']) {
      expect(parseStepList(text), text).toBeNull()
    }
  })

  it('holds a long span as its two ends, never the expansion', () => {
    expect(parseStepList('1-100000')).toEqual([{ from: 1, to: 100000 }])
    expect(parseStepList('1-99999999999999999999')).toBeNull() // past a safe integer
  })
})

describe('expandStepList', () => {
  const plan = (n: number): boolean => n >= 1 && n <= 7

  it('spells each span out in place, in the order written', () => {
    expect(expandStepList(parseStepList('1,6,2-4,7,5') ?? [], plan)).toEqual([1, 6, 2, 3, 4, 7, 5])
  })

  it('stops a span at the first number the plan lacks, and keeps that number', () => {
    expect(expandStepList(parseStepList('6,2-100000,3') ?? [], plan)).toEqual([6, 2, 3, 4, 5, 6, 7, 8, 3])
    expect(expandStepList(parseStepList('9') ?? [], plan)).toEqual([9])
  })
})

describe('hasStep', () => {
  it('names exactly the steps a list holds', () => {
    const list = parseStepList('20,5-9') ?? []
    expect([4, 5, 7, 9, 10, 19, 20, 21].filter((n) => hasStep(list, n))).toEqual([5, 7, 9, 20])
  })
})

describe('formatStepList', () => {
  it('writes steps in the order given, folding each run that climbs by one into a span', () => {
    expect(formatStepList([20, 5, 6, 7, 8, 9])).toBe('20,5-9')
    expect(formatStepList([48, 49, 50, 51, 76, 52, 53, 54, 55, 56, 57])).toBe('48-51,76,52-57')
    expect(formatStepList([3])).toBe('3')
    expect(formatStepList([9, 8, 7])).toBe('9,8,7') // a falling run is no span
    expect(formatStepList([])).toBe('')
  })

  it('round-trips through the parser', () => {
    const steps = [20, 5, 6, 7, 8, 9]
    const list = parseStepList(formatStepList(steps)) ?? []
    expect(steps.every((n) => hasStep(list, n))).toBe(true)
  })
})

describe('normalizeStepList', () => {
  it('sorts and merges, so two ways of typing the same steps write one line', () => {
    expect(normalizeStepList(parseStepList('20,5-9') ?? [])).toBe('5-9,20')
    expect(normalizeStepList(parseStepList('5-9,20') ?? [])).toBe('5-9,20')
    expect(normalizeStepList(parseStepList('3,1,2') ?? [])).toBe('1-3')
    expect(normalizeStepList(parseStepList('1-5,3-8,9') ?? [])).toBe('1-9')
    expect(normalizeStepList(parseStepList('1-100000') ?? [])).toBe('1-100000')
  })
})

describe('readBuildArgs — D16 (list-reading)', () => {
  it('reads a range, and a list, typed with or without a space after the comma', () => {
    expect(readBuildArgs('1-3')).toEqual({ auto: false, range: true, steps: [{ from: 1, to: 3 }] })
    expect(readBuildArgs('20,5-9').steps).toEqual(parseStepList('20,5-9'))
    expect(readBuildArgs('20, 5-9').steps).toEqual(parseStepList('20,5-9'))
    expect(readBuildArgs('20 , 5-9').steps).toEqual(parseStepList('20,5-9'))
  })

  it('joins every number in the run once any one carries a comma or a dash', () => {
    expect(readBuildArgs('20 5-9')).toEqual({ auto: false, range: true, steps: parseStepList('20,5-9') })
    expect(readBuildArgs('2, 3')).toEqual({ auto: false, range: true, steps: parseStepList('2,3') })
  })

  it('reads bare numbers alone as no range', () => {
    expect(readBuildArgs('2').range).toBe(false)
    expect(readBuildArgs('2 3').range).toBe(false)
    expect(readBuildArgs('2').steps).toEqual([{ from: 2, to: 2 }])
  })

  it('leaves trailing sentence punctuation to the sentence, a comma after the last number included', () => {
    expect(readBuildArgs('1-3.')).toEqual({ auto: false, range: true, steps: [{ from: 1, to: 3 }] })
    expect(readBuildArgs('2, then review')).toEqual({ auto: false, range: false, steps: [{ from: 2, to: 2 }] })
    expect(readBuildArgs('1-3, then review').steps).toEqual([{ from: 1, to: 3 }])
  })

  it('reads --auto anywhere in the run, and stops at the first token that is not an argument', () => {
    expect(readBuildArgs('--auto 1-3')).toEqual({ auto: true, range: true, steps: [{ from: 1, to: 3 }] })
    expect(readBuildArgs('1-3 --auto!').auto).toBe(true)
    expect(readBuildArgs('--wip 2020-2024')).toEqual({ auto: false, range: false, steps: null })
    expect(readBuildArgs('the 1-5 endpoints')).toEqual({ auto: false, range: false, steps: null })
  })

  it('reads a range that does not parse as a range with no steps, so it grants nothing', () => {
    expect(readBuildArgs('5-3')).toEqual({ auto: false, range: true, steps: null })
    expect(readBuildArgs('--auto 1--3')).toEqual({ auto: true, range: true, steps: null })
  })
})
