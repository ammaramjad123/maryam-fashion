// 404 handler for unmatched routes.
export default function notFound(req, res, _next) {
  res.status(404).json({
    success: false,
    message: `Not found: ${req.method} ${req.originalUrl}`,
  });
}
