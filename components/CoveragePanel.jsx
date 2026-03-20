'use client'

import { useState } from 'react'

var REASON_LABEL = {
  shown:          { text: 'Shown',        color: 'var(--green-text)',  bg: 'var(--green-light)',  border: 'rgba(16,196,138,0.25)' },
  charted:        { text: 'Charted',      color: 'var(--green-text)',  bg: 'var(--green-light)',  border: 'rgba(16,196,138,0.25)' },
  cap_hit:        { text: 'Cap hit',      color: 'var(--amber-text)',  bg: 'var(--amber-light)',  border: 'rgba(240,160,48,0.25)' },
  not_in_topkpis: { text: 'Low rank',     color: 'var(--text-tertiary)', bg: 'var(--surface-2)', border: 'var(--border)' },
  flat:           { text: 'Flat (CV<0.05)', color: 'var(--red-text)',  bg: 'var(--red-light)',    border: 'rgba(224,85,85,0.2)' },
  low_cv:         { text: 'Low variance', color: 'var(--text-tertiary)', bg: 'var(--surface-2)', border: 'var(--border)' },
  not_selected:   { text: 'Not selected', color: 'var(--text-tertiary)', bg: 'var(--surface-2)', border: 'var(--border)' },
}

var REASON_EXPLANATION = {
  shown:          function(item) { return 'Included as a KPI card. Template used: ' + templateLabel(item) + '.' },
  charted:        function(item) { return 'Selected for a chart using the highest CV dimension available.' },
  cap_hit:        function(item) {
    return 'Not shown as a KPI card because the 8-card cap was reached. All higher-priority KPIs filled the available slots first. To include this field, raise the KPI card cap in the prompt or lower another field\'s priority.'
  },
  not_in_topkpis: function(item) {
    return 'Not passed to the chart generation step. Only the top 6 KPIs and top 4 derived KPIs by business priority are sent to the LLM. This field ranked outside that window. Raise its business_priority in your metadata to include it.'
  },
  flat:           function(item) {
    return 'Skipped — CV score was ' + item.cv + ', below the 0.05 threshold. All segments of ' + (item.dim_display || item.dim_field) + ' showed nearly identical values for ' + (item.kpi_display || item.kpi_field) + ', so a chart would add no insight.'
  },
  low_cv:         function(item) {
    return 'Low variance score (CV ' + item.cv + '). The dimension ' + (item.dim_display || item.dim_field) + ' does not reveal meaningful differences in ' + (item.kpi_display || item.kpi_field) + ' — segments are too similar. A higher-CV dimension was likely chosen for this KPI instead.'
  },
  not_selected:   function(item) {
    return 'Scored (CV ' + item.cv + ') but not selected. The LLM chose a different dimension for ' + (item.kpi_display || item.kpi_field) + ' based on the pre-analysis variance ranking, or the chart slots were already filled.'
  },
}

function templateLabel(item) {
  var agg = (item.aggregation || '').toUpperCase()
  if (agg === 'COUNT_DISTINCT') return 'T-COUNT-DISTINCT'
  if (item.accumulation_type === 'point_in_time') return 'T-PIT (latest month snapshot)'
  return 'T-SUM (cumulative)'
}

function CVBar({ cv }) {
  var n = parseFloat(cv) || 0
  var pct = Math.min(n * 100, 100)
  var color = n >= 0.3 ? 'var(--green-text)' : n >= 0.1 ? 'var(--amber-text)' : 'var(--red-text)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 56, height: 5, background: 'var(--surface-2)', borderRadius: 3, flexShrink: 0 }}>
        <div style={{ width: pct + '%', height: '100%', borderRadius: 3, background: color }} />
      </div>
      <span style={{ fontSize: 10, color, fontFamily: 'var(--font-mono)', width: 32 }}>{n.toFixed(2)}</span>
    </div>
  )
}

function Badge({ reason }) {
  var r = REASON_LABEL[reason] || REASON_LABEL.not_selected
  return (
    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: r.bg, color: r.color, border: '1px solid ' + r.border, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', flexShrink: 0 }}>
      {r.text}
    </span>
  )
}

