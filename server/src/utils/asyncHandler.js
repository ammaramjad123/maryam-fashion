// Wraps an async route handler so thrown/rejected errors reach the error handler.
export default function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
