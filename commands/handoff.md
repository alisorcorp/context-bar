---
description: Write HANDOFF.md to the project root so the next session, or a teammate, can pick up where this one stopped. Run it before /compact or before closing the session.
argument-hint: "[optional: what the next session should focus on]"
---

Write a structured handoff document to **`HANDOFF.md` in the current project root** (the absolute path from `pwd`), not `/tmp`. The file is for teammates and future sessions, so it should be visible and committable.

## Optional: warrant

[warrant](https://github.com/alisorcorp/warrant) puts the command that establishes a claim next to the claim, as an HTML comment, and re-runs it on demand: `VERIFIED`, `STALE` (the claim is wrong), `BROKEN` (the check couldn't run, so nobody knows), or `ASSERTED` (deliberately unwarranted). It turns a handoff's numbers and SHAs from "trust me" into "re-check me in one step".

Check once with `command -v warrant`. Steps marked **(warrant)** apply only when it is installed. Without it, skip them and do the manual audit in "Verify before finishing". Don't write warrant comments when the tool isn't installed: you couldn't run them before finishing, and an unchecked warrant reads as verification.

## Gather context first

Run these:
- `date '+%Y-%m-%d %H:%M %Z'` (for the Generated line)
- `git branch --show-current`
- `git rev-parse --short HEAD`
- `git status --short`
- `git log --oneline -10`
- `git diff --stat HEAD` (summary of uncommitted changes)

If the directory isn't a git repository, skip the git commands, write "not a git repository" on the Branch line, and leave out Uncommitted changes.

Once written, HANDOFF.md (and its receipt, with warrant) shows up in `git status` too. Leave both out of Uncommitted changes, and out of any clean-tree claim: `git status --short -- . ':!HANDOFF.md' ':!HANDOFF.receipt.json'`.

## Structure

Use this template. Omit any section that's genuinely empty, but **never omit Failed approaches if anything was tried and abandoned this session**: that section is what a handoff carries and a compaction summary loses. If nothing was abandoned, leave it out rather than listing the existing code as a failed approach.

```markdown
# Handoff: [Brief task title]

**Generated**: [from the date command above]
**Branch**: [from git branch --show-current, with the HEAD SHA]
**Status**: [In progress / Blocked / Ready for review, as of writing. No "currently doing X": if
something was left unfinished, say what, and how the next session can tell where it stopped]

[If the project has volatile numbers the next session will rely on (test tallies, model or schema
versions, counters), put them in a small table with the command that produces each. That makes them
re-checkable in one step instead of trusted on sight, and it is where staleness shows up first.
(warrant) Where the producing command is plain shell (git, wc, grep, test -f, curl), also attach it
as an inline warrant comment on the claim's line; see the warrant rule below.]

## Goal
[1-2 sentences: what the user is ultimately trying to accomplish]

## Completed
- [x] Specific item with file path, component name, or commit hash
- [x] ...

## Not yet done
- [ ] Specific remaining work, with enough context to act on cold
- [ ] ...

## Failed approaches (don't repeat)
- What was tried, why it failed (the actual error or reason), and what the approach is instead.
- Example: "Tried `\ed4d` for the bx-list-check icon from memory. Boxicons has no glyph there, and the
  font silently drew a cloud. The real codepoint is `\eb40`, verified against the boxicons 2.1.4 CSS
  on jsDelivr."

## Key decisions
| Decision | Rationale |
|---|---|

## Current state
- **Working**: [What's functional and verified]
- **Broken / WIP**: [What isn't, with error messages where relevant]
- **Uncommitted changes**: [Summary of the staged and unstaged diff]

## Resume instructions
1. First thing the next session should do
2. ...

## Suggested skills
Skills the next session should invoke, project or global. For example:
- `frontend-design` (for any UI work in this project)
- `pdf` (for the report export)

## Reference docs (don't duplicate, point at these)
- The project's CLAUDE.md, and any memory files the session keeps
- Relevant PRDs, plans, issues, or commits, by path, URL, or SHA
```

## Rules

- **Save to `./HANDOFF.md` in the project root**, not `/tmp`. If the repo deliberately excludes it (`.gitignore`, `.git/info/exclude`), that's fine: don't fight it, just note it in the doc. Don't stage or commit it unless the user asks.
- **Regenerate the whole file. Never patch an existing HANDOFF.md.** If one exists, read it for anything worth carrying forward, then overwrite it completely. Section-by-section edits are how a handoff goes stale: the body gets updated and the title, the Status line, and the "in progress" claims do not.
- **Re-run every volatile fact while writing; never recall it.** SHAs, branch, test and assertion counts, versions, page counts, pass/fail tallies. Anything carried forward from earlier in the session is a memory, and memories go stale mid-session. Where a number matters, put the command that produced it next to it so the next session can re-check it in one step.
- **(warrant) Warrant every claim a shell command can re-check.** Any claim that could go false without this file being edited gets an inline `<!-- warrant: run="..." contains="..." -->` on its line: branch and SHA claims, clean-tree claims, line counts, referenced paths (`test -f path && echo present`), live web facts (a redirect or a robots.txt rule, through `curl | grep`). Numbers that come from an MCP tool or a web API that needs credentials can't be shell-warranted; for those, the re-check column in the table is the warrant, so don't fake one. Never write a warrant whose command restates the claim (`run="echo 36" contains="36"` reads as verification and checks nothing, which is worse than no warrant). Use `<!-- warrant: none reason="..." -->` to mark a judgment call as deliberately unwarranted. Keep every warrant command read-only: `warrant check` executes them, and so may the next reader's tooling.
- **No expiring language.** A handoff is read hours or days later, so "currently running", "in flight", "about to", and "waiting on" are false by the time anyone reads them. Write the end state, or say explicitly what was left unfinished and how to tell.
- **If a commit message in the recent log is now wrong or superseded, say so.** `git log` is the first thing a cold session trusts, and a retracted claim in a commit message will be believed.
- **Don't duplicate.** Reference existing artifacts (memory files, commits, PRs, PRDs) by path or SHA instead of restating them.
- **Redact** API keys, passwords, tokens, and personal data.
- If `$ARGUMENTS` is given, treat it as the focus for the next session and tailor Goal and Resume instructions to it.
- Keep the doc dense but skimmable. A teammate or a fresh session should be able to act on it cold after two minutes of reading.

## Verify before finishing

Don't skip this: it is the difference between a handoff and a guess. After writing the file, audit it against reality. A handoff that is confidently wrong is worse than a short one, because the next session acts on it without re-checking.

1. **Expiring language**: `grep -niE "in flight|is running|currently|about to|waiting on|not yet launched|TBD" HANDOFF.md`. Every hit must be a negation ("nothing in flight") or a quotation; rewrite anything else. No tool checks prose tense, so this stays manual.
2. **(warrant) Warranted claims**: `warrant check HANDOFF.md` must exit 0. `STALE` means the document is wrong: fix the doc, not the check, unless the check itself was mis-written. `BROKEN` means you don't know: fix the check before relying on that claim. Report the verified count, and how many rot-prone lines still carry no warrant (`warrant audit HANDOFF.md`): an all-verified result says nothing about the unwarranted rest.
3. **Without warrant, audit by hand**: confirm every referenced path exists, run `git cat-file -e <sha>^{commit}` for each commit you cite, and re-run the command behind each number.
4. **Claims no shell command reaches** (numbers from an MCP tool or an API, state in another system): re-run the producing tool call now. If you can't re-run it cheaply, drop the number or label it as unverified. Never pass off a recalled figure as a measured one.
5. **Your own measurement**: if a number surprises you, suspect the measuring command before you "correct" the document. Prefer the purpose-built tool (`pdfinfo`, the test runner's own summary) over an ad hoc `grep -c`.

Sum up the audit in one line for the final message below. If it found nothing, say so: a clean audit that actually ran is information, and a skipped one is not.

**(warrant)** Then record a receipt next to the doc, with the same basename: `warrant receipt HANDOFF.md -o HANDOFF.receipt.json` (for `handoff-api.md`, write `handoff-api.receipt.json`). The next session's `warrant check --against` names exactly which claims flipped since writing. The receipt shares the doc's gitignore status.

## Update long-term memory (if the session has it)

HANDOFF.md is point-in-time: the next session reads it once and moves on. If this session keeps a memory directory (Claude Code's auto memory, which the system prompt names when it's on), also record the session's lasting lessons there. If it doesn't, skip this section.

1. Write or update topic files in that directory, matching the format of the files already there, and add or update the index entry the memory instructions describe.
2. Capture only what a future session would want surfaced fast: hard-won gotchas, setup traps, reversed decisions, "we tried X and it failed because Y". Don't dump the session or restate the project's CLAUDE.md; point at CLAUDE.md or HANDOFF.md for detail. Prefer updating an existing topic file over writing a near-duplicate.
3. If nothing from this session outlasts the handoff (purely mechanical work), skip it and say so rather than writing filler.

## After writing

Print exactly this message, with the file's real absolute path and the audit line:

```
HANDOFF.md written to {absolute path of the file}
Audit: {one line, e.g. "12 verified, 0 stale, 0 broken; 5 rot-prone lines unwarranted" or "manual: 6 paths, 2 commits, 3 numbers re-checked"}

Now run `/compact` to free context for the next session, or close this window.
The next session can run `/handoff-resume` or just read HANDOFF.md directly.
```
