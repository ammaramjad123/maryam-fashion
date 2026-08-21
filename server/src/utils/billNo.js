// Bill numbers are per-BILL, not per-line (docs/07 R9.1, verified on the real
// 24/07 sheet). A "bill" is:
//   • a CASH sale line (no party) — its own bill, so it shows a number; or
//   • a run of CONSECUTIVE sale lines for the SAME credit party — ONE bill, whose
//     number appears only on the FIRST row; the rest are blank.
//
// isBillStart decides whether a line begins a new bill (relative to the line
// above it). partyId may be an ObjectId or string; compare as strings.
//   • sameBill = the operator explicitly joined this line to the bill above
//     (works for cash lines too — the manual grouping control, docs/07 R9.1).
//   • otherwise a cash line is its own bill, and a credit line continues only
//     while the party is unchanged.
export function isBillStart(line, prevLine) {
  if (!line) return true;
  if (!prevLine) return true; // first line of the section
  if (line.sameBill) return false; // explicit: continue the bill above (any/no party)
  if (!line.partyId) return true; // cash line → its own bill
  return String(prevLine.partyId || '') !== String(line.partyId); // party changed → new bill
}

// Given the ordered sale lines, return the bill number to DISPLAY per row:
// the line's own billNo on a bill-start row, blank (null) on a continuation row.
// Works whatever the stored data looks like, so print/PDF/Excel always match the
// paper (number only on the first row of each bill).
export function displayBillNos(sales = []) {
  return sales.map((l, i) => (isBillStart(l, sales[i - 1]) ? (l.billNo ?? null) : null));
}
