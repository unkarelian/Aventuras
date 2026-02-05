import { LocalLinter, BinaryModule, type Lint, type Suggestion, type LintConfig } from 'harper.js'
import wasmUrl from 'harper.js/dist/harper_wasm_bg.wasm?url'

const DEBUG = false

function log(...args: unknown[]) {
  if (DEBUG) {
    console.log('[Grammar]', ...args)
  }
}

export interface GrammarIssue {
  message: string
  problemText: string
  start: number
  end: number
  suggestions: string[]
  kind: string
}

class GrammarService {
  private linter: LocalLinter | null = null
  private setupPromise: Promise<void> | null = null
  private enabled = true

  async setup(): Promise<void> {
    if (this.linter) return
    if (this.setupPromise) return this.setupPromise

    this.setupPromise = (async () => {
      try {
        log('Initializing Harper linter...')

        // Load the WASM binary using Vite's URL import
        const binary = BinaryModule.create(wasmUrl)
        await binary.setup()

        this.linter = new LocalLinter({ binary })
        await this.linter.setup()

        // Configure linter - disable some rules that might be too strict for creative writing
        const config = await this.linter.getLintConfig()
        // Disable rules that might interfere with creative writing
        const updatedConfig: LintConfig = {
          ...config,
          // Keep most rules enabled, but disable some that might be annoying
          SentenceCapitalization: false, // Creative writing might have stylistic lowercase
          LongSentences: false, // Creative writing often has long sentences
        }
        await this.linter.setLintConfig(updatedConfig)

        log('Harper linter initialized successfully')
      } catch (error) {
        console.error('[Grammar] Failed to initialize Harper:', error)
        this.linter = null
      }
    })()

    return this.setupPromise
  }

  async lint(text: string): Promise<GrammarIssue[]> {
    if (!this.enabled || !text.trim()) return []

    await this.setup()
    if (!this.linter) return []

    try {
      const lints = await this.linter.lint(text, { language: 'plaintext' })
      log('Linted text, found', lints.length, 'issues')

      return lints.map((lint: Lint) => {
        const span = lint.span()
        const suggestions = lint.suggestions()

        return {
          message: lint.message(),
          problemText: lint.get_problem_text(),
          start: span.start,
          end: span.end,
          suggestions: suggestions.map((s: Suggestion) => s.get_replacement_text()),
          kind: lint.lint_kind_pretty(),
        }
      })
    } catch (error) {
      log('Linting failed:', error)
      return []
    }
  }

  async applySuggestion(
    text: string,
    issue: GrammarIssue,
    suggestionIndex: number,
  ): Promise<string> {
    if (!this.linter) return text

    try {
      // Reconstruct by replacing the span with the suggestion text
      const suggestion = issue.suggestions[suggestionIndex]
      if (suggestion === undefined) return text

      const before = text.slice(0, issue.start)
      const after = text.slice(issue.end)
      return before + suggestion + after
    } catch (error) {
      log('Failed to apply suggestion:', error)
      return text
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  async addWord(word: string): Promise<void> {
    await this.setup()
    if (!this.linter) return

    try {
      await this.linter.importWords([word])
      log('Added word to dictionary:', word)
    } catch (error) {
      log('Failed to add word:', error)
    }
  }
}

export const grammarService = new GrammarService()
