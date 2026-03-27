import * as XLSX from 'xlsx'
import { query } from '../../../lib/db'

export async function POST(request) {
  var apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return Response.json({ error: 'OPENAI_API_KEY not set.' }, { status: 500 })

  var body
  try { body = await request.json() } catch(e) { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  var datasetId = body.datasetId
  if (!datasetId) return Response.json({ error: 'datasetId is required.' }, { status: 400 })

  var tbl = 'ds_' + datasetId

  // ── Sample from real table ────────────────────────────────────────────────
  var sampleRows = []
  var columns    = []
  try {
    sampleRows = await query('SELECT * FROM ' + tbl + ' LIMIT 10')
    if (sampleRows.length) columns = Object.keys(sampleRows[0])
  } catch(e) {
    return Response.json({ error: 'Could not read dataset table ' + tbl + '. Make sure the dataset has been uploaded. ' + e.message }, { status: 404 })
  }

  if (!columns.length) return Response.json({ error: 'Dataset table is empty.' }, { status: 400 })

  // ── Build column summary for the prompt ──────────────────────────────────
  // Send field names + sample values — no structure-only approach needed since
  // column names are already sanitized safe identifiers
  var colSummary = columns.map(function(col) {
    var vals = sampleRows.map(function(r) { return r[col] }).filter(function(v) { return v !== null && v !== undefined })
    var unique = Array.from(new Set(vals.map(String))).slice(0, 5)
    return { field_name: col, sample_values: unique.join(', ') }
  })

  var prompt = [
    '## TASK',
    'Generate metadata for each field in this dataset. Return one row per field.',
    '',
    '## DATASET FIELDS WITH SAMPLE VALUES',
    JSON.stringify(colSummary, null, 2),
    '',
    '## OUTPUT FORMAT — JSON array only',
    'Return a JSON array where each element has exactly these keys:',
    '{',
    '  "field_name": "exact field name from input",',
    '  "display_name": "human-friendly name e.g. Branch Name",',
    '  "type": "kpi | derived_kpi | dimension | year_month",',
    '  "data_type": "Integer | Float | String | Date",',
    '  "unit": "USD | % | count | Sec | days | (empty if none)",',
    '  "definition": "clear business definition of this field",',
    '  "aggregation": "SUM | AVG | COUNT | COUNT_DISTINCT | MAX | MIN | (empty for dimensions)",',
    '  "accumulation_type": "cumulative | point_in_time | (empty for dimensions)",',
    '  "is_output": "Y | N",',
    '  "favorable_direction": "i | d | (empty for dimensions)",',
    '  "business_priority": "High | Medium | Low",',
    '  "calculation_logic": "(formula for derived_kpi only, else empty)",',
    '  "dependencies": "(source fields for derived_kpi only, else empty)",',
    '  "sample_values": "comma-separated sample values",',
    '  "confidence": "high | medium | low",',
    '  "review_notes": "(explanation if confidence is not high, else empty)"',
    '}',
    '',
    '## CLASSIFICATION RULES',
    'type = "kpi": a measurable numeric metric (revenue, count, score)',
    'type = "derived_kpi": a calculated metric from other fields (ratio, rate, average)',
    'type = "dimension": a categorical/descriptive field (name, region, type, date label)',
    'type = "year_month": a year or month integer field used for time filtering',
    'is_output = "N": internal/technical fields the user would not want to see (sort orders, flags, IDs used only for joining)',
    'favorable_direction = "i": higher is better (revenue, customers, score if higher=better)',
    'favorable_direction = "d": lower is better (cost, idle time, wait time, error rate)',
    'For year_month fields: aggregation and accumulation_type should be empty, is_output = Y',
    '',
    '## IMPORTANT',
    'Return ONLY the JSON array. No markdown. No explanation. No preamble.',
    'Every field from the input must appear in the output exactly once.',
    'field_name must exactly match the input field name.',
  ].join('\n')

  var response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 8000,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a senior BI analyst. Generate precise metadata. Return valid JSON only.' },
        { role: 'user',   content: prompt },
      ],
    }),
  })

  var json = await response.json()
  if (!response.ok) return Response.json({ error: (json.error && json.error.message) || 'OpenAI error.' }, { status: 500 })

  var content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content
  if (!content) return Response.json({ error: 'Empty response from OpenAI.' }, { status: 500 })

  var parsed
  try {
    var cleaned = content.replace(/```json|```/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch(e) {
    return Response.json({ error: 'Could not parse metadata response.' }, { status: 500 })
  }

  // Handle both array and { fields: [...] } response shapes
  var fields = Array.isArray(parsed) ? parsed : (parsed.fields || parsed.metadata || Object.values(parsed)[0])
  if (!Array.isArray(fields)) return Response.json({ error: 'Expected array of fields from LLM.' }, { status: 500 })

  // ── Build Excel workbook ──────────────────────────────────────────────────
  var mainCols = ['field_name','display_name','type','data_type','unit','definition','aggregation',
    'accumulation_type','is_output','favorable_direction','business_priority',
    'calculation_logic','dependencies','sample_values']
  var reviewCols = [...mainCols, 'confidence', 'review_notes']

  var mainRows = fields.map(function(f) {
    var row = {}
    mainCols.forEach(function(c) { row[c] = f[c] !== undefined ? f[c] : '' })
    return row
  })

  var reviewRows = fields.map(function(f) {
    var row = {}
    reviewCols.forEach(function(c) { row[c] = f[c] !== undefined ? f[c] : '' })
    return row
  })

  var flaggedCount = fields.filter(function(f) { return f.confidence && f.confidence !== 'high' }).length

  var wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mainRows),   'Metadata')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reviewRows), 'Review Summary')

  var buf      = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  var base64   = Buffer.from(buf).toString('base64')
  var filename = 'metadata_' + tbl + '_' + Date.now() + '.xlsx'

  return Response.json({ base64, filename, fieldCount: fields.length, flaggedCount })
}
