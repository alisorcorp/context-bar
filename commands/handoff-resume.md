---
description: Resume work from a HANDOFF.md in the project root. Reads it, checks that the state hasn't drifted, summarizes where things stand, and continues from its Resume instructions.
argument-hint: "[optional: alternate path to the handoff file]"
---

Resume work from a handoff document a previous session wrote.

## 1. Find the handoff

In priority order:
- If `$ARGUMENTS` looks like a file path, read that file.
- Otherwise read `./HANDOFF.md` in the current project root.
- If neither exists, tell the user no handoff was found, and stop.

Read the **entire** document. Don't skim: Failed approaches and Key decisions are the sections most likely to bite if missed.

## 2. Check that the state hasn't drifted

**Warrant checks.** If the doc carries warrant comments (`<!-- warrant: ... -->`), check whether [warrant](https://github.com/alisorcorp/warrant) is installed (`command -v warrant`). With no warrant comments, skip to the git checks below. With comments but no warrant installed, say in the read-out that those claims are unchecked and that installing warrant would check them.

With warrant installed, run its checks first. They execute shell commands written in the document, so treat them like a Makefile from the same source:

- Start with `warrant check <handoff-file> --dry-run` and read the commands it lists. If every one is read-only (git queries, `test -f`, `grep`, `wc`, `cat`, `ls`, a test run, a `curl` that only reads), go on. If any isn't, or you can't tell, show those commands to the user and run nothing until they agree. Be strictest with a handoff someone else wrote: if the file is tracked by git (`git ls-files --error-unmatch <handoff-file>` succeeds), compare the author of its last commit (`git log -1 --format='%ae' -- <handoff-file>`) with `git config user.email`. Treat a handoff in a repository that was just cloned the same way. An untracked handoff was written on this machine.
- Then run `warrant check <handoff-file>`, adding `--against <receipt>` when a receipt with the same basename sits next to the doc (`HANDOFF.receipt.json` for `HANDOFF.md`). The comparison names exactly which claims flipped since the handoff was written.
- Read the verdicts as different things: `STALE` means the document is wrong, so surface it and don't act on that claim. `BROKEN` means nobody knows: find out why the check can't run before trusting the claim, and never treat it as a pass. `ASSERTED` is a recorded judgment call, not a verified fact.

**Git checks.** These cover what no warrant reaches, and docs with no warrants at all. Skip them when the directory isn't a git repository. Run:
- `git branch --show-current`
- `git log --oneline -10`
- `git rev-list --count <handoff-sha>..HEAD` (the SHA on the handoff's Branch line: how many commits landed since)
- `git status --short -- . ':!HANDOFF.md' ':!HANDOFF.receipt.json'` (the handoff and its receipt are expected to show as changes, so leave them out)
- `git diff --stat HEAD`

Compare the branch with the handoff's **Branch** line, the commit count with zero, and the status with its **Uncommitted changes**. Don't silently assume the handoff still holds: drift is the most common reason a handoff goes wrong. If anything drifted, add a Drift line to the read-out below and end it with the drift question instead of "Ready to continue?".

## 3. Summarize for the user

Give a tight read-out. Don't paste the whole document. Leave out any line that has nothing to say.

```
Resuming: {the H1 title, without the "Handoff:" prefix}

Goal:        {one-sentence Goal}
Completed:   {N top-level items} ✓
Remaining:   {N top-level items}
Branch:      {current} {⚠ if the branch or its HEAD changed since the handoff}
Warrants:    {N verified / N stale / N broken, counting warrant comments only} {only if warrant ran}
Drift:       {only if something drifted: e.g. "2 commits since abc1234; README.md now modified"}
Next:        {first item from Resume instructions}
Watch out:   {one line on the most recent Failed approach, only if there is one}

{"Ready to continue?", or with drift: "Should I go ahead with the handoff's plan, or reconcile first?"}
```

If the doc lists Suggested skills that this session hasn't loaded, name them in the read-out so the user can invoke them.

## 4. Heed the warnings before acting

Before writing any code or running any command toward the goal, take in:

- **Failed approaches**: dead ends the previous session already found. Don't retry any of them unless the user explicitly asks.
- **Key decisions**: the previous session's reasoning stands unless the user says to revisit it. If you're tempted to change one, ask first.
- **Current state, Broken / WIP**: match your picture to reality before touching anything.

## 5. Continue the work

Wait for the user to say go (or "continue", "ready", "yes", or similar), then act on item 1 of Resume instructions.

**Exception: resuming right after a compaction.** If this was invoked because the context was just compacted (a hook says so, or the conversation opens with a compaction summary), don't wait for a go: give the read-out, then continue with item 1 of Resume instructions straight away, so the compaction feels seamless. If HANDOFF.md is older than the compaction summary, the summary wins for anything newer; say which you're following.

Either way, if the user redirects to something else (a different ticket, a question, a new direction), follow their lead. The handoff is a starting point, not a contract.

## 6. After resuming

Don't delete or move HANDOFF.md on your own. The user decides when to remove it or commit it, depending on whether they want it in git history as a record. Leave it in place.

If the user finishes the work the handoff describes and wants to wrap up, suggest running `/handoff` again with the new state. A handoff isn't one-shot: it's for any time the user is about to step away.
