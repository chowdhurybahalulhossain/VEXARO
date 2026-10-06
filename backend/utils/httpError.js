// An error that carries an HTTP status code and a message safe to show to the customer.
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Sends the right response for any error: known errors keep their message,
// unexpected ones are logged and answered with a generic 500.
function sendError(res, err, label) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  console.error(label, err.message);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

module.exports = { HttpError, sendError };
