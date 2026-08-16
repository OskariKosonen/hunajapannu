/**
 * Parses the limit/offset/search trio shared by the paginated list endpoints.
 * Search is used as an ILIKE '%term%' argument, so escape the LIKE
 * metacharacters — otherwise a '%' typed by a user matches everything.
 *
 * Extracted from index.js to be testable: a regression in the escaping turns
 * a search into a full table match, which still returns 200 and still looks
 * like data.
 */
function parseListParams(req, { defaultLimit, maxLimit }) {
  const rawLimit = parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : defaultLimit, 1), maxLimit);

  const rawOffset = parseInt(req.query.offset, 10);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const search = rawSearch.slice(0, 200);
  const like = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;

  return { limit, offset, search, like };
}

module.exports = { parseListParams };
