import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { SessionContextBreakdown, SessionUsage } from 'claude-code'

import { barSvg, capSvg, commandName, formatTokens, installedCommands, kindOf, nextKind, toRawColor, toSnapshot } from '../hooks/register'

const BAND = {
  plugin: 'context-bar',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

const cat = (
  name: string,
  tokens: number,
  color: string,
  kind: 'used' | 'free' | 'buffer' | 'deferred' = 'used',
) => ({ name, tokens, color, kind, isDeferred: kind === 'deferred' })

const BREAKDOWN: SessionContextBreakdown = {
  categories: [
    cat('System prompt', 20_000, 'promptBorder'),
    cat('System tools', 30_000, 'inactive'),
    cat('MCP tools', 5_000, 'permission', 'deferred'),
    cat('Messages', 430_000, 'claude'),
    cat('Free space', 487_000, 'subtle', 'free'),
    cat('Autocompact buffer', 33_000, 'inactive', 'buffer'),
  ],
  totalTokens: 480_000,
  maxTokens: 1_000_000,
  rawMaxTokens: 1_000_000,
  autocompactSource: 'model-default',
  percentage: 48,
  gridRows: [],
  model: 'claude-opus-5-5',
  memoryFiles: [],
  mcpTools: [],
  agents: [],
  autoCompactThreshold: 967_000,
  isAutoCompactEnabled: true,
  apiUsage: null,
}

const USAGE: SessionUsage = {
  startedAt: 0,
  context: { tokens: 478_900, window: 1_000_000, percent: 48, breakdown: BREAKDOWN },
  rateLimits: [],
}

test('token counts read like the status line', () => {
  expect(formatTokens(478_900)).toBe('478.9k')
  expect(formatTokens(200_000)).toBe('200k')
  expect(formatTokens(1_000_000)).toBe('1M')
  expect(formatTokens(1_250_000)).toBe('1.3M')
  expect(formatTokens(812)).toBe('812')
})

test('the fill follows the status line and splits it by category', () => {
  const snap = toSnapshot(USAGE.context, BREAKDOWN)
  if (snap === null) throw new Error('no snapshot')

  expect(snap.percent).toBe(48)
  expect(snap.isEstimate).toBe(false)
  // Deferred, free and buffer rows are not part of the fill.
  expect(snap.segments.map(s => s.name)).toEqual(['System prompt', 'System tools', 'Messages'])
  const fill = snap.segments.reduce((sum, s) => sum + s.share, 0)
  expect(Math.abs(fill - 0.4789) < 1e-9).toBe(true)
})

test('the drawn bar stretches its segments and keeps raw colors only', () => {
  const svg = barSvg([
    { color: 'promptBorder', share: 0.25 },
    { color: 'purple_FOR_SUBAGENTS_ONLY', share: 0.25 },
  ])
  expect(svg.includes('preserveAspectRatio="none"')).toBe(true)
  expect(svg.includes('fill="#312f3e"')).toBe(true)
  expect(svg.includes('<rect x="0.00" width="250.00" height="10" fill="#b4b4b4"/>')).toBe(true)
  expect(svg.includes('<rect x="250.00" width="250.00" height="10" fill="#827dbd"/>')).toBe(true)
  expect(capSvg('left', 'claude').includes('fill="#c15f3c"')).toBe(true)
  // Nothing outside a color reaches the markup.
  expect(toRawColor('"/><script>')).toBe('#9a9a9a')
  expect(toRawColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)')
})

test('a fresh window falls back to the estimate, and a missing breakdown to one segment', () => {
  const fresh = toSnapshot({ window: 200_000 }, { ...BREAKDOWN, totalTokens: 18_000 })
  expect(fresh?.isEstimate).toBe(true)
  expect(fresh?.tokens).toBe(18_000)
  expect(fresh?.percent).toBe(9)

  const plain = toSnapshot({ tokens: 50_000, window: 200_000, percent: 25 }, undefined)
  expect(plain?.segments.length).toBe(1)
  expect(plain?.segments[0]?.share).toBe(0.25)

  expect(toSnapshot({ window: 200_000 }, undefined)).toBe(null)
  expect(toSnapshot({ tokens: 10, window: 0 }, undefined)).toBe(null)
})

test('the band shows percent and tokens on every surface it is raised on', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /used/ }))?.text).toBe('48% used')
    expect((await ui.find({ type: 'Text', text: /\// }))?.text).toBe('478.9k / 1M')
    await ui.unmount()
  }
})

test('the band yields to a survey', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, hasSurvey: true },
    surface: 'desktop',
  })

  expect(await ui.find({ type: 'Text', text: /used/ })).toBe(undefined)
  await ui.unmount()
})

const DEFAULTS = { handoff: 'handoff', resume: 'handoff-resume' }

test('the configured pair is read, matched and alternated', () => {
  expect(commandName(' /handoff ')).toBe('handoff')
  expect(commandName(undefined)).toBe('')

  expect(kindOf('handoff', DEFAULTS)).toBe('handoff')
  expect(kindOf('/handoff-resume', DEFAULTS)).toBe('resume')
  expect(kindOf('mine:handoff', DEFAULTS)).toBe('handoff')
  expect(kindOf('compact', DEFAULTS)).toBe(null)
  expect(kindOf('handoff', { handoff: '', resume: '' })).toBe(null)

  expect(nextKind(null, true)).toBe('handoff')
  expect(nextKind('handoff', true)).toBe('resume')
  expect(nextKind('resume', true)).toBe('handoff')
  // No resume command installed: always the handoff.
  expect(nextKind('handoff', false)).toBe('handoff')

  const found = installedCommands(['compact', 'mine:handoff', 'handoff-resume'], DEFAULTS)
  expect(found.handoff).toBe('mine:handoff')
  expect(found.resume).toBe('handoff-resume')
  expect(installedCommands(['compact'], DEFAULTS).handoff).toBe(null)
})

