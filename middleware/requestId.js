import { v4 as uuidv4 } from 'uuid';

const HEADER = 'x-request-id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestId(req, res, next) {
  const incoming = req.headers[HEADER];
  const id = incoming && UUID_RE.test(incoming) ? incoming : uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
