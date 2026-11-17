import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown, SessionContextUsage } from 'claude-code'

import type { HandoffCommands, HandoffKind, Segment, Snapshot } from '../types'

// Bump the tag when Snapshot's fields change: a reload then reads the old
// stored value as absent instead of drawing it with the new code.
const snapshot = atom({ plugin: 'context-bar', key: 'snapshot' } as const, null, {
  shape: 'snapshot-2',
})

/** Which handoff command ran last this session; the button runs the other one. */
const lastHandoff = atom({ plugin: 'context-bar', key: 'lastHandoff' } as const, null, {
  shape: 'kind-1',
})

/** The configured handoff commands as installed here; null until checked. */
const handoffCommands = atom({ plugin: 'context-bar', key: 'handoffCommands' } as const, null)

/**
 * The buttons' glyphs, drawn as their labels (the desktop draws a Button's
 * label, not its children). A Button holds only text, an Svg inside one is
 * refused, so these stand in for the two icons: arrows passing each other,
 * and arrows meeting at a bar. The confirm card names the command run.
 */
const HANDOFF_GLYPH = '\u21C6'
const COMPACT_GLYPH = '\u21E5\u21E4'

const FALLBACK_COLOR = 'promptBorder'
/** The empty part of the bar. */
const TRACK_COLOR = '#312f3e'
/** The bar's height on the surfaces that draw SVG, in CSS pixels. */
const BAR_PX = 10
const CAP_PX = BAR_PX / 2

/**
 * The colors the desktop app draws /context's theme keys in (dark mode). An
 * SVG cannot name a theme key, so the drawn bar needs them as raw colors.
 */
const KEY_COLORS: Record<string, string> = {
  promptBorder: '#b4b4b4',
  inactive: '#d6d6d6',
  cyan_FOR_SUBAGENTS_ONLY: '#0891b2',
  green_FOR_SUBAGENTS_ONLY: '#16a34a',
  permission: '#b1b9f9',
  claude: '#c15f3c',
  warning: '#e69b04',
  purple_FOR_SUBAGENTS_ONLY: '#827dbd',
}
const UNKNOWN_COLOR = '#9a9a9a'

/** 478.9k, 200k, 1M, 1.5M: one decimal, trailing ".0" dropped. */
export function formatTokens(n: number): string {
  const trim = (s: string) => s.replace(/\.0$/, '')

  if (n >= 1_000_000) return `${trim((n / 1_000_000).toFixed(1))}M`
  if (n >= 1_000) return `${trim((n / 1_000).toFixed(1))}k`

  return String(Math.round(n))
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0)

/**
 * Turns one usage reading into what the bar draws. The fill and the labels
 * follow the status line's figures (last response's input tokens over the
 * model's window); the breakdown only splits that fill by category, since it
 * is an estimate measured against the compaction window.
 */
export function toSnapshot(
  context: SessionContextUsage,
  breakdown: SessionContextBreakdown | undefined,
): Snapshot | null {
  const window = context.window || breakdown?.rawMaxTokens || 0
  if (window <= 0) return null

  const isEstimate = context.tokens === undefined
  const tokens = context.tokens ?? breakdown?.totalTokens
  if (tokens === undefined) return null

  const fill = clamp01(tokens / window)
  const percent = context.percent ?? Math.round((tokens / window) * 100)

  const used = (breakdown?.categories ?? []).filter(c => c.kind === 'used' && c.tokens > 0)
  const usedTotal = used.reduce((sum, c) => sum + c.tokens, 0)

  const segments: Segment[] =
    usedTotal > 0
      ? used.map(c => ({
          name: c.name,
          color: c.color || FALLBACK_COLOR,
          tokens: c.tokens,
          share: (fill * c.tokens) / usedTotal,
        }))
      : [{ name: 'Used', color: FALLBACK_COLOR, tokens, share: fill }]

  return { tokens, window, percent, isEstimate, segments }
}

