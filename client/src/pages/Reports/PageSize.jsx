// Declares the @page size for a report. This is the SINGLE source of paper
// orientation: Ctrl+P reads it directly, and the PDF renderer reads it via
// Puppeteer's preferCSSPageSize — so the two can never diverge.
export default function PageSize({ orientation = 'portrait' }) {
  return <style>{`@page { size: A4 ${orientation}; margin: 10mm; }`}</style>;
}
