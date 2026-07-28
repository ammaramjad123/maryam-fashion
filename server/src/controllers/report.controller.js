import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { assertValidDate } from '../validators/daybook.validator.js';
import { karachiDay } from '../utils/shopDate.js';
import env from '../config/env.js';
import * as reportService from '../services/report.service.js';
import { renderReportPdf } from '../services/pdf.service.js';
import { reportXlsxBuffer } from '../services/excel.service.js';
import { filterForUser } from '../middleware/profitFilter.js';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Build the workbook from the SAME report response the screen/PDF use, applying
// the SAME role filter (an operator's .xlsx has no profit/costRate/P column).
async function sendXlsx(req, res, kind, data, filename) {
  const buf = await reportXlsxBuffer(kind, filterForUser(req, data));
  res.setHeader('Content-Type', XLSX_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buf.length);
  res.end(buf);
}

// Render the matching /print page to PDF and stream it back as a download.
function pdfHandler(printPath, filename) {
  return asyncHandler(async (req, res) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const baseUrl = env.printBaseUrl || `${req.protocol}://${req.get('host')}`;
    const pdf = await renderReportPdf({ baseUrl, printPath, token });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  });
}

export const dailySale = asyncHandler(async (req, res) => {
  assertValidDate(req.query.date);
  res.json({ success: true, data: await reportService.getDailySale(req.query.date) });
});

export const dailyStock = asyncHandler(async (req, res) => {
  assertValidDate(req.query.date);
  res.json({ success: true, data: await reportService.getDailyStock(req.query.date) });
});

export const ledger = asyncHandler(async (req, res) => {
  const { partyId } = req.query;
  if (!partyId) throw ApiError.badRequest('partyId is required');
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || karachiDay(new Date());
  assertValidDate(from);
  assertValidDate(to);
  res.json({ success: true, data: await reportService.getLedger(partyId, from, to) });
});

export const cashbook = asyncHandler(async (req, res) => {
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || karachiDay(new Date());
  assertValidDate(from);
  assertValidDate(to);
  res.json({ success: true, data: await reportService.getCashBook(from, to) });
});

export const outstanding = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await reportService.getOutstanding() });
});

// Position — all bank accounts, their balances and history over a range.
export const position = asyncHandler(async (req, res) => {
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || karachiDay(new Date());
  assertValidDate(from);
  assertValidDate(to);
  res.json({ success: true, data: await reportService.getPosition(from, to) });
});

// Profit report — the route gates this on the viewProfit permission (403 otherwise).
export const profit = asyncHandler(async (req, res) => {
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || karachiDay(new Date());
  assertValidDate(from);
  assertValidDate(to);
  res.json({ success: true, data: await reportService.getProfitReport(from, to) });
});

// --- PDF variants: render the same report /print page via headless Chrome ---

export const dailySalePdf = asyncHandler(async (req, res) => {
  assertValidDate(req.query.date);
  const d = req.query.date;
  return pdfHandler(`/print/daily-sale?date=${d}`, `daily-sale-${d}.pdf`)(req, res);
});

export const dailyStockPdf = asyncHandler(async (req, res) => {
  assertValidDate(req.query.date);
  const d = req.query.date;
  return pdfHandler(`/print/daily-stock?date=${d}`, `daily-stock-${d}.pdf`)(req, res);
});

export const ledgerPdf = asyncHandler(async (req, res) => {
  const { partyId } = req.query;
  if (!partyId) throw ApiError.badRequest('partyId is required');
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || karachiDay(new Date());
  assertValidDate(from);
  assertValidDate(to);
  const path = `/print/ledger?partyId=${partyId}&from=${from}&to=${to}`;
  return pdfHandler(path, `ledger-${partyId}-${from}_${to}.pdf`)(req, res);
});

export const cashbookPdf = asyncHandler(async (req, res) => {
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || karachiDay(new Date());
  assertValidDate(from);
  assertValidDate(to);
  return pdfHandler(`/print/cashbook?from=${from}&to=${to}`, `cashbook-${from}_${to}.pdf`)(
    req,
    res
  );
});

export const outstandingPdf = asyncHandler(async (req, res) =>
  pdfHandler('/print/outstanding', 'outstanding.pdf')(req, res)
);

export const positionPdf = asyncHandler(async (req, res) => {
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || karachiDay(new Date());
  assertValidDate(from);
  assertValidDate(to);
  return pdfHandler(`/print/position?from=${from}&to=${to}`, `position-${from}_${to}.pdf`)(req, res);
});

// --- XLSX variants: build a formatted workbook from the same report data ------

export const dailySaleXlsx = asyncHandler(async (req, res) => {
  assertValidDate(req.query.date);
  const d = req.query.date;
  await sendXlsx(req, res, 'daily-sale', await reportService.getDailySale(d), `daily-sale-${d}.xlsx`);
});

export const dailyStockXlsx = asyncHandler(async (req, res) => {
  assertValidDate(req.query.date);
  const d = req.query.date;
  await sendXlsx(req, res, 'daily-stock', await reportService.getDailyStock(d), `daily-stock-${d}.xlsx`);
});

export const ledgerXlsx = asyncHandler(async (req, res) => {
  const { partyId } = req.query;
  if (!partyId) throw ApiError.badRequest('partyId is required');
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || karachiDay(new Date());
  assertValidDate(from);
  assertValidDate(to);
  const data = await reportService.getLedger(partyId, from, to);
  await sendXlsx(req, res, 'ledger', data, `ledger-${partyId}-${from}_${to}.xlsx`);
});

export const cashbookXlsx = asyncHandler(async (req, res) => {
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || karachiDay(new Date());
  assertValidDate(from);
  assertValidDate(to);
  await sendXlsx(req, res, 'cashbook', await reportService.getCashBook(from, to), `cashbook-${from}_${to}.xlsx`);
});

export const outstandingXlsx = asyncHandler(async (req, res) =>
  sendXlsx(req, res, 'outstanding', await reportService.getOutstanding(), 'outstanding.xlsx')
);

export const positionXlsx = asyncHandler(async (req, res) => {
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || karachiDay(new Date());
  assertValidDate(from);
  assertValidDate(to);
  await sendXlsx(req, res, 'position', await reportService.getPosition(from, to), `position-${from}_${to}.xlsx`);
});
