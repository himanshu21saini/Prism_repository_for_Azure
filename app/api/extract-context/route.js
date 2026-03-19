// Calls OpenAI to parse a free-text user context string into structured
// filters + KPI focus. Returns immediately — no DB writes, pure LLM call.
export async function POST(request) {
  var body
  try { body = await request.json() } catch(e) {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  var contextText = (body.contextText || '').trim()
  var metadata    = body.metadata || []   // array of metadata_rows for this set
  var apiKey      = process.env.OPENAI_API_KEY

  if (!contextText) {
    return Response.json({ filters: [], kpi_focus: [], explanation: '' })
  }
  if (!apiKey) {
    return Response.json({ error: 'OPENAI_API_KEY is not set.' }, { status: 500 })
  }

  // Build a compact field catalogue for the LLM to reason from
  var dimensions = metadata.filter(function(m) { return m.type === 'dimension' && m.is_output !== 'N' })
    .map(function(m) { return { field: m.field_name, display: m.display_name, sample: m.sample_values } })

  var kpis = metadata.filter(function(m) { return (m.type === 'kpi' || m.type === 'derived_kpi') && m.is_output !== 'N' })
    .map(function(m) { return { field: m.field_name, display: m.display_name, definition: m.definition, type: m.type } })

  var prompt = [
    'You are a BI dashboard assistant. A user has described their role and focus.',
    'Your job is to extract:',
    '  1. FILTERS: dimension filters to apply to all queries (e.g. Region = West)',
    '  2. KPI_FOCUS: which KPIs to prioritise — use your knowledge of the domain AND the metadata',
    '     definitions to identify all KPIs directly or indirectly related to the user\'s stated focus.',
    '     For example "focus on Revenue" should identify Revenue plus revenue-derived KPIs like',
    '     Loans_revenue, Deposits_revenue based on their definitions and dependencies.',
    '     Do NOT do simple string matching — reason from the definitions.',
    '',
    '## USER INPUT',
    contextText,
    '',
    '## AVAILABLE DIMENSIONS (for filter extraction)',
    JSON.stringify(dimensions),
    '',
    '## AVAILABLE KPIs (for focus extraction)',
    JSON.stringify(kpis),
    '',
    'Return ONLY valid JSON with this structure:',
    '{',
    '  "filters": [',
    '    { "field": "Region", "operator": "=", "value": "West", "display": "Region = West" }',
    '  ],',
    '  "kpi_focus": ["Revenue", "Loans_revenue", "Deposits_revenue"],',
    '  "explanation": "One sentence explaining what was extracted and why"',
    '}',
    '',
    'Rules:',
    '- filters: only use field names that exist in the dimensions list above',
    '- kpi_focus: only use field names from the KPIs list above',
    '- If no filter can be confidently extracted, return filters: []',
    '- If no KPI focus can be extracted, return kpi_focus: []',
    '- operator must be one of: =, !=, >, <',
    '- Return ONLY JSON, no markdown, no explanation outside the JSON',
  ].join('\n')

  try {
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    // Try Anthropic first; fall back to OpenAI if no Anthropic key
    var parsed
    if (res.ok) {
      var aj = await res.json()
      var content = aj.content && aj.content[0] && aj.content[0].text
      parsed = JSON.parse(content.replace(/```json|```/g, '').trim())
    } else {
      // Fallback to OpenAI
      var ores = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 500,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Return only valid JSON.' },
            { role: 'user',   content: prompt },
          ],
        }),
      })
      var oj = await ores.json()
      var ocontent = oj.choices && oj.choices[0] && oj.choices[0].message && oj.choices[0].message.content
      parsed = JSON.parse(ocontent.replace(/```json|```/g, '').trim())
    }

    return Response.json({
      filters:     parsed.filters     || [],
      kpi_focus:   parsed.kpi_focus   || [],
      explanation: parsed.explanation || '',
    })
  } catch(err) {
    console.error('extract-context error:', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
