import { query } from '../../../lib/db'
import { FISCAL_START_MONTH } from '../../../lib/fiscal-config'

export async function POST(request) {
  var body
  try { body = await request.json() } catch (e) {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  var datasetId        = body.datasetId
  var fieldName        = body.fieldName
  var accumulationType = body.accumulationType || 'cumulative'
  var calculationLogic = body.calculationLogic || ''
  var dependencies     = body.dependencies     || ''
  var yearsBack        = body.yearsBack || 3
  var yf               = body.yearField  || 'year'
  var mf               = body.monthField || 'month'
  var fiscal           = /fiscal/i.test(yf)
  var viewType         = body.viewType || 'YTD'

  if (!datasetId || !fieldName) {
    return Response.json({ error: 'datasetId and fieldName are required.' }, { status: 400 })
  }

  var tbl = 'ds_' + datasetId

  var isCountDistinct = /distinct/i.test(calculationLogic) || /count_distinct/i.test(accumulationType)
  var distField       = isCountDistinct ? (dependencies || fieldName).split(',')[0].trim() : null
  var agg             = accumulationType === 'point_in_time' ? 'AVG' : 'SUM'

  var yearRangeSQL = 'SELECT MIN(' + yf + '::integer) AS min_year, MAX(' + yf + '::integer) AS max_year FROM ' + tbl + ' WHERE ' + yf + ' IS NOT NULL'

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
console.log('=== fetch-trend: fieldName=', fieldName, 'distField=', distField, 'isCountDistinct=', isCountDistinct, 'agg=', agg)
  var valueExpr = isCountDistinct
    ? 'COUNT(DISTINCT ' + distField + ')'
    : agg + '(COALESCE(' + fieldName + '::numeric, 0))'

  var trendSQL = 'SELECT CONCAT(' + yf + ", '-', LPAD(CAST(" + mf + '::integer AS TEXT), 2, \'0\')) AS period, ' +
    valueExpr + ' AS value FROM ' + tbl +
    ' WHERE ' + yf + '::integer >= ' + minYear +
    ' AND ' + yf + '::integer <= ' + maxYear +
    ' AND ' + mf + ' IS NOT NULL' +
    ' AND ' + yf + ' IS NOT NULL' +
    ' GROUP BY ' + yf + ', ' + mf +
    ' ORDER BY period ASC'

  try {
    var rows = await query(trendSQL)
    var filtered = rows.filter(function(r) {
      return r.period && r.value !== null && r.value !== undefined
    })
    return Response.json({
      data: filtered, fieldName, agg, minYear, maxYear,
      fiscal: fiscal,
      fiscalStartMonth: FISCAL_START_MONTH,
    })
  } catch (err) {
    console.error('fetch-trend error:', err.message)
    return Response.json({ error: 'Query failed: ' + err.message }, { status: 500 })
  }
}
