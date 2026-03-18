'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmt(v) {
  var n = parseFloat(v)
  if (isNaN(n)) return String(v || '')
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2)
}

var ttStyle = {
  background: '#0D1930',
  border: '1px solid rgba(0,200,240,0.2)',
  borderRadius: 8,
  fontSize: 11,
  color: '#FFFFFF',
  padding: '8px 12px',
}
var axStyle = { fontSize: 10, fill: '#3D6080' }

// Palette — original teal, whatif purple
var COLOR_ORIG   = '#00C8F0'
var COLOR_WHATIF = '#9B7FE3'

// ── Delta pill ────────────────────────────────────────────────────────────────
function DeltaPill({ diff, diffPct, unit }) {
  if (diff === null || diff === undefined) return null
  var positive = diff >= 0
  var color    = positive ? '#10C48A' : '#E05555'
  var bg       = positive ? 'rgba(16,196,138,0.1)' : 'rgba(224,85,85,0.1)'
  var border   = positive ? 'rgba(16,196,138,0.25)' : 'rgba(224,85,85,0.25)'
  var arrow    = positive ? '↑' : '↓'

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, border: '1px solid ' + border,
      borderRadius: 4, padding: '3px 9px',
      fontSize: 12, color: color, fontFamily: 'var(--font-mono)', fontWeight: 500,
    }}>
      {arrow}
      {fmt(Math.abs(diff))}{unit ? ' ' + unit : ''}
      {diffPct !== null && diffPct !== undefined && (
        <span style={{ opacity: 0.7, fontSize: 10 }}>({Math.abs(diffPct).toFixed(1)}%)</span>
      )}
    </span>
  )
}

