// ASSERTED SELECT — a typo'd column name must RAISE, not return empty.
//
// THE FOURTH FACE of the empty-result family, made structural. On 2026-08-10
// alone, four separate diagnoses were built on a query that asked for a column
// that does not exist:
//
//   site_reports.report_no          → "no site reports"
//   project_members.user_id         → "the test user has lost its membership"
//   ist_prerequisites.received_on   → a leg failing against a field never fetched
//   project_cx_columns.group_id     → "every stage group has zero columns"
//
// PostgREST answers an unknown column with an error on some paths and with a
// silently absent key on others, and a caller that reads `data` sees nothing
// either way. An empty result and a wrong question are indistinguishable — which
// is the whole disease this codebase keeps naming, arriving through the one door
// nobody had put a guard on.
//
// This does not validate a schema. It asserts the SHAPE THAT CAME BACK contains
// what was ASKED FOR, which is the cheap half and catches every case above.
//
//   const rows = await sel(svc.from('equipment').select('id, tag'), 'id, tag')
//
// Harness first. App adoption follows the touch-policy.

/**
 * @param {PromiseLike<{data: any, error: any}>} query  a supabase-js builder
 * @param {string} columns  the same string passed to .select()
 * @param {{allowEmpty?: boolean}} [opts]  allowEmpty defaults true — zero ROWS is
 *        legitimate; it is a zero-row answer to an unanswerable question that is not.
 */
export async function sel(query, columns, opts = {}) {
  const { data, error } = await query
  if (error) throw new Error(`query failed: ${error.message}`)
  const rows = Array.isArray(data) ? data : data ? [data] : []

  // Nothing came back at all: the request cannot be checked against a response,
  // so say so rather than silently pass. This is the case that produced three of
  // the four incidents above.
  if (rows.length === 0) {
    if (opts.allowEmpty === false) throw new Error(`no rows returned for [${columns}] — expected at least one`)
    return rows
  }

  const asked = columns.split(',').map(c => c.trim().split(/[\s(]/)[0]).filter(c => c && c !== '*')
  const got = new Set(Object.keys(rows[0]))
  const missing = asked.filter(c => !got.has(c))
  if (missing.length) {
    throw new Error(
      `SELECT asked for column(s) that are not in the response: ${missing.join(', ')}\n` +
      `  returned: ${[...got].join(', ')}\n` +
      `  A column that does not exist answers with nothing, which reads exactly like "no data".`)
  }
  return rows
}