/** A share of the bar as an integer flexGrow weight (10,000 = the whole bar). */
const weight = (share: number) => Math.round(clamp01(share) * 10_000)

/** A theme key or raw color as a raw color safe to put in SVG markup. */
export function toRawColor(color: string): string {
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color
  if (/^(rgb|hsl)a?\([\d.,%\s]+\)$/i.test(color)) return color

  return KEY_COLORS[color] ?? UNKNOWN_COLOR
}

const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"'

/**
 * The bar between its two round caps. Its markup is far wider than any slot,
 * so the surface narrows it to the slot, and `preserveAspectRatio="none"`
 * stretches the segments with it: the bar fills whatever width it is given.
 */
export function barSvg(segments: readonly Pick<Segment, 'color' | 'share'>[]): string {
  let x = 0
  const rects = segments
    .filter(s => s.share > 0)
    .map(s => {
      const w = clamp01(s.share) * 1000
      const rect = `<rect x="${x.toFixed(2)}" width="${w.toFixed(2)}" height="${BAR_PX}" fill="${toRawColor(s.color)}"/>`
      x += w

      return rect
    })

  return (
    `<svg ${SVG_NS} width="4000" height="${BAR_PX}" viewBox="0 0 1000 ${BAR_PX}" ` +
    `preserveAspectRatio="none" shape-rendering="crispEdges">` +
    `<rect width="1000" height="${BAR_PX}" fill="${TRACK_COLOR}"/>${rects.join('')}</svg>`
  )
}

/** One round end of the bar: a half circle the bar's height across. */
export function capSvg(side: 'left' | 'right', color: string): string {
  const r = CAP_PX
  const d = side === 'left' ? `M${r} 0A${r} ${r} 0 0 0 ${r} ${BAR_PX}Z` : `M0 0A${r} ${r} 0 0 1 0 ${BAR_PX}Z`

  return `<svg ${SVG_NS} width="${r}" height="${BAR_PX}" viewBox="0 0 ${r} ${BAR_PX}"><path d="${d}" fill="${toRawColor(color)}"/></svg>`
}

// One measurement at a time; asks that arrive meanwhile fold into one more.
let running: Promise<void> | null = null
let isDirty = false

async function measure($: EngineInterface): Promise<void> {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const next = toSnapshot(usage.context, usage.context.breakdown)
  await update($, snapshot, () => next)
}

function refresh($: EngineInterface): Promise<void> {
  if (running) {
    isDirty = true

    return running
  }
  running = (async () => {
    do {
      isDirty = false
      try {
        await measure($)
      } catch {
        // A reading can fail mid-teardown (/clear, exit); the next event retries.
      }
    } while (isDirty)
  })().finally(() => {
    running = null
  })

  return running
}

/** The two commands the handoff button alternates between, as configured. */
export type HandoffConfig = { handoff: string; resume: string }

/** A configured command name: trimmed, with no leading slash; empty when unset. */
export function commandName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/^\//, '') : ''
}

