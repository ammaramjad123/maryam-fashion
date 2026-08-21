import ExcelJS from 'exceljs';

// Build .xlsx workbooks that LOOK like the printed paper sheets — full cell grid,
// merged section headers, right-aligned numbers. Every workbook is built from the
// SAME report.service response the PDF and screen use (role-filtered upstream):
// nothing here recomputes a business number.

const THIN = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const INT = '#,##0'; // negatives keep the leading minus, plain black (monochrome)
const DEC = '#,##0.00';

// Month/weekday names for the printed date strings (zone-agnostic on 'YYYY-MM-DD').
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
function longDate(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return ymd || '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAY[dt.getUTCDay()]}, ${MONTH[m - 1]} ${d}, ${y}`;
}
function ddmmyyyy(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '').slice(0, 10))) return '';
  const [y, m, d] = String(ymd).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// Write a value into a cell with a border and (for numbers) a format + right align.
function put(ws, r, c, value, { numFmt, align, bold } = {}) {
  const cell = ws.getCell(r, c);
  cell.value = value ?? null;
  cell.border = BORDER;
  if (numFmt) cell.numFmt = numFmt;
  cell.alignment = { horizontal: align || (typeof value === 'number' ? 'right' : 'left'), vertical: 'top' };
  if (bold) cell.font = { bold: true };
  return cell;
}

function a4(ws, orientation) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
}

