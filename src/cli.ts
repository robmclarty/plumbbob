#!/usr/bin/env node
// plumbbob CLI entry — the published bin. All routing and the help table live in
// cli-core.ts (unit-tested in-process); this file is only the executable shell:
// it wires argv to the dispatcher and turns the returned code into the exit code.
// Keeping the single process.exit here is what lets cli-core.ts be imported by a
// test without tearing down the worker.

import { run } from './cli-core.ts'

process.exit(await run(process.argv.slice(2)))
