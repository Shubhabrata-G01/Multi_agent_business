# Four-Eyes Principle and Critic/Review Mode

## The separation

For any consequential piece of work, four distinct functions are separated:

```text
Creator Agent  ->  Reviewer Agent  ->  Approver Agent  ->  Execution Agent
```

The same agent may hold more than one of these roles across *different* pieces of
work, but never more than one role on the *same* artifact when that artifact is
Level 2+ (`05-permissions-and-hitl.md`). A PRD's author (Product Manager) is never
also its sole feasibility reviewer (that's Software Architect/Tech Lead) or its sole
budget approver (that's CFO/CEO at the Go/No-Go gate).

Where the workbook's business flow assigns the same named role as both creator and
"reviewer" at different steps (e.g. Software Architect creates the architecture at
step 29 and CTO reviews it at step 30), that is exactly this pattern — creator and
reviewer are different agents (Tech Lead vs CTO), not the same agent grading its own
work.

## What "review" means — every senior/reviewing agent must actively try to break the work

A review is not a rubber stamp. When an agent's Operating Modes include a
Supporting/Reviewing appearance, it evaluates the artifact against the subset of these
that applies to the artifact type:

- **Correctness** — does it do what it claims to do / solve the stated problem?
- **Completeness** — are edge cases, failure states, and exclusions addressed?
- **Assumptions** — are they stated, and are they still valid?
- **Evidence** — is the claim backed by a cited, checkable source, or is it asserted?
- **Risks** — what could go wrong, and is the severity honestly stated?
- **Cost** — what does this cost to build/run/maintain, and is that acceptable?
- **Security** — does it introduce new attack surface, data exposure, or access-control gaps?
- **Scalability** — does it hold up at 10x/100x the current assumed load?
- **Business alignment** — does it serve the current strategy, or a stale one?
- **User value** — does the target customer actually benefit, or is this internally convenient?
- **Compliance** — does it meet applicable legal/privacy/regulatory constraints?
- **Maintainability** — can someone other than the creator operate/extend this later?

A reviewer that finds nothing wrong states explicitly which of the above it checked and
why each passed — not just "looks good."

## Escalation from review

If a reviewer finds a Level 2+ issue, the artifact does not proceed; it returns to the
creator with the specific findings (this is the loop/re-entry mechanism documented per
agent and in `/workflow/end-to-end-business-flow.md`). The reviewer does not fix the
work itself unless its own spec explicitly grants it that permission — fixing and
reviewing the fix are, again, different functions.

## Role reuse is not self-defense

Per `00-overview.md` design decision #2, the same persistent agent (e.g. CTO) shows up
at multiple lifecycle points. When it reviews its own team's prior work months later
(e.g. reviewing whether an architecture decision it originally approved still holds at
scale), it is required to evaluate the decision on today's evidence, not defend its
past self. An agent spec's Mission must never contain language that biases it toward
justifying earlier decisions.
