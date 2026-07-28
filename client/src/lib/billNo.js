// Bill numbers are per-BILL, not per-line (docs/07 R9.1). A bill is a cash sale
// line (own bill), or a run of consecutive sale lines for the SAME credit party
// (one bill, number on the first row only). Mirrors server/src/utils/billNo.js.
export function isBillStart(line, prevLine) {
  if (!line || !line.partyId) return true; // cash line → its own bill
  if (!prevLine) return true; // first line
  return String(prevLine.partyId || '') !== String(line.partyId); // party changed → new bill
}

// Auto-assign bill numbers per BILL, continuing from `base` (the next number
// after the last posted day). Returns an array aligned to `sales`: the effective
// number on each bill-start row (an operator override if typed, else the next
// auto number), and null on continuation rows and non-product rows. An override
// carries the sequence forward from it, so subsequent auto numbers follow on.
export function assignBillNos(sales, base) {
  let n = Number(base) || 1;
  return sales.map((r, i) => {
    if (!r || !r.productId) return null; // blank/unfilled row
    if (!isBillStart(r, sales[i - 1])) return null; // continuation → blank
    const typed = r.billNo === '' || r.billNo == null ? NaN : Number(r.billNo);
    const eff = Number.isNaN(typed) ? n : typed; // override wins
    n = eff + 1;
    return eff;
  });
}
