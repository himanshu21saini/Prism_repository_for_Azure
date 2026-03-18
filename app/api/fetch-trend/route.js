import { query } from '../../../lib/db'

// Returns monthly trend data for a single KPI field across all available years,
// ordered chronologically. Used by TrendExplorer to populate the chart when the
// user selects a KPI from the dropdown.

export async function POST(request) {
  var body
  try { body = await request.json() } catch (e) {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  var datasetId       = body.datasetId
  var fieldName       = body.fieldName        // e.g. "net_interest_income"
  var accumulationType = body.accumulationType || 'cumulative'  // cumulative | point_in_time
  var yearsBack       = body.yearsBack || 3   // how many years of history to fetch

  if (!datasetId || !fieldName) {
    return Response.json({ error: 'datasetId and fieldName are required.' }, { status: 400 })
  }

  var agg = accumulationType === 'point_in_time' ? 'AVG' : 'SUM'

  // Get the range of available years in the dataset
  var yearRangeSQL = [
    'SELECT',
    "  MIN((data->>'year')::integer) AS min_year,",
    "  MAX((data->>'year')::integer) AS max_year",
    'FROM dataset_rows',
    'WHERE dataset_id = ' + datasetId,
    "  AND (data->>'year') IS NOT NULL",
  ].join('\n')

  var yearRange
  try {
    var yr = await query(yearRangeSQL)
    yearRange = yr[0] || { min_year: null, max_year: null }
  } catch (e) {
    return Response.json({ error: 'Failed to read year range: ' + e.message }, { status: 500 })
  }

  var maxYear = yearRange.max_year ? parseInt(yearRange.max_year) : new Date().getFullYear()
  var minYear = Math.max(
    yearRange.min_year ? parseInt(yearRange.min_year) : maxYear - yearsBack,
    maxYear - yearsBack
  )

  // Fetch monthly aggregated values for this KPI across the year range
  var trendSQL = [
    'SELECT',
    "  CONCAT(data->>'year', '-', LPAD(CAST((data->>'month')::integer AS TEXT), 2, '0')) AS period,",
    '  ' + agg + "(COALESCE((data->>'" + fieldName + "')::numeric, 0)) AS value",
    'FROM dataset_rows',
    'WHERE dataset_id = ' + datasetId,
    "  AND (data->>'year')::integer >= " + minYear,
    "  AND (data->>'year')::integer <= " + maxYear,
    "  AND (data->>'month') IS NOT NULL",
    "  AND (data->>'year') IS NOT NULL",
    "GROUP BY data->>'year', data->>'month'",
    'ORDER BY period ASC',
  ].join('\n')

  try {
    var rows = await query(trendSQL)

    // Filter out rows where value is 0 and there's no data
    // (keeps genuine zeros but removes months that had no records at all)
    var filtered = rows.filter(function(r) {
      return r.period && r.value !== null && r.value !== undefined
    })

    return Response.json({
      data:      filtered,
      fieldName: fieldName,
      agg:       agg,
      minYear:   minYear,
      maxYear:   maxYear,
    })
  } catch (err) {
    console.error('fetch-trend error:', err.message)
    return Response.json({ error: 'Query failed: ' + err.message }, { status: 500 })
  }
}
