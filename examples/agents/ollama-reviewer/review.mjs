/**
 * ollama-reviewer — a PlumbBob after-slot agent: a LOCAL model (via Ollama,
 * composed with fascicle) gives an advisory review of the step's diff.
 *
 * The contract (docs/agents.md): StepContext JSON on stdin, exactly one
 * envelope JSON on stdout, narration on stderr, exit 0 when the envelope is
 * authoritative. See § "The fascicle trap" for the three idioms this file
 * demonstrates: trajectory → stderr, install_signal_handlers: false, and
 * engine.dispose() in finally.
 */

const CONTRACT = 1

// The only two write sites. Nothing else may touch stdout — a stray
// console.log would put this agent out of contract.
function log(message) {
  process.stderr.write(`ollama-reviewer: ${message}\n`)
}

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`)
}

function blocked(summary, notes) {
  emit({ contract: CONTRACT, status: 'blocked', summary, notes })
}

async function readStdin() {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  return input
}

async function main() {
  await readStdin()
  log('stub — the review is not implemented yet')
  blocked('ollama-reviewer is a stub — no review was run.', 'not implemented yet')
}

main().catch((err) => {
  blocked('ollama-reviewer failed before reviewing.', err instanceof Error ? err.message : String(err))
})
