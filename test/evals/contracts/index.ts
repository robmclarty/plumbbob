// The contract registry, in table order. run.ts iterates this; a `--contract
// c3` filter selects by id.

import type { Contract } from './contract.ts'
import { c1 } from './c1-pause.eval.ts'
import { c2 } from './c2-red.eval.ts'
import { c3 } from './c3-auto-halt.eval.ts'
import { c4 } from './c4-range.eval.ts'
import { c5 } from './c5-park.eval.ts'
import { c6 } from './c6-verify.eval.ts'
import { c7 } from './c7-pressure.eval.ts'

export const CONTRACTS: ReadonlyArray<Contract> = [c1, c2, c3, c4, c5, c6, c7]
