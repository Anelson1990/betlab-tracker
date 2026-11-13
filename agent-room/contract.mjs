// Agent Room — the board's content contract, mirrored from the DB CHECK
// constraints on room.turn (switchboard-sandbox, read 2026-11-13). Keep in sync
// with the schema so the app-side guard matches what the DB will accept.
//   turn_kind_check : propose|question|ack|decide|review|working|pass|delegate|system
//   turn_tag_check  : continue|working|needs_austin|done|pass
//   turn_body_check : 1..8000 chars

export const ALL_KINDS = ["propose", "question", "ack", "decide", "review", "working", "pass", "delegate", "system"];
// Kinds a BOT seat may post: the DB list minus `decide` (chair only) and `system` (conductor only).
export const BOT_KINDS = ["propose", "question", "ack", "review", "working", "pass", "delegate"];
export const VALID_TAGS = ["continue", "working", "needs_austin", "done", "pass"];
export const BODY_MAX = 8000;

const BOT_KIND_SET = new Set(BOT_KINDS);
const TAG_SET = new Set(VALID_TAGS);

// Normalize to a valid BOT kind. Anything else — decide, system, admin, a blank,
// mixed case, or a unicode look-alike (non-[a-z]) — becomes "propose" rather than
// being passed through to throw at the DB.
export function botKind(raw) {
  const k = String(raw == null ? "" : raw).trim().toLowerCase();
  return /^[a-z]+$/.test(k) && BOT_KIND_SET.has(k) ? k : "propose";
}

// Normalize to a valid tag, else null (case-insensitive; unicode look-alikes rejected).
export function validTag(raw) {
  if (raw == null || raw === "") return null;
  const t = String(raw).trim().toLowerCase();
  return /^[a-z_]+$/.test(t) && TAG_SET.has(t) ? t : null;
}

// Trim and clamp a body to the DB max, counting by code points (so a truncation
// never splits a surrogate pair). Returns "" if empty.
export function clampBody(raw) {
  const b = (raw == null ? "" : String(raw)).trim();
  const cps = Array.from(b);
  return cps.length > BODY_MAX ? cps.slice(0, BODY_MAX).join("") : b;
}

// Receipt length limit — LOCKED at 500 to match P1f's DB receipt check
// (confirmed by Harper's approval of 19dfbde). Over-limit is refused, not cut.
export const RECEIPT_MAX = 500;
// Clean a receipt: trim, and treat whitespace-only (or null/undefined) as "no
// receipt" (-> null). It does NOT truncate: an over-length receipt is REFUSED
// at validateTurn (fail closed), never silently cut, so evidence is never
// quietly mangled. (Harper's fix — "cap it at 500 and refuse, don't clamp".)
export function cleanReceipt(raw) {
  const r = (raw == null ? "" : String(raw)).trim();
  return r === "" ? null : r;
}
// True if a receipt is over the DB/contract limit — the refusal condition.
export function receiptTooLong(raw) {
  return raw != null && Array.from(String(raw)).length > RECEIPT_MAX;
}

// The only seats that may flag review_ready (with a receipt). Hardcoded — not a
// per-call option — so it can't be widened in production. The DB (P1f) enforces
// the same: review_ready needs a seated builder + a non-empty receipt.
export const BUILDER_SEATS = ["claude"];