const bare = (name: string) => name.replace(/^\//, '').split(':').pop() ?? ''

/** Whether a command or skill name is the configured one, by full or bare name. */
function sameCommand(name: string, configured: string): boolean {
  return configured !== '' && (name.replace(/^\//, '') === configured || bare(name) === bare(configured))
}

/** Which of the configured pair a run command or skill is, or null. */
export function kindOf(name: string | undefined, config: HandoffConfig): HandoffKind | null {
  if (!name) return null
  if (sameCommand(name, config.handoff)) return 'handoff'
  if (sameCommand(name, config.resume)) return 'resume'

  return null
}

/** What a press runs next: the resume right after a handoff, if a resume command is installed. */
export function nextKind(last: HandoffKind | null, canResume: boolean): HandoffKind {
  return canResume && last === 'handoff' ? 'resume' : 'handoff'
}

export const configKey = (config: HandoffConfig) => `${config.handoff}\n${config.resume}`

/** The configured pair as installed: each name as the command list spells it, or null. */
export function installedCommands(names: readonly string[], config: HandoffConfig): HandoffCommands {
  const find = (configured: string) =>
    names.find(n => n === configured) ?? names.find(n => sameCommand(n, configured)) ?? null

  return { key: configKey(config), handoff: find(config.handoff), resume: find(config.resume) }
}

// One check of the command list at a time.
let isChecking = false

/** Looks up which configured handoff commands this session has installed. */
async function checkCommands($: EngineInterface, config: HandoffConfig): Promise<void> {
  if (isChecking) return
  isChecking = true
  try {
    const names = (await $.command.list()).map(c => c.name)
    const found = installedCommands(names, config)
    await update($, handoffCommands, () => found)
  } catch {
    // The button stays as it was; the next turn checks again.
  } finally {
    isChecking = false
  }
}

type Action = HandoffKind | 'compact'

function confirmation(action: Action, command: string): { question: string; header: string; yes: string } {
  const yes = `Run /${command}`
  if (action === 'handoff') return { question: `Are you sure you want to hand off with /${command}?`, header: 'Handoff', yes }
  if (action === 'resume') return { question: `Are you sure you want to resume with /${command}?`, header: 'Resume', yes }

  return { question: 'Are you sure you want to compact?', header: 'Compact', yes }
}

// One confirmation at a time: a second press while it is up does nothing.
let isAsking = false

async function confirmAndRun($: EngineInterface, action: Action, command: string): Promise<void> {
  if (isAsking) return
  isAsking = true
  const { question, header, yes } = confirmation(action, command)
  let answer: string
  try {
    answer = await $.ui.ask(question, { options: [yes, 'Cancel'], header })
  } catch {
    return // dismissed
  } finally {
    isAsking = false
  }
  if (answer !== yes) return

  // Recorded first so the button flips at once; put back if the run is refused.
  const kind = action === 'compact' ? null : action
  const before = await read($, lastHandoff)
  if (kind) await update($, lastHandoff, () => kind)
  try {
    await $.command.run({ command })
    // The mod's own run skips its command.run hook, so refresh here.
    if (action === 'compact') void refresh($)
  } catch (error) {
    if (kind) await update($, lastHandoff, () => before)
    $.ui.toast(`Couldn't run /${command}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Notes a handoff command run; never throws, so the run it watches goes on. */
async function record($: EngineInterface, kind: HandoffKind | null): Promise<void> {
  if (kind === null) return
  try {
    await update($, lastHandoff, () => kind)
  } catch {
    // Losing the note only means the button guesses; the command still runs.
  }
}

export const register: Register = (on, options) => {
  const config: HandoffConfig = {
    handoff: commandName(options.handoffCommand),
    resume: commandName(options.resumeCommand),
  }

  // A typed handoff, resume or compact command. The mod's own runs skip its
  // hooks and are handled in confirmAndRun instead.
  on('command.run', async ($, e, next) => {
    await record($, kindOf(e.command, config))
    const result = await next(e)
    // Redraw with the compacted numbers. A session.compact hook would do this
    // too, but a built-in plugin that runs first can send that event past it.
    if (bare(e.command) === 'compact') void refresh($)

    return result
  })

  // The model running either one as a skill.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    await record($, kindOf(e.skill, config))

    return next(e)
  })

  on('session.start', ($, e, next) => {
    void refresh($)
    void checkCommands($, config)

    return next(e)
  })

  // The status line's own push: after each main-thread turn and on any move.
  on('session.measure', ($, e, next) => {
    if (e.changed.includes('context')) void refresh($)
    // A command added or removed mid-session shows or hides the button.
    void checkCommands($, config)

    return next(e)
  })

  // Live during a turn: after each main-loop model response.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined) void refresh($)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const snap = await read($, snapshot)
    if (snap === null) {
      void refresh($)

      return next(e)
    }

    const fill = snap.segments.reduce((sum, s) => sum + s.share, 0)
    const level = snap.percent >= 90 ? 'error' : snap.percent >= 75 ? 'warning' : undefined
    const approx = snap.isEstimate ? '~' : ''
    const label = `${approx}${snap.percent}% used`
    const figures = `${approx}${formatTokens(snap.tokens)} / ${formatTokens(snap.window)}`
    // The handoff button shows only when the handoff command is installed.
    const stored = await read($, handoffCommands)
    const commands = stored?.key === configKey(config) ? stored : null
    if (commands === null) void checkCommands($, config)
    const handoffCommand = commands?.handoff ?? null
    const resumeCommand = commands?.resume ?? null
    const kind = nextKind(await read($, lastHandoff), resumeCommand !== null)
    const runCommand = kind === 'resume' && resumeCommand !== null ? resumeCommand : handoffCommand

    // Surfaces that draw SVG get a pill of exact pixel height; the labels use
    // the footer's text size (the model and effort labels under the prompt).
    if (e.surface === 'desktop' || e.surface === 'vscode' || e.surface === 'mobile') {
      const { Box, Text, Svg, Button } = $.ui.resolve(e)
      const visible = snap.segments.filter(s => s.share > 0)
      const first = visible[0]
      const last = visible[visible.length - 1]
      const leftCap = first ? first.color : TRACK_COLOR
      const rightCap = last && fill >= 0.995 ? last.color : TRACK_COLOR

      return (
        <Box flexDirection="row" alignItems="center" gap={1} width="100%">
          <Box flexShrink={0}>
            <Text size="footnote" tabular color={level} dimColor={level === undefined}>
              {label}
            </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} width={0} flexDirection="row" alignItems="center">
            <Svg source={capSvg('left', leftCap)} alt="(" width={CAP_PX} height={BAR_PX} />
            <Box flexGrow={1} width={0} overflow="hidden">
              <Svg source={barSvg(visible)} alt={`Context window ${label}`} height={BAR_PX} />
            </Box>
            <Svg source={capSvg('right', rightCap)} alt=")" width={CAP_PX} height={BAR_PX} />
          </Box>
          <Box flexShrink={0}>
            <Text size="footnote" tabular dimColor>
              {figures}
            </Text>
          </Box>
          <Box flexShrink={0} flexDirection="row">
            {handoffCommand !== null && runCommand !== null && (
              <Button key="handoff" plain dimColor label={HANDOFF_GLYPH} onPress={() => void confirmAndRun($, kind, runCommand)} />
            )}
            <Button key="compact" plain dimColor label={COMPACT_GLYPH} onPress={() => void confirmAndRun($, 'compact', 'compact')} />
          </Box>
        </Box>
      )
    }

    // The terminal: a one-row bar of zero-width boxes that share the track by
    // flexGrow weight, so every part keeps its proportion at any width.
    const { Box, Text, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" alignItems="center" gap={1} width="100%">
        <Box flexShrink={0}>
          <Text tabular color={level} dimColor={level === undefined}>
            {label}
          </Text>
        </Box>
        <Box
          flexGrow={1}
          flexShrink={1}
          flexDirection="row"
          height={1}
          minWidth={4}
          backgroundColor={TRACK_COLOR}
          overflow="hidden"
        >
          {snap.segments.map(s => (
            <Box width={0} flexGrow={weight(s.share)} backgroundColor={s.color} />
          ))}
          <Box width={0} flexGrow={weight(Math.max(0, 1 - fill))} />
        </Box>
        <Box flexShrink={0}>
          <Text tabular dimColor>
            {figures}
          </Text>
        </Box>
        <Box flexShrink={0} flexDirection="row" gap={1}>
          {handoffCommand !== null && runCommand !== null && (
              <Button key="handoff" plain dimColor label={HANDOFF_GLYPH} onPress={() => void confirmAndRun($, kind, runCommand)} />
            )}
          <Button key="compact" plain dimColor label={COMPACT_GLYPH} onPress={() => void confirmAndRun($, 'compact', 'compact')} />
        </Box>
      </Box>
    )
  })
}
