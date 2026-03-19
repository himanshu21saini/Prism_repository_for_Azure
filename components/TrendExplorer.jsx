'use client'

import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
var P = ['#00C8F0','#2B7FE3','#00B4A0','#7B8FF0','#F0A030','#9B7FE3','#10C48A','#E05555']

var ttStyle = {
  background: '#0D1930',
  border: '1px solid rgba(0,200,240,0.2)',
  borderRadius: 8, fontSize: 11, color: '#FFFFFF', padding: '8px 12px',
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

function buildTrendSQL(datasetId, fieldName, agg) {
  var curYear = new Date().getFullYear()
  var minYear = curYear - 3
  return [
    'SELECT',
    "  CONCAT(data->>'year', '-', LPAD(CAST((data->>'month')::integer AS TEXT), 2, '0')) AS period,",
    '  ' + agg + "(COALESCE((data->>'" + fieldName + "')::numeric, 0)) AS value",
    'FROM dataset_rows',
    'WHERE dataset_id = ' + datasetId,
    "  AND (data->>'year')::integer >= " + minYear,
    "  AND (data->>'month') IS NOT NULL",
    "  AND (data->>'year') IS NOT NULL",
    "GROUP BY data->>'year', data->>'month'",
    'ORDER BY period ASC',
  ].join('\n')
}

// Transform flat {period:'YYYY-MM', value} series into
// [{month:'Jan', curYear: v, cmpYear: v}, ...] for the two-line chart.
// curYear line is capped at the selected month (respects YTD/MTD/QTD).
// cmpYear line shows full 12 months.
function buildChartData(rawData, timePeriod) {
  var curYear  = timePeriod && timePeriod.year  ? parseInt(timePeriod.year)  : new Date().getFullYear()
  var cmpYear  = curYear - 1
  var cutoffMonth = timePeriod && timePeriod.month ? parseInt(timePeriod.month) : 12

  // Index raw data by year+month
  var byYearMonth = {}
  ;(rawData || []).forEach(function(row) {
    var parts = String(row.period || '').split('-')
    if (parts.length < 2) return
    var y = parseInt(parts[0])
    var m = parseInt(parts[1])
    if (isNaN(y) || isNaN(m)) return
    var key = y + '-' + m
    byYearMonth[key] = parseFloat(row.value)
  })

  // Build 12-slot array keyed by month name
  return MONTHS.map(function(name, i) {
    var monthNum = i + 1
    var curVal = byYearMonth[curYear + '-' + monthNum]
    var cmpVal = byYearMonth[cmpYear + '-' + monthNum]

    return {
      month:   name,
      // Current year: only up to cutoff month
      curYear: monthNum <= cutoffMonth ? (curVal !== undefined ? curVal : null) : null,
      // Comparison year: full 12 months
      cmpYear: cmpVal !== undefined ? cmpVal : null,
    }
  })
}

export default function TrendExplorer({ metadata, datasetId, timePeriod, onSimulate, onTrendData }) {

  var kpiOptions = (metadata || []).filter(function(m) {
    return m.type === 'kpi' || m.type === 'derived_kpi'
  }).sort(function(a, b) {
    var order = { high: 0, medium: 1, low: 2 }
    var paVal = order[(a.business_priority || '').toLowerCase()]
    var pbVal = order[(b.business_priority || '').toLowerCase()]
    var pa = paVal !== undefined ? paVal : 1
    var pb = pbVal !== undefined ? pbVal : 1
    if (pa !== pb) return pa - pb
    return (a.display_name || '').localeCompare(b.display_name || '')
  })

  var [selectedField, setSelectedField] = useState(kpiOptions.length ? kpiOptions[0].field_name : '')
  var [cache,         setCache]         = useState({})
  var [dataState,     setDataState]     = useState('idle')
  var [dataError,     setDataError]     = useState('')
  var [prefetchDone,  setPrefetchDone]  = useState(false)

  var selectedMeta = kpiOptions.find(function(m) { return m.field_name === selectedField })
  var cached       = cache[selectedField]

  // ── Background pre-fetch: all KPIs on mount ───────────────────────────────
  useEffect(function() {
    if (!datasetId || !onTrendData || prefetchDone || !kpiOptions.length) return
    setPrefetchDone(true)

    kpiOptions.forEach(function(meta) {
      var field = meta.field_name
      var acc   = meta.accumulation_type || 'cumulative'

      fetch('/api/fetch-trend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: datasetId, fieldName: field, accumulationType: acc, yearsBack: 3 }),
      })
        .then(function(r) { return r.json() })
        .then(function(trendJson) {
          if (trendJson.error || !trendJson.data) return
          var trendData = trendJson.data || []
          var agg = trendJson.agg || (acc === 'point_in_time' ? 'AVG' : 'SUM')
          var sql = buildTrendSQL(datasetId, field, agg)

          setCache(function(p) {
            if (p[field]) return p
            var n = Object.assign({}, p)
            n[field] = { data: trendData, forecast: null, sql: sql }
            return n
          })
          onTrendData(field, trendData, meta)
        })
        .catch(function() {})
    })
  }, [datasetId])

  // ── Selected KPI fetch: data + forecast ───────────────────────────────────
  useEffect(function() {
    if (!selectedField || !datasetId) return

    var acc = (selectedMeta && selectedMeta.accumulation_type) || 'cumulative'

    // If already fully cached (data + forecast), just set done
    if (cached && cached.data && cached.forecast !== undefined && cached.forecast !== null) {
      setDataState('done')
      return
    }

    // If pre-fetch already got the data but no forecast yet, skip re-fetching data
    if (cached && cached.data && cached.data.length >= 3 && cached.forecast === null) {
      // Fetch forecast using existing data
      setDataState('loading')
      fetch('/api/generate-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesData: cached.data, valueKey: 'value', labelKey: 'period', horizonMonths: 3 }),
      })
        .then(function(r) { return r.json() })
        .then(function(fcJson) {
          setCache(function(p) {
            var n = Object.assign({}, p)
            n[selectedField] = Object.assign({}, p[selectedField], { forecast: fcJson.forecasts ? fcJson : null })
            return n
          })
          setDataState('done')
        })
        .catch(function() { setDataState('done') })
      return
    }

    // Full fetch: data + forecast
    setDataState('loading')
    setDataError('')

    fetch('/api/fetch-trend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datasetId: datasetId, fieldName: selectedField, accumulationType: acc, yearsBack: 3 }),
    })
      .then(function(r) { return r.json() })
      .then(function(trendJson) {
        if (trendJson.error) throw new Error(trendJson.error)
        var trendData = trendJson.data || []
        var agg = trendJson.agg || (acc === 'point_in_time' ? 'AVG' : 'SUM')
        var sql = buildTrendSQL(datasetId, selectedField, agg)

        if (onTrendData) onTrendData(selectedField, trendData, selectedMeta)

        if (trendData.length < 3) {
          setCache(function(p) { var n = Object.assign({}, p); n[selectedField] = { data: trendData, forecast: null, sql: sql }; return n })
          setDataState('done')
          return
        }

        return fetch('/api/generate-forecast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seriesData: trendData, valueKey: 'value', labelKey: 'period', horizonMonths: 3 }),
        })
          .then(function(r) { return r.json() })
          .then(function(fcJson) {
            setCache(function(p) { var n = Object.assign({}, p); n[selectedField] = { data: trendData, forecast: fcJson.forecasts ? fcJson : null, sql: sql }; return n })
            setDataState('done')
          })
      })
      .catch(function(err) { setDataError(err.message); setDataState('error') })
  }, [selectedField])

  if (!kpiOptions.length) return null

  var trendData = (cached && cached.data) || []
  var forecast  = cached && cached.forecast
  var cachedSQL = cached && cached.sql

  // Build the two-line chart data: {month, curYear, cmpYear}
  var chartData   = buildChartData(trendData, timePeriod)
  var curYearLabel = timePeriod ? String(timePeriod.year)  : 'Current year'
  var cmpYearLabel = timePeriod ? String(parseInt(timePeriod.year) - 1) : 'Prior year'

  // Quick stats from current year data
  var curVals = chartData.map(function(r) { return r.curYear }).filter(function(v) { return v !== null && !isNaN(v) })
  var latest   = curVals[curVals.length - 1]
  var earliest = curVals[0]
  var totalChg = (earliest && earliest !== 0) ? ((latest - earliest) / Math.abs(earliest) * 100) : null
  var maxVal   = curVals.length ? Math.max.apply(null, curVals) : null

  var unit  = (selectedMeta && selectedMeta.unit) || ''
  var color = P[kpiOptions.indexOf(selectedMeta) % P.length]

  var trendBadge = forecast
    ? (forecast.trend === 'up' ? '↑' : forecast.trend === 'down' ? '↓' : '→') + ' ' + forecast.confidence + ' confidence'
    : null

  var simulateQuery = {
    id: selectedField, title: (selectedMeta && selectedMeta.display_name) || selectedField,
    chart_type: 'area', label_key: 'period', value_key: 'value', unit: unit, sql: cachedSQL || null,
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
      padding: '20px 24px 16px', marginBottom: 20,
      position: 'relative', overflow: 'hidden', backdropFilter: 'blur(8px)',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, ' + color + ', rgba(43,127,227,0.3), transparent)', opacity: 0.6 }} />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
          Trend Explorer
        </p>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <select
            value={selectedField}
            onChange={function(e) { setSelectedField(e.target.value) }}
            style={{
              appearance: 'none', padding: '7px 32px 7px 12px',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
              fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-display)',
              cursor: 'pointer', outline: 'none', letterSpacing: '-0.01em', minWidth: 240,
            }}
          >
            <optgroup label="KPIs">
              {kpiOptions.filter(function(m) { return m.type === 'kpi' }).map(function(m) {
                return <option key={m.field_name} value={m.field_name}>{m.display_name || m.field_name}{m.unit ? ' (' + m.unit + ')' : ''}</option>
              })}
            </optgroup>
            <optgroup label="Derived KPIs">
              {kpiOptions.filter(function(m) { return m.type === 'derived_kpi' }).map(function(m) {
                return <option key={m.field_name} value={m.field_name}>{m.display_name || m.field_name}{m.unit ? ' (' + m.unit + ')' : ''}</option>
              })}
            </optgroup>
          </select>
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'var(--text-tertiary)', pointerEvents: 'none' }}>▾</span>
        </div>

        {dataState === 'loading' && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="spinner" />loading...
          </span>
        )}
        {trendBadge && dataState === 'done' && (
          <span style={{
            fontSize: 9, padding: '3px 8px', borderRadius: 3, fontWeight: 500,
            background: 'rgba(240,160,48,0.1)', color: '#F0A030',
            border: '1px solid rgba(240,160,48,0.25)',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', flexShrink: 0,
          }}>{trendBadge}</span>
        )}

        <div style={{ flex: 1 }} />

        {dataState === 'done' && latest != null && <StatPill label="Latest" value={fmt(latest) + (unit ? ' ' + unit : '')} color={color} />}
        {dataState === 'done' && totalChg != null && (
          <StatPill label="YTD Δ" value={(totalChg >= 0 ? '+' : '') + totalChg.toFixed(1) + '%'} color={totalChg >= 0 ? '#10C48A' : '#E05555'} />
        )}
        {dataState === 'done' && maxVal != null && <StatPill label="Peak" value={fmt(maxVal) + (unit ? ' ' + unit : '')} />}

        {onSimulate && dataState === 'done' && trendData.length > 0 && cachedSQL && (
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
          >⟳ Simulate</button>
        )}
      </div>

      {selectedMeta && selectedMeta.definition && (
        <p style={{ fontSize: 11, color: 'rgba(56,180,220,0.55)', marginBottom: 12, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
          {selectedMeta.definition}
        </p>
      )}

      {dataState === 'error' && (
        <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed rgba(224,85,85,0.3)', borderRadius: 8 }}>
          <p style={{ fontSize: 12, color: '#E05555', fontFamily: 'var(--font-body)' }}>{dataError}</p>
        </div>
      )}

      {dataState === 'loading' && (
        <div style={{ height: 300, display: 'flex', alignItems: 'flex-end', gap: 3, padding: '0 8px' }}>
          {Array.from({ length: 12 }).map(function(_, i) {
            return <div key={i} className="skeleton" style={{ flex: 1, height: (35 + Math.abs(Math.sin(i * 0.5)) * 50) + '%', borderRadius: '2px 2px 0 0' }} />
          })}
        </div>
      )}

      {dataState === 'done' && trendData.length === 0 && (
        <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            No monthly data found for {(selectedMeta && selectedMeta.display_name) || selectedField}
          </p>
        </div>
      )}

      {/* ── Two-line chart: current year vs comparison year ─────────── */}
      {dataState === 'done' && trendData.length > 0 && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="1 6" stroke="rgba(56,140,255,0.07)" vertical={false} />
            <XAxis dataKey="month" tick={axStyle} axisLine={false} tickLine={false} />
            <YAxis tick={axStyle} width={62} tickFormatter={function(v) { return fmt(v) + (unit ? ' ' + unit : '') }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={ttStyle}
              formatter={function(v, n) {
                if (v === null || v === undefined) return null
                return [fmt(v) + (unit ? ' ' + unit : ''), n]
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8, fontFamily: "'Plus Jakarta Sans', system-ui", color: '#3D6080' }} />

            {/* Comparison year — full 12 months, dashed, muted */}
            <Line
              type="monotone"
              dataKey="cmpYear"
              name={cmpYearLabel}
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              strokeOpacity={0.45}
              dot={{ r: 2, fill: color, strokeWidth: 0, fillOpacity: 0.45 }}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />

            {/* Current year — solid, stops at cutoff month */}
            <Line
              type="monotone"
              dataKey="curYear"
              name={curYearLabel}
              stroke={color}
              strokeWidth={2.5}
              dot={{ r: 3, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: color, stroke: 'var(--bg)', strokeWidth: 2 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Forecast footer */}
      {forecast && dataState === 'done' && (
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>Forecast method: {forecast.method || 'linear_regression'}</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>R²: {forecast.r_squared != null ? forecast.r_squared : '—'}</span>
          {forecast.forecasts && forecast.forecasts[0] && (
            <span style={{ fontSize: 10, color: '#F0A030', fontFamily: 'var(--font-mono)' }}>
              Next month: {fmt(forecast.forecasts[0].forecast)}{unit ? ' ' + unit : ''} ({fmt(forecast.forecasts[0].forecast_low)} – {fmt(forecast.forecasts[0].forecast_high)})
            </span>
          )}
        </div>
      )}
    </div>
  )
}
