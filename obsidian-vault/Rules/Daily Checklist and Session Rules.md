---
tags: [rule, checklist]
---
# 📋 Daily Checklist & Session Rules

## Morning protocol (when Nelson says "good morning")
1. Check date/time with user_time_v0
2. Confirm today's date and slate
3. Check overnight results still pending
4. Confirm bankroll
5. Fetch `KNOWLEDGE.md` from GitHub
6. Begin checklist

## When models are dropped
1. Fetch `KNOWLEDGE.md` first
2. Run 12-step checklist applying all rules
3. Deep dive top POTD candidates
4. Verify lineups on MLB.com before any pick
5. Build card JSON
6. End of session: update `data.js` + `KNOWLEDGE.md` + push

## Step 3.5 — Bullpen Check (added)
After confirming ML picks:
- Check rotowire.com/baseball/closers.php for any parlay team
- Flag any team with closer on IL or committee situation
- Check if starter expected to go deep or need bullpen early

See [[Bullpen Rules]].

## Step 7 — POTD Deep Dive (enhanced)
For top 2 POTD candidates:
- Pull last 5 starts from MLB.com gamelog
- Check TTO splits (2nd time through OPS)
- Verify starter on MLB.com same day before confirming
- Check team last 7 days W-L record at home/away

See [[POTD Rules]], [[Pitcher Research Framework]].

## Step 8 — Hit Props (enhanced)
Before building parlay:
1. Model output only — no memory additions
2. MLB.com lineup confirmed
3. Savant xBA + xwOBA + exit velo pulled
4. Handedness split confirmed positive
5. Pitcher matchup researched

See [[Hit Prop Rules]].

## End of session push
1. Add completed card to SEED_CARDS in `data.js`
2. Update SEED_MODELS with latest ROI numbers
3. Add today's sharp picks to SEED_SHARP with results
4. Update TODAY_CARD with next day's picks if built
5. Add new lessons to `KNOWLEDGE.md`
6. One GitHub push covers everything

As of [[2026-06-22]], `data.js` was split into `today.js` (full replace daily) + `cards.js` +
`sharp.js` + `models.js` (append only) — no more orphaned blocks possible.

**Also do:** add/update the matching `Daily/YYYY-MM-DD.md` note in this vault (see
`Templates/Daily Session.md`) and update any `Rules/*.md` note whose rule actually changed.

## Related
- [[Daily Sources]]
