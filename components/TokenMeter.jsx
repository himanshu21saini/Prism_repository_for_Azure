'use client'

// Pricing per 1M tokens (as of 2025)
var PRICING = {
  'gpt-4o':      { input: 2.50,  output: 10.00 },
  'gpt-4o-mini': { input: 0.15,  output: 0.60  },
}

function calcCost(promptTokens, completionTokens, model) {
  var p = PRICING[model] || PRICING['gpt-4o-mini']
  return (promptTokens / 1e6) * p.input + (completionTokens / 1e6) * p.output
}

function fmtCost(usd) {
  if (usd < 0.001) return '<$0.001'
  if (usd < 0.01)  return '$' + usd.toFixed(4)
  return '$' + usd.toFixed(3)
}

function fmtTokens(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

// calls: array of { label, promptTokens, completionTokens, model }
export default function TokenMeter({ calls }) {
  if (!calls || !calls.length) return null

  var totalPrompt     = calls.reduce(function(s, c) { return s + (c.promptTokens || 0) }, 0)
  var totalCompletion = calls.reduce(function(s, c) { return s + (c.completionTokens || 0) }, 0)
  var totalTokens     = totalPrompt + totalCompletion
  var totalCost       = calls.reduce(function(s, c) { return s + calcCost(c.promptTokens || 0, c.completionTokens || 0, c.model) }, 0)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      fontSize: 10,
      fontFamily: 'var(--font-mono)',
    }}>
      {/* Total cost — most prominent */}
      <div style={{
        padding: '5px 12px',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      }}>
        <span style={{ fontSize: 8, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Session cost</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#10C48A', letterSpacing: '-0.01em' }}>{fmtCost(totalCost)}</span>
      </div>

      {/* Total tokens */}
      <div style={{
        padding: '5px 10px',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      }}>
        <span style={{ fontSize: 8, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Tokens</span>
        <span style={{ color: 'var(--text-secondary)' }}>{fmtTokens(totalTokens)}</span>
      </div>

      {/* Per-call breakdown */}
      {calls.map(function(c, i) {
        var cost = calcCost(c.promptTokens || 0, c.completionTokens || 0, c.model)
        var isExpensive = c.model === 'gpt-4o'
        return (
          <div
            key={i}
            title={c.model + ' — ' + fmtTokens(c.promptTokens || 0) + ' in / ' + fmtTokens(c.completionTokens || 0) + ' out = ' + fmtCost(cost)}
            style={{
              padding: '5px 10px',
              borderRight: i < calls.length - 1 ? '1px solid var(--border)' : 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              cursor: 'default',
            }}
          >
            <span style={{ fontSize: 8, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{c.label}</span>
            <span style={{ color: isExpensive ? '#F0A030' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
              {fmtTokens((c.promptTokens || 0) + (c.completionTokens || 0))} · {fmtCost(cost)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