// ---------------------------------------------------------------------------
// 1. Daily Sale & Expenses Sheet — six sections across + four-column summary.
// ---------------------------------------------------------------------------
function dailySaleWorkbook(data) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Daily Sale');
  a4(ws, 'landscape');

  const t = data.totals || {};
  const showProfit = !!(data.totals && 'totalProfit' in data.totals);
  const gw = showProfit ? 5 : 4; // PURCHASE width: Name|Qty|@|Amt(|P)
  const sw = gw + 1; // SALE width adds a Disc column: Name|Qty|@|Amt|Disc(|P)
  const nCols = sw + gw + 8;

  const sales = data.sales || [];
  const purchases = data.purchases || [];
  const receipts = data.receipts || [];
  const payments = data.payments || [];
  const expenses = data.expenses || [];
  const credit = data.creditSaleByParty || [];
  const maxRows = Math.max(
    sales.length, purchases.length, receipts.length, payments.length, expenses.length, credit.length, 1
  );
  const sum = (arr, k) => arr.reduce((s, x) => s + Number(x[k] || 0), 0);

  // --- top band ---
  ws.mergeCells(1, 1, 1, nCols);
  put(ws, 1, 1, 'Daily Sale And Expenses Sheet', { bold: true }).border = undefined;
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.mergeCells(2, 1, 2, sw + 1);
  ws.getCell(2, 1).value = `Date: ${longDate(data.date)}`;
  ws.mergeCells(2, nCols - 5, 2, nCols);
  ws.getCell(2, nCols - 5).value =
    `Opening Cash In  ${Number(data.openingCash || 0).toLocaleString('en-US')}` +
    (data.pageNo != null ? `    No. ${data.pageNo}` : '') +
    '    Page 1 of 1';
  ws.getCell(2, nCols - 5).alignment = { horizontal: 'right' };

  // --- section header row (merged) ---
  const HR = 4; // section-header row
  const sections = [
    ['S A L E', sw], ['P U R C H A S E', gw], ['Cash Receipt', 2],
    ['Cash Payment', 2], ['Shop Exp.', 2], ['Credit Sale', 2],
  ];
  let c = 1;
  for (const [title, span] of sections) {
    ws.mergeCells(HR, c, HR, c + span - 1);
    for (let cc = c; cc < c + span; cc++) ws.getCell(HR, cc).border = BORDER;
    const cell = ws.getCell(HR, c);
    cell.value = title;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center' };
    c += span;
  }

  // --- sub-header row ---
  const SH = HR + 1;
  const purSub = showProfit ? ['Name', 'Qty', '@', 'Amt', 'P'] : ['Name', 'Qty', '@', 'Amt'];
  const saleSub = showProfit
    ? ['Name', 'Qty', '@', 'Amt', 'Disc', 'P']
    : ['Name', 'Qty', '@', 'Amt', 'Disc'];
  const subs = [...saleSub, ...purSub, 'Name', 'Amt', 'Name', 'Amt', 'Name', 'Amt', 'Name', 'Amt'];
  subs.forEach((label, i) => put(ws, SH, i + 1, label, { bold: true, align: i === 0 ? 'left' : undefined }));

  // --- data rows ---
  const saleName = (l) => `${l.billNo != null ? l.billNo + ' ' : ''}${l.productCode}${l.partyName ? ' ' + l.partyName : ''}`;
  let r = SH + 1;
  for (let i = 0; i < maxRows; i++) {
    let col = 1;
    const goods = (l, nameFn, withDisc) => {
      put(ws, r, col++, l ? nameFn(l) : null);
      put(ws, r, col++, l ? Number(l.qty) : null, { numFmt: INT });
      put(ws, r, col++, l ? Number(l.rate) : null, { numFmt: INT });
      put(ws, r, col++, l ? Number(l.amount) : null, { numFmt: INT });
      if (withDisc) put(ws, r, col++, l ? Number(l.discount || 0) || null : null, { numFmt: INT });
      if (showProfit) put(ws, r, col++, l ? Number(l.profit) : null, { numFmt: INT });
    };
    const amt = (l, nameKey) => {
      put(ws, r, col++, l ? l[nameKey] : null);
      put(ws, r, col++, l ? Number(l.amount) : null, { numFmt: INT });
    };
    goods(sales[i], saleName, true);
    goods(purchases[i], (l) => `${l.productCode}${l.partyName ? ' ' + l.partyName : ''}`, false);
    amt(receipts[i], 'partyName');
    amt(payments[i], 'partyName');
    amt(expenses[i], 'headName');
    amt(credit[i], 'partyName');
    r += 1;
  }

  // --- totals row ---
  let col = 1;
  put(ws, r, col++, 'Total', { bold: true });
  put(ws, r, col++, sum(sales, 'qty'), { numFmt: INT, bold: true });
  put(ws, r, col++, null, { bold: true });
  put(ws, r, col++, Number(t.totalSale || 0), { numFmt: INT, bold: true });
  put(ws, r, col++, sum(sales, 'discount') || null, { numFmt: INT, bold: true }); // sale Disc total
  if (showProfit) put(ws, r, col++, sum(sales, 'profit'), { numFmt: INT, bold: true });
  put(ws, r, col++, null, { bold: true }); // purchase Name
  put(ws, r, col++, purchases.length ? sum(purchases, 'qty') : null, { numFmt: INT, bold: true });
  put(ws, r, col++, null, { bold: true });
  put(ws, r, col++, purchases.length ? sum(purchases, 'amount') : null, { numFmt: INT, bold: true });
  if (showProfit) put(ws, r, col++, purchases.length ? sum(purchases, 'profit') : null, { numFmt: INT, bold: true });
  put(ws, r, col++, 'Total', { bold: true });
  put(ws, r, col++, Number(t.totalReceipts || 0), { numFmt: INT, bold: true });
  put(ws, r, col++, 'Total', { bold: true });
  put(ws, r, col++, Number(t.totalPayments || 0), { numFmt: INT, bold: true });
  put(ws, r, col++, 'Total', { bold: true });
  put(ws, r, col++, Number(t.totalExpenses || 0), { numFmt: INT, bold: true });
  put(ws, r, col++, 'Total', { bold: true });
  put(ws, r, col++, Number(t.creditSale || 0), { numFmt: INT, bold: true });

  // --- four-column summary box ---
  const col1 = [
    ['Credit Sale', t.creditSale], ['Cash Sale', t.cashSale],
    ['Total Sale', t.totalSale], ['Discount on Sale', t.discountOnSale || 0],
    ['Line Discount', sum(sales, 'discount')],
  ];
  const col2 = [
    ...(showProfit ? [['Profit Sale/Pur', t.totalProfit], ['Total Profit', t.totalProfit]] : []),
    ['Total Sale Less Disc', t.totalSaleLessDisc],
  ];
  const col3 = [
    ['Opening Cash', data.openingCash], ['Cash Rec', t.totalReceipts],
    ['Cash Sale Less Disc', t.cashSaleLessDisc], ['Total Cash', t.totalCash],
  ];
  const col4 = [
    ['Total Cash', t.totalCash], ['Paid Cash', t.totalPayments],
    ['Shop Exp', t.totalExpenses], ['Net Cash', t.netCash],
  ];
  const boxTop = r + 2;
  [col1, col2, col3, col4].forEach((colRows, gi) => {
    const lc = 1 + gi * 3; // label column: A, D, G, J
    colRows.forEach(([label, value], ri) => {
      put(ws, boxTop + ri, lc, label);
      put(ws, boxTop + ri, lc + 1, Number(value || 0), { numFmt: INT });
    });
  });
  const bankRow = boxTop + 5;
  ws.getCell(bankRow, 1).value = `Total Sale Bank ${Number(t.cashSaleLessDisc || 0).toLocaleString('en-US')}`;
  ws.getCell(bankRow, 1).font = { bold: true };
  ws.getCell(bankRow, 4).value = `Total Exp ${Number(t.totalExpenses || 0).toLocaleString('en-US')}`;
  ws.getCell(bankRow, 4).font = { bold: true };
  ws.getCell(bankRow + 3, 1).value = 'Signature: ______________________';

  // column widths + freeze the header rows
  ws.getColumn(1).width = 22; // Sale Name
  ws.getColumn(sw + 1).width = 22; // Purchase Name
  for (let i = 2; i <= sw; i++) ws.getColumn(i).width = 10; // sale Qty/@/Amt/Disc(/P)
  for (let i = sw + 2; i <= sw + gw; i++) ws.getColumn(i).width = 10; // purchase cols
  for (let i = sw + gw + 1; i <= nCols; i += 2) {
    ws.getColumn(i).width = 16;
    ws.getColumn(i + 1).width = 11;
  }
  ws.views = [{ state: 'frozen', ySplit: SH }];
  return wb;
}

