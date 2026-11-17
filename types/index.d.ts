/** One category of what fills the window, as a share of the whole bar. */
export type Segment = {
  /** The category's label as /context prints it (`Messages`, `System tools`). */
  name: string
  /** The theme key /context draws the category in. */
  color: string
  /** Estimated tokens in the category. */
  tokens: number
  /** Fraction of the bar's full width, 0 to 1. */
  share: number
}

/** What the bar draws: one measurement of the live context window. */
export type Snapshot = {
  /** Tokens in the window: the last response's input side, or an estimate. */
  tokens: number
  /** The model's context window, in tokens. */
  window: number
  /** Whole percent of the window in use. */
  percent: number
  /** True when `tokens` is the local estimate (fresh or just-compacted window). */
  isEstimate: boolean
  /** The used categories, in /context's order; shares sum to the fill. */
  segments: Segment[]
}

/** Which of the two configured commands the handoff button alternates between. */
export type HandoffKind = 'handoff' | 'resume'

/**
 * The configured handoff commands as this session has them installed: each
 * one's name as the command list spells it, or null when it isn't installed
 * (or isn't configured). `key` is the configuration this was checked for.
 */
export type HandoffCommands = { key: string; handoff: string | null; resume: string | null }

declare module 'claude-code' {
  interface PluginState {
    'context-bar': {
      snapshot: Shaped<Snapshot | null>
      /** Which handoff command this session ran last, by any route; null before either. */
      lastHandoff: Shaped<HandoffKind | null>
      /** Which configured handoff commands are installed; null until first checked. */
      handoffCommands: HandoffCommands | null
    }
  }
}
