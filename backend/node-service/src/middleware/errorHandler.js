/**
 * Central error handler.
 *
 * Express 5 automatically forwards a rejected promise from an async
 * handler here; Express 4 did not (the request just hung until the client
 * timed out, and nothing reached this function). That's why the async
 * controllers under src/controllers deliberately have no try/catch
 * boilerplate of their own - the framework routes their rejections here.
 *
 * The flip side is that this function now receives failures it never used
 * to see, most of which are *client* errors rather than server faults: a
 * malformed ObjectId in the URL, a body that fails schema validation, a
 * duplicate unique key, a request body that isn't valid JSON. Answering
 * all of those with a blanket 500 tells the caller "our fault, retry
 * later" when the correct answer is "your request was wrong, don't
 * retry", so they're classified before falling back to 500.
 */
function errorHandler(err, req, res, next) {
  // Already-sent responses can't be rewritten - hand off to Express's
  // default handler, which closes the connection.
  if (res.headersSent) {
    return next(err);
  }

  const {status, body} = classify(err);

  // Logged (not just returned) so the stack lands in the `logs`
  // collection via the console capture in services/logStore.
  if (status >= 500) {
    console.error(err);
  } else {
    console.warn(`${req.method} ${req.originalUrl} rejected: ${err.name}: ${err.message}`);
  }

  res.status(status).json(body);
}

function classify(err) {
  // body-parser (express.json) and anything else that sets an HTTP status
  // on the error itself - e.g. a SyntaxError for an unparseable JSON body,
  // which carries status 400.
  const declaredStatus = err.status || err.statusCode;
  if (Number.isInteger(declaredStatus) && declaredStatus >= 400 && declaredStatus < 600) {
    return {
      status: declaredStatus,
      body: {error: declaredStatus < 500 ? err.message || 'Bad request' : 'Internal server error'},
    };
  }

  // Mongoose: an id that isn't a valid ObjectId, or a document that fails
  // schema validation. Both mean the request was wrong.
  if (err.name === 'CastError') {
    return {status: 400, body: {error: `Invalid value for "${err.path}"`}};
  }
  if (err.name === 'ValidationError') {
    return {status: 400, body: {error: Object.values(err.errors || {}).map(e => e.message).join('; ') || 'Validation failed'}};
  }

  // Unique-index violation, e.g. registering an email that already exists
  // if it races past the explicit findOne check in user.controller.
  if (err.code === 11000) {
    return {status: 409, body: {error: 'That value is already taken'}};
  }

  return {status: 500, body: {error: 'Internal server error'}};
}

module.exports = {errorHandler};