// ---------------------------------------------------------------------------
// A generic bordered table with a bold frozen header and an optional Total row.
// columns: [{ header, width, align, numFmt }]; rows/foot: arrays of cell values.
// ---------------------------------------------------------------------------
function tableSheet(ws, startRow, columns, rows, foot) {
  const hr = startRow;
  columns.forEach((col, i) => {
    const cell = put(ws, hr, i + 1, col.header, { bold: true, align: col.align });
    cell.alignment = { horizontal: col.align || 'left' };
    ws.getColumn(i + 1).width = col.width || 12;
  });
  let r = hr + 1;
  for (const row of rows) {
    columns.forEach((col, i) => {
      const v = row[i];
      put(ws, r, i + 1, v, { numFmt: typeof v === 'number' ? col.numFmt : undefined, align: col.align });
    });
    r += 1;
  }
  if (foot) {
    columns.forEach((col, i) => {
      const v = foot[i];
      put(ws, r, i + 1, v, { numFmt: typeof v === 'number' ? col.numFmt : undefined, align: col.align, bold: true });
    });
    r += 1;
  }
  ws.views = [{ state: 'frozen', ySplit: hr }];
  return r;
}

// ---------------------------------------------------------------------------
// 2. Daily Stock Report.
// ---------------------------------------------------------------------------
function dailyStockWorkbook(data) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Daily Stock');
  a4(ws, 'portrait');
  const t = data.totals || {};
  const showProfit = !!(data.totals && 'profit' in data.totals);

  ws.mergeCells(1, 1, 1, showProfit ? 9 : 8);
  ws.getCell(1, 1).value = `Daily Stock Report — ${ddmmyyyy(data.date) || data.date}`;
  ws.getCell(1, 1).font = { bold: true, size: 13 };

  const columns = [
    { header: 'Name', width: 12 },
    { header: 'Opening', align: 'right', numFmt: INT, width: 11 },
    { header: 'Purchase', align: 'right', numFmt: INT, width: 11 },
    { header: 'Amount', align: 'right', numFmt: INT, width: 12 },
    { header: 'Total', align: 'right', numFmt: INT, width: 11 },
    { header: 'Sale', align: 'right', numFmt: INT, width: 10 },
    { header: 'Amount', align: 'right', numFmt: INT, width: 12 },
    ...(showProfit ? [{ header: 'P', align: 'right', numFmt: INT, width: 11 }] : []),
    { header: 'Closing Stock', align: 'right', numFmt: INT, width: 14 },
  ];
  const rows = (data.rows || []).map((r) => [
    r.code, r.opening, r.purchaseQty, r.purchaseAmount, r.total, r.saleQty, r.saleAmount,
    ...(showProfit ? [r.profit] : []), r.closing,
  ]);
  // Purchase QTY stays blank (as the paper); its AMOUNT prints 0; Total column
  // = Opening + Purchase (t.total).
  const foot = [
    'Total', t.opening, null, t.purchaseAmount ?? 0, t.total, t.saleQty, t.saleAmount,
    ...(showProfit ? [t.profit] : []), t.closing,
  ];
  const end = tableSheet(ws, 3, columns, rows, data.totals ? foot : null);
  ws.getCell(end + 2, 1).value = 'Signature: ______________________';
  return wb;
}

