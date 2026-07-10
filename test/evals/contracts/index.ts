// The contract registry, in table order. run.ts iterates this; a `--contract
// c3` filter selects by id.

import type { Contract } from './contract.ts'
import { c1 } from './c1-pause.eval.ts'
import { c4 } from './c4-range.eval.ts'
import { c7 } from './c7-pressure.eval.ts'

export const CONTRACTS: ReadonlyArray<Contract> = [c1, c4, c7]
