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

// Receipt length limit — kept in sync with P1f's DB receipt check. Used by both
// the seat-route guard and the conductor's normalizeTurn so the two agree.
export const RECEIPT_MAX = 500;
export function clampReceipt(raw) {
  const r = (raw == null ? "" : String(raw)).trim();
  const cps = Array.from(r);
  return cps.length > RECEIPT_MAX ? cps.slice(0, RECEIPT_MAX).join("") : r;
}

// The only seats that may flag review_ready (with a receipt). Hardcoded — not a
// per-call option — so it can't be widened in production. The DB (P1f) enforces
// the same: review_ready needs a seated builder + a non-empty receipt.
export const BUILDER_SEATS = ["claude"];