// ---------------------------------------------------------------------------
// 3. Ledger Book — two decimals, DD/MM/YYYY, blank OP debit/credit, Total row.
// ---------------------------------------------------------------------------
function ledgerWorkbook(data) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ledger');
  a4(ws, 'portrait');

  const money2 = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bal = (b) => (!b || b.side === 'NONE' || !b.amount ? '0.00' : `${money2(b.amount)} ${b.side}`);
  const closingSigned = (b) => (!b || b.side === 'NONE' || !b.amount ? '0.00' : `${money2(b.signedBalance)} ${b.side}`);

  ws.mergeCells(1, 1, 1, 7);
  ws.getCell(1, 1).value = 'Ledger Book';
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(1, 1).alignment = { horizontal: 'center' };
  ws.getCell(2, 1).value = `Date From : ${ddmmyyyy(data.from)}    To : ${ddmmyyyy(data.to)}`;
  ws.getCell(2, 6).value = `Closing Balance  ${closingSigned(data.closing)}`;
  ws.getCell(2, 6).alignment = { horizontal: 'right' };
  ws.getCell(3, 1).value = `Party Code : ${data.party.accountCode}    Name : ${data.party.name}`;
  ws.getCell(3, 6).value = 'Page 1 of 1';
  ws.getCell(3, 6).alignment = { horizontal: 'right' };
  ws.getCell(4, 1).value = 'Contract No';
  ws.getCell(4, 1).font = { bold: true };

  const columns = [
    { header: 'Voucher No', width: 12 },
    { header: 'Type', width: 8 },
    { header: 'Date', width: 12 },
    { header: 'Narration', width: 26 },
    { header: 'Debit', align: 'right', numFmt: DEC, width: 14 },
    { header: 'Credit', align: 'right', numFmt: DEC, width: 14 },
    { header: 'Balance', align: 'right', width: 16 },
  ];
  const rows = (data.rows || []).map((r) => [
    r.voucherNo,
    r.type,
    ddmmyyyy(r.date),
    r.narration,
    r.debit == null || Number(r.debit) === 0 ? null : Number(r.debit),
    r.credit == null || Number(r.credit) === 0 ? null : Number(r.credit),
    bal(r.balance),
  ]);
  const foot = ['', '', '', 'Total', Number(data.totalDebit || 0), Number(data.totalCredit || 0), bal(data.closing)];
  const end = tableSheet(ws, 5, columns, rows, foot);
  ws.getCell(end + 2, 1).value = 'Signature: ______________________';
  return wb;
}

// ---------------------------------------------------------------------------
// 4. Cash Book — per posted day: opening + in − out = closing.
// ---------------------------------------------------------------------------
function cashBookWorkbook(data) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cash Book');
  a4(ws, 'portrait');
  ws.mergeCells(1, 1, 1, 5);
  ws.getCell(1, 1).value = `Cash Book — ${ddmmyyyy(data.from)} to ${ddmmyyyy(data.to)}`;
  ws.getCell(1, 1).font = { bold: true, size: 13 };

  const columns = [
    { header: 'Date', width: 14 },
    { header: 'Opening', align: 'right', numFmt: INT, width: 14 },
    { header: 'Cash In', align: 'right', numFmt: INT, width: 14 },
    { header: 'Cash Out', align: 'right', numFmt: INT, width: 14 },
    { header: 'Closing', align: 'right', numFmt: INT, width: 14 },
  ];
  const rows = (data.rows || []).map((r) => [ddmmyyyy(r.date), r.opening, r.cashIn, r.cashOut, r.closing]);
  const foot = ['Closing Cash', null, null, null, Number(data.closingCash || 0)];
  tableSheet(ws, 3, columns, rows, foot);
  return wb;
}

