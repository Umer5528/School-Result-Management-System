/**
 * Parses page/limit query params into a Mongoose skip/limit pair, with
 * sane defaults and a hard ceiling so a client can't request an
 * unbounded page size.
 */
function paginationParams(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function paginatedResponse(items, total, page, limit) {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

module.exports = { paginationParams, paginatedResponse };
