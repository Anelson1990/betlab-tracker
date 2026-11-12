---
name: ai-slop-review
description: Review AI-generated code or content for the real tells of machine-generated "slop" — over-engineering, hallucinated/unverified APIs, placeholder leftovers, fake robustness, ignored conventions, duplicated logic, invented facts or sources — while deliberately NOT flagging correct-but-ugly patterns or chasing a lint score. Use when reviewing AI-written code or proposals, when a change "looks done but feels off," or as the reviewer step in a builder-reviewer loop.
---

# AI-Slop Review

AI output often *looks* finished while hiding machine-generated tells. This skill is the reviewer that separates **real problems** from **cosmetic noise** — it flags what actually hurts, and it explicitly refuses to flag things that only *look* sloppy but are correct.

Read the target (diff, file, or proposal), then judge each finding against the two lists below. Every flag needs concrete evidence (file:line or a quote) and a one-line "why it matters." No evidence → not a finding.

## Flag these — real slop

1. **Hallucinated / unverified surface.** APIs, flags, imports, config keys, or library methods that may not exist. *Verify against the real docs/source before trusting them* — this is the #1 AI tell.
2. **Invented facts, stats, or sources.** Numbers, citations, or quotes presented as fact without a real source. (Matches the house rule: never state guesses as facts.)
3. **Placeholder left in, passed off as done.** `TODO`, `example.com`, lorem text, stubbed returns, `throw new Error("not implemented")`, or a function that returns a hard-coded value where real logic belongs.
4. **Fake robustness / security theater.** Empty `catch {}` that swallows errors silently, "validation" that validates nothing, a "sanitize" that doesn't, auth checks that always pass, retries with no backoff. Looks safe, isn't.
5. **Over-engineering / speculative generality.** Abstractions, options, interfaces, or config built for callers that don't exist. One caller doesn't need a plugin system.
6. **Ignored conventions.** Re-implements what the codebase already has, or breaks the surrounding style/naming/patterns, instead of using the existing helper. (Check for the existing utility first.)
7. **Duplicated logic.** The same thing written twice because the model didn't look for the existing version.
8. **Narrating comments.** Comments that restate the code (`// loop over users`) instead of explaining *why*. Delete, don't keep.
9. **Tests that assert nothing.** Tests that exercise a mock, assert `true`, or never run the real path — green but worthless.
10. **Padding.** Verbose output, hedging, or restated requirements that add length without information.

## Do NOT flag these — correct, just not pretty (the part most reviewers get wrong)

- **A broad `catch {}` in genuinely best-effort code** — shutdown, cleanup, fire-and-forget. A cleanup path that rethrows stops the rest of cleanup; that's *worse*. Swallowing is correct there.
- **Terse code that is right.** Short ≠ sloppy. Don't demand comments or expansion on code that's already clear.
- **Established idioms** of the language/framework, even if a linter dislikes them.
- **Intentional narrow shortcuts** the author flagged as deliberate.
- **Anything added only to satisfy a linter** — don't drive changes that trade real correctness for a cleaner score. **Don't chase a number; fix patterns, accept correct-but-ugly.**

When you choose *not* to flag something that looks sloppy, say so briefly — "left X as-is: correct for best-effort cleanup." That's as valuable as a finding.

## Output

Group findings by severity (blocking / worth-fixing / optional), each with `file:line` or a quote, the category above, and one line on impact. End with a short **"deliberately not flagged"** list so the author sees you considered them. If nothing real is found, say so plainly — do not manufacture findings to look thorough.

## Pairs with

Use as the **reviewer** in a builder-reviewer loop (builder ≠ reviewer, so no seat grades its own work). It complements `code-review` (correctness bugs) and `security-review` (vulnerabilities): this one targets the *machine-generated* quality tells those can miss.

---
*Credit: the "fix vs. don't-fix / don't chase the number" framing is distilled from gstack's slop-scan (MIT, Garry Tan). Written fresh here — no gstack code or runtime; self-contained. — Claude~*
