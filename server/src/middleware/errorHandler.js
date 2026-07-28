import env from '../config/env.js';

/**
 * Central error handler. Business layers throw errors with an optional
 * `.status` and `.errors[]`; anything else becomes a 500.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity (4 args).
export default function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors;

  // Duplicate unique key (e.g. accountCode, Product.code) → 409.
  if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field ? `A record with that ${field} already exists` : 'Duplicate key';
  }

  // Mongoose schema validation → 400 with field-level detail.
  if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  }

  // Malformed ObjectId in a query → 400.
  if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  if (status >= 500) {
    console.error('[error]', err);
  }

  res.status(status).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
    ...(env.isProd ? {} : { stack: err.stack }),
  });
}