// ---------------------------------------------------------------------------
// 5. Outstanding — who owes us (Dr) / whom we owe (Cr).
// ---------------------------------------------------------------------------
function outstandingWorkbook(data) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Outstanding');
  a4(ws, 'portrait');
  const columns = [
    { header: 'Name', width: 26 },
    { header: 'Party Code', width: 14 },
    { header: 'Amount', align: 'right', numFmt: INT, width: 14 },
  ];

  ws.getCell(1, 1).value = 'Who owes us (jin se lena hai · Dr)';
  ws.getCell(1, 1).font = { bold: true, size: 12 };
  const recRows = (data.receivables || []).map((p) => [p.name, p.accountCode, p.amount]);
  let end = tableSheet(ws, 2, columns, recRows, ['Total Receivable', '', Number(data.totalReceivable || 0)]);

  ws.getCell(end + 2, 1).value = 'Whom we owe (jin ko dena hai · Cr)';
  ws.getCell(end + 2, 1).font = { bold: true, size: 12 };
  const payRows = (data.payables || []).map((p) => [p.name, p.accountCode, p.amount]);
  tableSheet(ws, end + 3, columns, payRows, ['Total Payable', '', Number(data.totalPayable || 0)]);
  return wb;
}

// ---------------------------------------------------------------------------
// 6. Position — every bank account with its Naration|Debit|Credit|Balance grid
// and a Total row, one block per account (docs/07 R9.3). Two decimals, DD/MM.
// ---------------------------------------------------------------------------
function positionWorkbook(data) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Position');
  a4(ws, 'portrait');

  const money2 = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Banks are plain running balances (a positive amount is money we have) — no Dr/Cr.
  const bal = (b) => money2(b?.signedBalance || 0);

  ws.getCell(1, 1).value = `Position — ${ddmmyyyy(data.from)} to ${ddmmyyyy(data.to)}`;
  ws.getCell(1, 1).font = { bold: true, size: 14 };

  const columns = [
    { header: 'Naration', width: 34 },
    { header: 'Debit', align: 'right', numFmt: DEC, width: 15 },
    { header: 'Credit', align: 'right', numFmt: DEC, width: 15 },
    { header: 'Balance', align: 'right', width: 17 },
  ];

  let row = 3;
  for (const acc of data.accounts || []) {
    ws.getCell(row, 1).value = acc.party.name;
    ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 4).value = `Balance  ${bal(acc.closing)}`;
    ws.getCell(row, 4).alignment = { horizontal: 'right' };
    row += 1;
    const rows = (acc.rows || []).map((r) => [
      r.narration,
      r.debit == null || Number(r.debit) === 0 ? null : Number(r.debit),
      r.credit == null || Number(r.credit) === 0 ? null : Number(r.credit),
      bal(r.balance),
    ]);
    const foot = ['Total', Number(acc.totalDebit || 0), Number(acc.totalCredit || 0), bal(acc.closing)];
    row = tableSheet(ws, row, columns, rows, foot) + 1; // blank line between accounts
  }

  // GRAND TOTAL — the sum of every bank's balance, one figure.
  row += 1;
  ws.getCell(row, 1).value = 'GRAND TOTAL (all banks)';
  ws.getCell(row, 1).font = { bold: true };
  ws.getCell(row, 4).value = bal(data.grandTotal);
  ws.getCell(row, 4).font = { bold: true };
  ws.getCell(row, 4).alignment = { horizontal: 'right' };
  for (let c = 1; c <= 4; c++) ws.getCell(row, c).border = { top: THIN, bottom: THIN };

  // tableSheet froze the last account's header; freeze nothing global for Position.
  ws.views = [];
  return wb;
}

const BUILDERS = {
  'daily-sale': dailySaleWorkbook,
  'daily-stock': dailyStockWorkbook,
  ledger: ledgerWorkbook,
  cashbook: cashBookWorkbook,
  outstanding: outstandingWorkbook,
  position: positionWorkbook,
};

// Build the workbook for `kind` from an ALREADY role-filtered report response,
// and return the .xlsx bytes as a Buffer.
export async function reportXlsxBuffer(kind, data) {
  const build = BUILDERS[kind];
  if (!build) throw new Error(`Unknown report kind: ${kind}`);
  const wb = build(data);
  return wb.xlsx.writeBuffer();
}
