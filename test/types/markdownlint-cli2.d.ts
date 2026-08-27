// markdownlint-cli2 ships no TypeScript declarations, so this narrow ambient
// module covers the one API the tests call: main(), the CLI entry as a
// function. Widen it only when a test needs another parameter.

declare module 'markdownlint-cli2' {
  export type MainParams = {
    readonly argv: ReadonlyArray<string>
    readonly directory?: string
    readonly logMessage?: (message: string) => void
    readonly logError?: (message: string) => void
    readonly optionsOverride?: Record<string, unknown>
  }
  export function main(params: MainParams): Promise<number>
}
