export function errorHandler(err, req, res, next) {
  console.error('[Backend Error]', err);

  if (err.code?.startsWith('P')) {
    return res.status(400).json({
      error: 'Database operation failed',
      code: err.code,
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Invalid or expired token',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}
