import { query } from '../../../lib/db'

export async function GET(request) {
  var { searchParams } = new URL(request.url)
  var datasetId = searchParams.get('datasetId')
  var field     = searchParams.get('field')

  if (!datasetId || !field) {
    return Response.json({ error: 'datasetId and field are required.' }, { status: 400 })
  }

  // Sanitize field name — only allow alphanumeric and underscores
  if (!/^[a-zA-Z0-9_]+$/.test(field)) {
    return Response.json({ error: 'Invalid field name.' }, { status: 400 })
  }

  var tbl = 'ds_' + datasetId

  try {
    var rows = await query(
      'SELECT DISTINCT CAST(' + field + ' AS TEXT) AS value FROM ' + tbl +
      ' WHERE ' + field + ' IS NOT NULL AND CAST(' + field + " AS TEXT) != ''" +
      ' ORDER BY value ASC LIMIT 100'
    )
    var values = rows.map(function(r) { return r.value }).filter(Boolean)
    return Response.json({ values })
  } catch (e) {
    console.error('distinct-values error:', e.message)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