function Row({ item, expandKey, onToggle }) {
  var key  = item.field_name || (item.kpi_field + '×' + item.dim_field)
  var open = expandKey === key
  var isDim = !!item.kpi_field
  var isDropped = item.reason !== 'shown' && item.reason !== 'charted'

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        onClick={function() { onToggle(open ? null : key) }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', background: open ? 'var(--surface-2)' : 'transparent', transition: 'background var(--transition)' }}
        onMouseEnter={function(e) { if (!open) e.currentTarget.style.background = 'var(--surface-2)' }}
        onMouseLeave={function(e) { if (!open) e.currentTarget.style.background = 'transparent' }}
      >
        <Badge reason={item.reason} />
        <span style={{ flex: 1, fontSize: 12, color: isDropped ? 'var(--text-tertiary)' : 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
          {isDim
            ? (item.kpi_display || item.kpi_field) + ' × ' + (item.dim_display || item.dim_field)
            : (item.display_name || item.field_name)
          }
        </span>
        {isDim && <CVBar cv={item.cv} />}
        {!isDim && item.business_priority && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{item.business_priority}</span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--transition)' }}>▾</span>
      </div>
      {open && (
        <div style={{ padding: '10px 12px 12px 12px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
            {(REASON_EXPLANATION[item.reason] || REASON_EXPLANATION.not_selected)(item)}
          </p>
          {isDim && item.top_segment && (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
              Top segment: {item.top_segment.name} · {item.top_segment.value != null ? item.top_segment.value.toFixed(2) : '—'}
            </p>
          )}
          {isDim && item.top_outlier && (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              Outlier: {item.top_outlier.name} ({item.top_outlier.dev_from_mean_pct > 0 ? '+' : ''}{item.top_outlier.dev_from_mean_pct}% from mean)
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function CoveragePanel({ coverageData }) {
  var [open,       setOpen]       = useState(false)
  var [expandKey,  setExpandKey]  = useState(null)
  var [tab,        setTab]        = useState('kpi')  // 'kpi' | 'dim'

  if (!coverageData) return null

  var kpiCoverage = coverageData.kpiCoverage || []
  var dimCoverage = coverageData.dimCoverage || []
  var shownCount  = kpiCoverage.filter(function(k) { return k.reason === 'shown' }).length
  var droppedCount = kpiCoverage.filter(function(k) { return k.reason !== 'shown' }).length
  var chartedDims = dimCoverage.filter(function(d) { return d.reason === 'charted' }).length
  var skippedDims = dimCoverage.filter(function(d) { return d.reason !== 'charted' }).length
  var totalItems  = kpiCoverage.length + dimCoverage.length

  var tabStyle = function(t) { return {
    fontSize: 11, padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'var(--font-body)',
    background:   tab === t ? 'var(--accent-dim)'   : 'transparent',
    color:        tab === t ? 'var(--text-accent)'  : 'var(--text-tertiary)',
    border: '1px solid ' + (tab === t ? 'var(--accent-border)' : 'var(--border)'),
  }}

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 16, background: 'var(--surface)', backdropFilter: 'blur(8px)' }}>

      {/* Header toggle */}
      <button
        onClick={function() { setOpen(function(v) { return !v }) }}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>Coverage Report</span>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 2, background: 'var(--accent-dim)', color: 'var(--text-accent)', border: '1px solid var(--accent-border)', fontFamily: 'var(--font-mono)' }}>
            {shownCount} shown · {droppedCount + skippedDims} skipped
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            {kpiCoverage.length} KPIs · {dimCoverage.length} combinations scored
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'var(--transition)' }}>▾</span>
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)' }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <button onClick={function() { setTab('kpi'); setExpandKey(null) }} style={tabStyle('kpi')}>
              KPI cards ({shownCount} shown, {droppedCount} skipped)
            </button>
            <button onClick={function() { setTab('dim'); setExpandKey(null) }} style={tabStyle('dim')}>
              Chart dimensions ({chartedDims} charted, {skippedDims} skipped)
            </button>
          </div>

          {/* KPI tab */}
          {tab === 'kpi' && (
            <div>
              {kpiCoverage.map(function(item) {
                return <Row key={item.field_name} item={item} expandKey={expandKey} onToggle={setExpandKey} />
              })}
            </div>
          )}

          {/* Dimension tab */}
          {tab === 'dim' && (
            <div>
              {dimCoverage.sort(function(a, b) { return parseFloat(b.cv) - parseFloat(a.cv) }).map(function(item) {
                var k = item.kpi_field + '×' + item.dim_field
                return <Row key={k} item={item} expandKey={expandKey} onToggle={setExpandKey} />
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