/** Stands for the engine: usage, the command list, the person's answer, and the runs. */
function engine(on: Parameters<TestBody>[1], commands: string[], answer: 'yes' | 'Cancel') {
  const ran: string[] = []
  on('session.usage', () => ({ value: USAGE }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.list', () => ({ value: commands.map(name => ({ name, description: '', source: 'user' as const })) }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
    const q = e.questions[0]
    const label = answer === 'yes' ? (q?.options[0]?.label ?? '') : 'Cancel'

    return { result: { questions: e.questions, answers: { [q?.question ?? '']: label } } }
  })
  on('command.run', (_, e) => {
    ran.push(e.command)

    return { text: '' }
  })

  return ran
}

const start = ($: Parameters<TestBody>[0]) =>
  $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

test('a confirmed press runs the command and alternates the handoff pair', async ($, on) => {
  const ran = engine(on, ['compact', 'handoff', 'handoff-resume'], 'yes')
  await start($)

  // The glyphs are the labels on every surface: the desktop draws the label.
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ key: 'handoff' }))?.props.label).toBe('\u21C6')
    expect((await ui.find({ key: 'compact' }))?.props.label).toBe('\u21E5\u21E4')
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'handoff' })
  await ui.press({ key: 'compact' })
  await ui.press({ key: 'handoff' })
  await ui.press({ key: 'handoff' })
  expect(ran).toEqual(['handoff', 'compact', 'handoff-resume', 'handoff'])
  await ui.unmount()
})

test('a cancelled press runs nothing', async ($, on) => {
  const ran = engine(on, ['compact', 'handoff', 'handoff-resume'], 'Cancel')
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'compact' })
  await ui.press({ key: 'handoff' })
  expect(ran).toEqual([])
  await ui.unmount()
})

test('without the handoff command installed, only the compact button shows', async ($, on) => {
  engine(on, ['compact'], 'yes')
  await start($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ key: 'handoff' })).toBe(undefined)
    expect((await ui.find({ key: 'compact' }))?.props.label).toBe('\u21E5\u21E4')
    await ui.unmount()
  }
})

test('an empty handoff setting hides the button', { options: { handoffCommand: '' } }, async ($, on) => {
  engine(on, ['compact', 'handoff', 'handoff-resume'], 'yes')
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'handoff' })).toBe(undefined)
  await ui.unmount()
})

test(
  'a custom command with no resume runs the same command each time',
  { options: { handoffCommand: '/wrapup', resumeCommand: '' } },
  async ($, on) => {
    const ran = engine(on, ['compact', 'wrapup', 'handoff-resume'], 'yes')
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await ui.press({ key: 'handoff' })
    await ui.press({ key: 'handoff' })
    expect(ran).toEqual(['wrapup', 'wrapup'])
    await ui.unmount()
  },
)

test('a plugin\'s command is run by the name the command list gives it', async ($, on) => {
  const ran = engine(on, ['compact', 'mine:handoff'], 'yes')
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'handoff' })
  await ui.press({ key: 'handoff' })
  expect(ran).toEqual(['mine:handoff', 'mine:handoff'])
  await ui.unmount()
})

test('the commands the mod ships are found and run by their namespaced names', async ($, on) => {
  const ran = engine(on, ['compact', 'context-bar:handoff', 'context-bar:handoff-resume'], 'yes')
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'handoff' })
  await ui.press({ key: 'handoff' })
  expect(ran).toEqual(['context-bar:handoff', 'context-bar:handoff-resume'])
  await ui.unmount()
})

/** A window just compacted: no response yet, so the bar shows the local estimate. */
const COMPACTED: SessionUsage = {
  startedAt: 0,
  context: { window: 1_000_000, breakdown: { ...BREAKDOWN, totalTokens: 52_000 } },
  rateLimits: [],
}

/** Stands for the engine, switching the usage it reports once /compact has run. */
function compactingEngine(on: Parameters<TestBody>[1]) {
  let isCompacted = false
  on('session.usage', () => ({ value: isCompacted ? COMPACTED : USAGE }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.list', () => ({ value: [{ name: 'compact', description: '', source: 'builtin' as const }] }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
    const q = e.questions[0]

    return { result: { questions: e.questions, answers: { [q?.question ?? '']: q?.options[0]?.label ?? '' } } }
  })
  on('command.run', (_, e) => {
    if (e.command === 'compact') isCompacted = true

    return { text: '' }
  })
}

test('the bar redraws with the compacted numbers after the compact button', async ($, on) => {
  compactingEngine(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /used/ }))?.text).toBe('48% used')
  await ui.press({ key: 'compact' })
  expect((await ui.find({ type: 'Text', text: /used/ }))?.text).toBe('~5% used')
  expect((await ui.find({ type: 'Text', text: /\// }))?.text).toBe('~52k / 1M')
  await ui.unmount()
})

test('the bar redraws after a typed /compact', async ($, on) => {
  compactingEngine(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /used/ }))?.text).toBe('48% used')
  await $.command.run({ command: 'compact', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  await ui.unmount()
  const after = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await after.find({ type: 'Text', text: /used/ }))?.text).toBe('~5% used')
  await after.unmount()
})
