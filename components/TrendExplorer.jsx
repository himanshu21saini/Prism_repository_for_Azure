'use client'

import { useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ── Shared styles (mirror Dashboard's palette) ────────────────────────────────
var P  = ['#00C8F0','#2B7FE3','#00B4A0','#7B8FF0','#F0A030','#9B7FE3','#10C48A','#E05555']

var ttStyle = {
  background: '#0D1930',
  border: '1px solid rgba(0,200,240,0.2)',
  borderRadius: 8,
  fontSize: 11,
  color: '#FFFFFF',
  padding: '8px 12px',
}
var axStyle = { fontSize: 10, fill: '#3D6080', fontFamily: "'JetBrains Mono', monospace" }

function fmt(v) {
  var n = parseFloat(v)
  if (isNaN(n)) return String(v || '')
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2)
}

// ── Stat pill shown in header ─────────────────────────────────────────────────
function StatPill({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
      padding: '4px 12px',
      background: 'rgba(0,0,0,0.15)',
      border: '1px solid var(--border)',
      borderRadius: 6,
    }}>
      <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color || 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>{value}</span>
    </div>
  )
}

// ── Main TrendExplorer ────────────────────────────────────────────────────────
export default function TrendExplorer({ trendResults, allQueries, periodInfo, onSimulate }) {
  // trendResults: array of chart results with chart_type line|area
  // Build KPI option list from them
  var options = trendResults.map(function(r) {
    var q = allQueries.find(function(q) { return q.id === r.id }) || {}
    return {
      id:       r.id,
      title:    r.title,
      unit:     r.unit || '',
      insight:  q.insight || '',
      result:   r,
      query:    q,
    }
  })

  var [selectedId,  setSelectedId]  = useState(options.length ? options[0].id : '')
  var [forecast,    setForecast]    = useState(null)
  var [fcLoading,   setFcLoading]   = useState(false)
  var [fetchedIds,  setFetchedIds]  = useState({})   // cache: id → forecast result

  var selected = options.find(function(o) { return o.id === selectedId }) || options[0]

  // Fetch forecast whenever selected KPI changes
  useEffect(function() {
    if (!selected) return
    var result = selected.result
    var id     = result.id

    // Use cached result if available
    if (fetchedIds[id]) {
      setForecast(fetchedIds[id])
      return
    }

    var vk = result.value_key || 'value'
    var lk = result.label_key || 'period'

    setFcLoading(true)
    setForecast(null)

    fetch('/api/generate-forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesData: result.data, valueKey: vk, labelKey: lk, horizonMonths: 3 }),
    })
      .then(function(res) { return res.json() })
      .then(function(json) {
        if (json.forecasts) {
          setForecast(json)
          setFetchedIds(function(prev) {
            var next = Object.assign({}, prev)
            next[id] = json
            return next
          })
        }
        setFcLoading(false)
      })
      .catch(function() { setFcLoading(false) })
  }, [selectedId])

  if (!selected) return null

  var result   = selected.result
  var valueKey = result.value_key || 'value'
  var labelKey = result.label_key || 'period'
  var color    = P[options.indexOf(selected) % P.length]
  var data     = result.data || []

  // Merge forecast points into data
  var merged = data.slice()
  if (forecast && forecast.forecasts) {
    forecast.forecasts.forEach(function(f) {
      merged.push({
        [labelKey]:    f.period,
        [valueKey]:    null,
        forecast:      f.forecast,
        forecast_low:  f.forecast_low,
        forecast_high: f.forecast_high,
      })
    })
  }

  // Compute quick stats from historical data
  var histVals  = data.map(function(r) { return parseFloat(r[valueKey]) }).filter(function(v) { return !isNaN(v) })
  var latest    = histVals[histVals.length - 1]
  var earliest  = histVals[0]
  var totalChg  = (earliest && earliest !== 0) ? ((latest - earliest) / Math.abs(earliest) * 100) : null
  var maxVal    = Math.max.apply(null, histVals)
  var minVal    = Math.min.apply(null, histVals)
  var maxPeriod = data[histVals.indexOf(maxVal)]
  var minPeriod = data[histVals.indexOf(minVal)]

  // Trend badge
  var trendBadge = forecast
    ? (forecast.trend === 'up' ? '↑' : forecast.trend === 'down' ? '↓' : '→') + ' ' + (forecast.confidence || '') + ' confidence'
    : null

  // Build the simulate query
  var fullQuery = allQueries.find(function(q) { return q.id === result.id }) || result
  var simulateQuery = Object.assign({}, fullQuery, {
    label_key:   result.label_key,
    value_key:   result.value_key,
    unit:        result.unit,
    chart_type:  'area',
  })

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px 24px 16px',
      marginBottom: 20,
      position: 'relative',
      overflow: 'hidden',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Top accent line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, ' + color + ', rgba(43,127,227,0.3), transparent)', opacity: 0.6 }} />

      {/* ── Header row ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>

        {/* Section label */}
        <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
          Trend Explorer
        </p>

        {/* KPI dropdown */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <select
            value={selectedId}
            onChange={function(e) { setSelectedId(e.target.value) }}
            style={{
              appearance: 'none',
              padding: '7px 32px 7px 12px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: 13, fontWeight: 500,
              fontFamily: 'var(--font-display)',
              cursor: 'pointer', outline: 'none',
              letterSpacing: '-0.01em',
              minWidth: 220,
            }}
          >
            {options.map(function(o) {
              return <option key={o.id} value={o.id}>{o.title}{o.unit ? ' (' + o.unit + ')' : ''}</option>
            })}
          </select>
          {/* Custom chevron */}
          <span style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            fontSize: 9, color: 'var(--text-tertiary)', pointerEvents: 'none',
          }}>▾</span>
        </div>

        {/* Trend badge */}
        {trendBadge && (
          <span style={{
            fontSize: 9, padding: '3px 8px', borderRadius: 3, fontWeight: 500,
            background: 'rgba(240,160,48,0.1)', color: '#F0A030',
            border: '1px solid rgba(240,160,48,0.25)',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', flexShrink: 0,
          }}>
            {trendBadge}
          </span>
        )}
        {fcLoading && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            <span className="spinner" style={{ marginRight: 4 }} />computing forecast...
          </span>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Quick stats */}
        {latest != null && <StatPill label="Latest" value={fmt(latest) + (selected.unit ? ' ' + selected.unit : '')} color={color} />}
        {totalChg != null && (
          <StatPill
            label={'Period Δ'}
            value={(totalChg >= 0 ? '+' : '') + totalChg.toFixed(1) + '%'}
            color={totalChg >= 0 ? '#10C48A' : '#E05555'}
          />
        )}
        {maxVal != null && <StatPill label="Peak" value={fmt(maxVal) + (selected.unit ? ' ' + selected.unit : '')} />}

        {/* Simulate button */}
        {onSimulate && (
          <button
            onClick={function() { onSimulate(simulateQuery) }}
            style={{
              fontSize: 10, padding: '6px 14px', borderRadius: 6, fontWeight: 500,
              background: 'rgba(155,127,227,0.1)', color: '#9B7FE3',
              border: '1px solid rgba(155,127,227,0.3)',
              cursor: 'pointer', transition: 'all var(--transition)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', flexShrink: 0,
            }}
            onMouseEnter={function(e) { e.currentTarget.style.background = 'rgba(155,127,227,0.2)' }}
            onMouseLeave={function(e) { e.currentTarget.style.background = 'rgba(155,127,227,0.1)' }}
          >
            ⟳ Simulate
          </button>
        )}
      </div>

      {/* Insight text */}
      {selected.insight && (
        <p style={{ fontSize: 11, color: 'rgba(56,180,220,0.6)', marginBottom: 12, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
          {selected.insight}
        </p>
      )}

      {/* ── Chart ──────────────────────────────────────────────────── */}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={merged} margin={{ top: 8, right: 16, left: 0, bottom: 32 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color}    stopOpacity={0.25} />
              <stop offset="100%" stopColor={color}    stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="fc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#F0A030" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#F0A030" stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="1 6" stroke="rgba(56,140,255,0.07)" vertical={false} />

          <XAxis
            dataKey={labelKey}
            tick={axStyle}
            angle={-30}
            textAnchor="end"
            interval={0}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={axStyle}
            width={58}
            tickFormatter={function(v) { return fmt(v) + (selected.unit ? ' ' + selected.unit : '') }}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip
            contentStyle={ttStyle}
            formatter={function(v, n) {
              if (v === null || v === undefined) return null
              return [fmt(v) + (selected.unit ? ' ' + selected.unit : ''), n]
            }}
          />

          {/* Dividing reference line between historical and forecast */}
          {forecast && forecast.forecasts && data.length > 0 && (
            <ReferenceLine
              x={data[data.length - 1][labelKey]}
              stroke="rgba(240,160,48,0.3)"
              strokeDasharray="3 3"
              label={{ value: 'Forecast →', position: 'insideTopRight', fontSize: 9, fill: '#F0A030', fontFamily: 'var(--font-mono)' }}
            />
          )}

          {/* Historical area */}
          <Area
            type="monotone"
            dataKey={valueKey}
            name={selected.title}
            stroke={color}
            strokeWidth={2}
            fill="url(#trend-fill)"
            dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: color, stroke: 'var(--bg)', strokeWidth: 2 }}
            connectNulls={false}
          />

          {/* Forecast line */}
          {forecast && forecast.forecasts && (
            <Area
              type="monotone"
              dataKey="forecast"
              name="Forecast"
              stroke="#F0A030"
              strokeWidth={2}
              strokeDasharray="6 3"
              fill="url(#fc-fill)"
              dot={{ r: 3.5, fill: '#F0A030', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls={true}
            />
          )}

          {/* CI bounds */}
          {forecast && forecast.forecasts && (
            <Area type="monotone" dataKey="forecast_high" name="Upper bound" stroke="#F0A030" strokeWidth={0.5} strokeDasharray="2 5" fill="none" dot={false} activeDot={false} connectNulls legendType="none" />
          )}
          {forecast && forecast.forecasts && (
            <Area type="monotone" dataKey="forecast_low"  name="Lower bound" stroke="#F0A030" strokeWidth={0.5} strokeDasharray="2 5" fill="none" dot={false} activeDot={false} connectNulls legendType="none" />
          )}

          {forecast && forecast.forecasts && (
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8, fontFamily: "'Plus Jakarta Sans', system-ui", color: '#3D6080' }} />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {/* ── Forecast metadata footer ───────────────────────────────── */}
      {forecast && (
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            Method: {forecast.method || 'linear_regression'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            R²: {forecast.r_squared != null ? forecast.r_squared : '—'}
          </span>
          {forecast.forecasts && forecast.forecasts[0] && (
            <span style={{ fontSize: 10, color: '#F0A030', fontFamily: 'var(--font-mono)' }}>
              Next period: {fmt(forecast.forecasts[0].forecast)}{selected.unit ? ' ' + selected.unit : ''}
              {' '}({fmt(forecast.forecasts[0].forecast_low)} – {fmt(forecast.forecasts[0].forecast_high)})
            </span>
          )}
        </div>
      )}
    </div>
  )
}
