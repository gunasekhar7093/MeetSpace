export function sendSuccess(res, { statusCode = 200, message = 'Success', data = null }) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function sendError(res, { statusCode = 500, message = 'Internal server error', errors = null }) {
  const payload = {
    success: false,
    message,
  };

  if (errors !== null && errors !== undefined) {
    payload.errors = errors;
  }

  return res.status(statusCode).json(payload);
}