// ── Mini comparison chart ─────────────────────────────────────────────────────
function ComparisonChart({ originalData, whatifData, query }) {
  if (!originalData || !whatifData) return null

  var labelKey = query.label_key || 'label'
  var curKey   = query.current_key || query.value_key || 'current_value'
  var ct       = query.chart_type

  // Merge original and whatif into one dataset for side-by-side comparison
  var merged = (whatifData || []).map(function(row, i) {
    var origRow = (originalData || [])[i] || {}
    var merged  = Object.assign({}, row)
    merged['__original__'] = parseFloat(origRow[curKey]) || 0
    merged['__whatif__']   = parseFloat(row[curKey])     || 0
    return merged
  })

  if (!merged.length) return null

  var showBar  = ct === 'bar' || ct === 'stacked_bar'
  var showLine = ct === 'line' || ct === 'area'

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', marginBottom: 8 }}>
        Scenario preview
      </p>
      <ResponsiveContainer width="100%" height={180}>
        {showLine ? (
          <LineChart data={merged} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="1 4" stroke="rgba(56,140,255,0.08)" vertical={false} />
            <XAxis dataKey={labelKey} tick={axStyle} angle={-30} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
            <YAxis tick={axStyle} width={48} tickFormatter={fmt} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={ttStyle} formatter={function(v) { return [fmt(v), ''] }} />
            <Legend wrapperStyle={{ fontSize: 10, color: '#3D6080' }} />
            <Line type="monotone" dataKey="__original__" name="Original" stroke={COLOR_ORIG}   strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="__whatif__"   name="Scenario" stroke={COLOR_WHATIF} strokeWidth={2}   dot={{ r: 2.5 }} />
          </LineChart>
        ) : (
          <BarChart data={merged} margin={{ top: 4, right: 8, left: 0, bottom: 20 }} barGap={2}>
            <CartesianGrid strokeDasharray="1 4" stroke="rgba(56,140,255,0.08)" vertical={false} />
            <XAxis dataKey={labelKey} tick={axStyle} angle={-30} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
            <YAxis tick={axStyle} width={48} tickFormatter={fmt} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={ttStyle} formatter={function(v) { return [fmt(v), ''] }} />
            <Legend wrapperStyle={{ fontSize: 10, color: '#3D6080' }} />
            <Bar dataKey="__original__" name="Original" fill="rgba(0,200,240,0.3)"  stroke={COLOR_ORIG}   strokeWidth={0.5} radius={[2,2,0,0]} maxBarSize={20} />
            <Bar dataKey="__whatif__"   name="Scenario" fill="rgba(155,127,227,0.4)" stroke={COLOR_WHATIF} strokeWidth={0.5} radius={[2,2,0,0]} maxBarSize={20} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

// ── Main WhatIfDrawer ─────────────────────────────────────────────────────────
export default function WhatIfDrawer({ query, metadata, isOpen, onClose }) {
  // Scenario state
  var [field,          setField]          = useState('')
  var [changeType,     setChangeType]     = useState('percent')
  var [changeValue,    setChangeValue]    = useState(0)
  var [useDimension,   setUseDimension]   = useState(false)
  var [dimension,      setDimension]      = useState('')
  var [dimensionValue, setDimensionValue] = useState('')

  // Result state
  var [simState,      setSimState]      = useState('idle')   // idle | loading | done | error
  var [simResult,     setSimResult]     = useState(null)
  var [simError,      setSimError]      = useState('')

  // Debounce ref
  var debounceRef = useRef(null)

  // Derive available KPI fields from metadata
  var kpiFields = (metadata || []).filter(function(m) {
    return m.type === 'kpi' || m.type === 'derived_kpi'
  })
  var dimFields = (metadata || []).filter(function(m) {
    return m.type === 'dimension'
  })

  // Reset when drawer opens
  useEffect(function() {
    if (isOpen) {
      setSimState('idle')
      setSimResult(null)
      setSimError('')
      setChangeValue(0)
      setUseDimension(false)
      setDimension('')
      setDimensionValue('')
      // Pre-select first KPI that matches the chart's SQL
      if (kpiFields.length) {
        var sqlLower = (query.sql || '').toLowerCase()
        var match = kpiFields.find(function(f) {
          return sqlLower.includes("'" + f.field_name.toLowerCase() + "'")
        })
        setField((match || kpiFields[0]).field_name)
      }
    }
  }, [isOpen])

  // Run simulation
  var runSimulation = useCallback(function(fieldVal, changeTypeVal, changeValueVal, useDimVal, dimVal, dimValueVal) {
    if (!fieldVal || changeValueVal === 0) {
      setSimState('idle')
      setSimResult(null)
      return
    }

    setSimState('loading')
    setSimResult(null)
    setSimError('')

    var scenario = {
      field:          fieldVal,
      changeType:     changeTypeVal,
      changeValue:    changeValueVal,
      dimension:      useDimVal ? dimVal : null,
      dimensionValue: useDimVal ? dimValueVal : null,
    }

    fetch('/api/whatif', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalQuery: query, scenario: scenario }),
    })
      .then(function(res) { return res.json() })
      .then(function(json) {
        if (json.error) throw new Error(json.error)
        setSimResult(json)
        setSimState('done')
      })
      .catch(function(err) {
        setSimError(err.message)
        setSimState('error')
      })
  }, [query])

  // Debounced trigger when slider moves
  function triggerDebounced(fieldVal, changeTypeVal, changeValueVal, useDimVal, dimVal, dimValueVal) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(function() {
      runSimulation(fieldVal, changeTypeVal, changeValueVal, useDimVal, dimVal, dimValueVal)
    }, 500)
  }

  function handleSliderChange(v) {
    var val = parseFloat(v)
    setChangeValue(val)
    triggerDebounced(field, changeType, val, useDimension, dimension, dimensionValue)
  }

  function handleFieldChange(v) {
    setField(v)
    triggerDebounced(v, changeType, changeValue, useDimension, dimension, dimensionValue)
  }

  function handleChangeTypeChange(v) {
    setChangeType(v)
    triggerDebounced(field, v, changeValue, useDimension, dimension, dimensionValue)
  }

  function handleDimToggle(checked) {
    setUseDimension(checked)
    triggerDebounced(field, changeType, changeValue, checked, dimension, dimensionValue)
  }

  function handleDimChange(v) {
    setDimension(v)
    triggerDebounced(field, changeType, changeValue, useDimension, v, dimensionValue)
  }

  function handleDimValueChange(v) {
    setDimensionValue(v)
    triggerDebounced(field, changeType, changeValue, useDimension, dimension, v)
  }

  if (!isOpen) return null

  var selectedMeta = kpiFields.find(function(f) { return f.field_name === field })
  var unit         = selectedMeta ? (selectedMeta.unit || '') : (query.unit || '')

  var sliderMin = changeType === 'percent' ? -50 : -1000
  var sliderMax = changeType === 'percent' ?  50 :  1000
  var sliderStep = changeType === 'percent' ? 1 : 10

  var labelText = changeType === 'percent'
    ? (changeValue >= 0 ? '+' : '') + changeValue + '%'
    : (changeValue >= 0 ? '+' : '') + fmt(changeValue) + (unit ? ' ' + unit : '')

  var delta = simResult && simResult.delta

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 420, zIndex: 201,
        background: 'var(--bg)',
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-24px 0 80px rgba(0,0,0,0.4)',
        overflowY: 'auto',
      }}>

        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(90deg, rgba(155,127,227,0.08) 0%, transparent 70%)',
          position: 'relative', flexShrink: 0,
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, #9B7FE3, transparent)', opacity: 0.5 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.02em' }}>
                What-if Simulator
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--font-body)' }}>
                {query.title}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 6,
                border: '1px solid var(--border)', background: 'none',
                color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all var(--transition)',
              }}
              onMouseEnter={function(e) { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={function(e) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
            >✕</button>
          </div>
        </div>

        {/* Controls */}
        <div style={{ padding: '20px 24px', flexShrink: 0 }}>

          {/* Field selector */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', display: 'block', marginBottom: 8 }}>
              KPI to adjust
            </label>
            <select
              value={field}
              onChange={function(e) { handleFieldChange(e.target.value) }}
              style={{
                width: '100%', padding: '8px 12px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text-primary)',
                fontSize: 12, fontFamily: 'var(--font-body)',
                cursor: 'pointer', outline: 'none',
              }}
            >
              {kpiFields.map(function(f) {
                return <option key={f.field_name} value={f.field_name}>{f.display_name || f.field_name}</option>
              })}
            </select>
            {selectedMeta && selectedMeta.definition && (
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', marginTop: 5, lineHeight: 1.5 }}>
                {selectedMeta.definition}
              </p>
            )}
          </div>

          {/* Change type toggle */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', display: 'block', marginBottom: 8 }}>
              Change type
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['percent', 'absolute'].map(function(ct) {
                var active = changeType === ct
                return (
                  <button
                    key={ct}
                    onClick={function() { handleChangeTypeChange(ct) }}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 6,
                      border: '1px solid ' + (active ? 'rgba(155,127,227,0.5)' : 'var(--border)'),
                      background: active ? 'rgba(155,127,227,0.12)' : 'var(--surface)',
                      color: active ? '#9B7FE3' : 'var(--text-secondary)',
                      fontSize: 11, fontFamily: 'var(--font-body)', cursor: 'pointer',
                      transition: 'all var(--transition)',
                    }}
                  >
                    {ct === 'percent' ? '% Change' : 'Absolute'}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Slider */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                Adjustment
              </label>
              <span style={{
                fontSize: 16, fontWeight: 600,
                color: changeValue > 0 ? '#10C48A' : changeValue < 0 ? '#E05555' : 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em',
                transition: 'color 0.2s',
              }}>
                {labelText}
              </span>
            </div>

            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              step={sliderStep}
              value={changeValue}
              onChange={function(e) { handleSliderChange(e.target.value) }}
              style={{ width: '100%', cursor: 'pointer', accentColor: '#9B7FE3' }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {changeType === 'percent' ? '-50%' : fmt(sliderMin)}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>0</span>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {changeType === 'percent' ? '+50%' : fmt(sliderMax)}
              </span>
            </div>
          </div>

          {/* Dimension filter (optional) */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8, padding: '12px 14px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: useDimension ? 12 : 0 }}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                Limit to specific segment
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={useDimension}
                  onChange={function(e) { handleDimToggle(e.target.checked) }}
                  style={{ accentColor: '#9B7FE3', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>Enable</span>
              </label>
            </div>

            {useDimension && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <select
                  value={dimension}
                  onChange={function(e) { handleDimChange(e.target.value) }}
                  style={{
                    width: '100%', padding: '7px 10px',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 5, color: 'var(--text-primary)',
                    fontSize: 11, fontFamily: 'var(--font-body)', cursor: 'pointer', outline: 'none',
                  }}
                >
                  <option value="">Select dimension...</option>
                  {dimFields.map(function(d) {
                    return <option key={d.field_name} value={d.field_name}>{d.display_name || d.field_name}</option>
                  })}
                </select>
                <input
                  type="text"
                  placeholder="Segment value (e.g. North)"
                  value={dimensionValue}
                  onChange={function(e) { handleDimValueChange(e.target.value) }}
                  style={{
                    width: '100%', padding: '7px 10px', boxSizing: 'border-box',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 5, color: 'var(--text-primary)',
                    fontSize: 11, fontFamily: 'var(--font-body)', outline: 'none',
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div style={{ padding: '0 24px 24px', flex: 1 }}>

          {simState === 'idle' && (
            <div style={{
              padding: '32px 0', textAlign: 'center',
              border: '1px dashed var(--border)', borderRadius: 8,
            }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>⟳</p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                Move the slider to run a scenario
              </p>
            </div>
          )}

          {simState === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[90, 70, 85, 60].map(function(w, i) {
                return <div key={i} className="skeleton" style={{ height: 10, width: w + '%', borderRadius: 2 }} />
              })}
            </div>
          )}

          {simState === 'error' && (
            <div style={{
              background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.2)',
              borderRadius: 6, padding: '12px 14px',
            }}>
              <p style={{ fontSize: 11, color: '#E05555', fontFamily: 'var(--font-body)' }}>{simError}</p>
            </div>
          )}

          {simState === 'done' && simResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Delta summary */}
              {delta && (
                <div style={{
                  background: 'rgba(155,127,227,0.06)',
                  border: '1px solid rgba(155,127,227,0.2)',
                  borderRadius: 8, padding: '14px 16px',
                }}>
                  <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9B7FE3', fontFamily: 'var(--font-body)', marginBottom: 10 }}>
                    Scenario impact
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <p style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Original</p>
                      <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                        {fmt(delta.current_original)}
                        {unit && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4, fontFamily: 'var(--font-body)' }}>{unit}</span>}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: 9, color: '#9B7FE3', fontFamily: 'var(--font-body)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scenario</p>
                      <p style={{ fontSize: 18, fontWeight: 600, color: '#9B7FE3', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                        {fmt(delta.current_whatif)}
                        {unit && <span style={{ fontSize: 11, color: 'rgba(155,127,227,0.6)', marginLeft: 4, fontFamily: 'var(--font-body)' }}>{unit}</span>}
                      </p>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>Net impact:</p>
                    <DeltaPill diff={delta.current_diff} diffPct={delta.current_diff_pct} unit={unit} />
                  </div>
                </div>
              )}

              {/* Comparison chart */}
              <ComparisonChart
                originalData={simResult.originalData}
                whatifData={simResult.whatifData}
                query={query}
              />

              {/* Scenario description */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6, padding: '10px 14px',
              }}>
                <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', marginBottom: 6 }}>
                  Scenario applied
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                  {selectedMeta ? selectedMeta.display_name : field}
                  {' '}
                  {changeType === 'percent'
                    ? (changeValue >= 0 ? 'increased by ' : 'decreased by ') + Math.abs(changeValue) + '%'
                    : (changeValue >= 0 ? 'increased by ' : 'decreased by ') + fmt(Math.abs(changeValue)) + (unit ? ' ' + unit : '')}
                  {useDimension && dimension && dimensionValue
                    ? ' in ' + dimensionValue + ' (' + dimension + ')'
                    : ' across all segments'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
