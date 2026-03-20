'use client'

import { useState, useEffect, useRef } from 'react'
import { SETUP_MODE, APP_NAME, APP_TAGLINE } from '../lib/app-config'

var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

var COMPARISON_OPTIONS = {
  YTD: [{ value: 'YoY', label: 'YoY' }],
  QTD: [{ value: 'YoY', label: 'YoY' }, { value: 'QoQ', label: 'QoQ' }],
  MTD: [{ value: 'YoY', label: 'YoY' }, { value: 'MoM', label: 'MoM' }],
}

// Given year_month rows from metadata, detect available year+month field pairs.
// Pairs are matched by naming convention: Report_Year↔Report_Month, Fiscal_Year↔Fiscal_Month etc.
// Falls back to any single year_month field used for both if no pair is found.
function detectPeriodPairs(ymRows) {
  var yearFields  = ymRows.filter(function(r) { return /year/i.test(r.field_name) && !/month|qtr|quarter/i.test(r.field_name) })
  var monthFields = ymRows.filter(function(r) { return /month/i.test(r.field_name) && !/year/i.test(r.field_name) })

  var pairs = []

  yearFields.forEach(function(yRow) {
    // Extract prefix: Report_Year → Report, Fiscal_Year → Fiscal
    var prefix = yRow.field_name.replace(/_?year/i, '').replace(/^_|_$/,'')
    // Find matching month field with same prefix
    var mRow = monthFields.find(function(m) {
      var mPrefix = m.field_name.replace(/_?month/i, '').replace(/^_|_$/,'')
      return mPrefix.toLowerCase() === prefix.toLowerCase()
    })
    if (mRow) {
      pairs.push({
        label:      (prefix || 'Default') + ' period',
        yearField:  yRow.field_name,
        monthField: mRow.field_name,
        yearDisplay:  yRow.display_name || yRow.field_name,
        monthDisplay: mRow.display_name || mRow.field_name,
      })
    }
  })

  // Fallback: if no pairs matched but we have year/month fields, use first available
  if (!pairs.length && yearFields.length && monthFields.length) {
    pairs.push({
      label:      'Default period',
      yearField:  yearFields[0].field_name,
      monthField: monthFields[0].field_name,
      yearDisplay:  yearFields[0].display_name || yearFields[0].field_name,
      monthDisplay: monthFields[0].display_name || monthFields[0].field_name,
    })
  }

  // Final fallback: legacy datasets without year_month type — use 'year'/'month'
  if (!pairs.length) {
    pairs.push({ label: 'Default period', yearField: 'year', monthField: 'month', yearDisplay: 'year', monthDisplay: 'month' })
  }

  return pairs
}

// Build list of months for the slider: 2 years back to current month
var TODAY      = new Date()
var SLIDER_MONTHS = []
for (var si = 23; si >= 0; si--) {
  var sd = new Date(TODAY.getFullYear(), TODAY.getMonth() - si, 1)
  SLIDER_MONTHS.push({ year: sd.getFullYear(), month: sd.getMonth() + 1 })
}
var SLIDER_DEFAULT = SLIDER_MONTHS.length - 1  // latest month

export function SetupScreenDev({ onReady }) {
  var [datasets,     setDatasets]     = useState([])
  var [metaSets,     setMetaSets]     = useState([])
  var [loadingLists, setLoadingLists] = useState(true)
  var [dataMode,     setDataMode]     = useState('existing')
  var [metaMode,     setMetaMode]     = useState('existing')
  var [selDataset,   setSelDataset]   = useState('')
  var [selMeta,      setSelMeta]      = useState('')
  var [dataFile,     setDataFile]     = useState(null)
  var [metaFile,     setMetaFile]     = useState(null)
  var [dataName,     setDataName]     = useState('')
  var [metaName,     setMetaName]     = useState('')
  var [viewType,     setViewType]     = useState('YTD')
  var [sliderIdx,    setSliderIdx]    = useState(SLIDER_DEFAULT)
  var [compType,     setCompType]     = useState('YoY')
  var [working,      setWorking]      = useState(false)
  var [progress,     setProgress]     = useState('')
  var [error,        setError]        = useState('')
  var [periodPairs,  setPeriodPairs]  = useState([])
  var [selPairIdx,   setSelPairIdx]   = useState(0)
  // Panel preferences — all on by default
  var [prefs, setPrefs] = useState({ decisions: true, summary: true, forecast: true, queryInspector: true, coveragePanel: true })
  // User context — uncontrolled textarea (ref) to avoid re-render on every keystroke
  var contextRef = useRef()
  var [extracting,   setExtracting]   = useState(false)
  var [extracted,    setExtracted]    = useState(null)   // { filters, kpi_focus, explanation }
  var [showConfirm,  setShowConfirm]  = useState(false)
  var dataRef = useRef(); var metaRef = useRef()

  // Derive selYear and selMonth from slider index
  var selYearMonth = SLIDER_MONTHS[sliderIdx] || SLIDER_MONTHS[SLIDER_DEFAULT]
  var selYear  = selYearMonth.year
  var selMonth = selYearMonth.month

  useEffect(function() { loadLists() }, [])
  useEffect(function() {
    var allowed = COMPARISON_OPTIONS[viewType] || []
    var valid = allowed.some(function(o) { return o.value === compType })
    if (!valid && allowed.length > 0) setCompType(allowed[0].value)
  }, [viewType])

  // When metadata selection changes, fetch year_month fields to build period pairs
  useEffect(function() {
    var metaId = metaMode === 'existing' ? selMeta : null
    if (!metaId) { setPeriodPairs([]); setSelPairIdx(0); return }
    fetch('/api/metadata-fields?metadataSetId=' + metaId + '&type=year_month')
      .then(function(r) { return r.json() })
      .then(function(j) {
        var pairs = detectPeriodPairs(j.fields || [])
        setPeriodPairs(pairs)
        setSelPairIdx(0)
      })
      .catch(function() { setPeriodPairs([]); setSelPairIdx(0) })
  }, [selMeta, metaMode])

  async function loadLists() {
    setLoadingLists(true)
    try {
      var r1 = await fetch('/api/datasets'); var r2 = await fetch('/api/metadata-sets')
      var d1 = await r1.json(); var d2 = await r2.json()
      var ds = d1.datasets || []; var ms = d2.metadataSets || []
      setDatasets(ds); setMetaSets(ms)
      if (ds.length === 0) setDataMode('upload'); else setSelDataset(String(ds[0].id))
      if (ms.length === 0) setMetaMode('upload'); else setSelMeta(String(ms[0].id))
    } catch (e) { setError('Could not connect to database.') }
    setLoadingLists(false)
  }

  async function handleBuild() {
    setError('')
    var contextText = (contextRef.current && contextRef.current.value) || ''
    // If context entered and confirmation not yet shown — extract first
    if (contextText.trim() && !showConfirm) {
      setExtracting(true)
      try {
        var metaId = metaMode === 'existing' ? selMeta : null
        var metaForCtx = []
        if (metaId) {
          var mfr = await fetch('/api/metadata-fields?metadataSetId=' + metaId)
          var mfj = await mfr.json()
          metaForCtx = mfj.fields || []
        }
        var res = await fetch('/api/extract-context', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contextText: contextText.trim(), metadata: metaForCtx }),
        })
        var j = await res.json()
        if (j.error) throw new Error(j.error)
        setExtracted(j)
        setShowConfirm(true)
      } catch(err) { setError('Context extraction failed: ' + err.message) }
      setExtracting(false)
      return
    }
    await doBuild(showConfirm ? extracted : null)
  }

  async function doBuild(userContext) {
    setShowConfirm(false)
    setError(''); var finalDatasetId = selDataset; var finalMetaId = selMeta; setWorking(true)
    try {
      if (dataMode === 'upload') {
        if (!dataFile) { setError('Please select a data file.'); setWorking(false); return }
        setProgress('Uploading dataset...')
        var fd = new FormData(); fd.append('file', dataFile); fd.append('name', dataName || dataFile.name)
        var dr = await fetch('/api/upload-dataset', { method: 'POST', body: fd }); var dj = await dr.json()
        if (!dr.ok) throw new Error(dj.error || 'Dataset upload failed.')
        finalDatasetId = String(dj.dataset.id); await loadLists()
      }
      if (metaMode === 'upload') {
        if (!metaFile) { setError('Please select a metadata file.'); setWorking(false); return }
        setProgress('Saving metadata...')
        var mf2 = new FormData(); mf2.append('file', metaFile); mf2.append('name', metaName || metaFile.name)
        var mr = await fetch('/api/save-metadata', { method: 'POST', body: mf2 }); var mj = await mr.json()
        if (!mr.ok) throw new Error(mj.error || 'Metadata save failed.')
        finalMetaId = String(mj.metadataSet.id)
        var mfRes = await fetch('/api/metadata-fields?metadataSetId=' + finalMetaId + '&type=year_month')
        var mfJson = await mfRes.json()
        var newPairs = detectPeriodPairs(mfJson.fields || [])
        setPeriodPairs(newPairs); setSelPairIdx(0)
        await loadLists()
      }
      var activePairs = periodPairs.length ? periodPairs : [{ yearField: 'year', monthField: 'month' }]
      var chosenPair  = activePairs[selPairIdx] || activePairs[0]
      setProgress('Composing intelligence queries...')
      var timePeriod = {
        viewType, year: selYear, month: selMonth, comparisonType: compType,
        yearField: chosenPair.yearField, monthField: chosenPair.monthField,
      }
      var gqRes = await fetch('/api/generate-queries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: finalDatasetId, metadataSetId: finalMetaId, timePeriod, userContext: userContext || null }),
      })
      var gqJson = await gqRes.json()
      if (!gqRes.ok) throw new Error(gqJson.error || 'Failed to generate queries.')
      setProgress('Executing ' + (gqJson.queries ? gqJson.queries.length : '') + ' queries...')
      var rqRes = await fetch('/api/run-queries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries: gqJson.queries }) })
      var rqJson = await rqRes.json()
      if (!rqRes.ok) throw new Error(rqJson.error || 'Failed to run queries.')
      onReady({
        datasetId: finalDatasetId, metadataSetId: finalMetaId,
        queries: gqJson.queries, queryResults: rqJson.results,
        metadata: gqJson.metadata, timePeriod, periodInfo: gqJson.periodInfo,
        initialUsage: gqJson.usage || null,
        userContext: userContext || null,
        coverageData: gqJson.coverageData || null,
        preferences: prefs,
      })
    } catch (err) { setError(err.message); setWorking(false); setProgress('') }
  }

  var canBuild = !working && (dataMode === 'existing' ? !!selDataset : !!dataFile) && (metaMode === 'existing' ? !!selMeta : !!metaFile)
  var allowedComp = COMPARISON_OPTIONS[viewType] || []
  var activePair = (periodPairs[selPairIdx] || periodPairs[0])
  var previewLabel = viewType + ' · ' + MONTH_NAMES[selMonth-1] + ' ' + selYear + ' · vs ' + compType + (activePair ? ' · ' + activePair.yearField : '')

  var selectStyle = {
    width: '100%', padding: '10px 14px', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', fontSize: 13, background: 'var(--surface-2)',
    color: 'var(--text-primary)', cursor: 'pointer', outline: 'none',
    fontFamily: 'var(--font-body)', appearance: 'none', WebkitAppearance: 'none',
  }
  var inputStyle = { ...selectStyle, cursor: 'text', appearance: 'auto', WebkitAppearance: 'auto', marginBottom: 10 }

  function Chip({ value, active, onClick, children }) {
    return (
      <button onClick={onClick} style={{
        padding: '6px 16px', borderRadius: 'var(--radius-sm)',
        fontSize: 12, fontWeight: 500, cursor: 'pointer',
        fontFamily: 'var(--font-body)', letterSpacing: '0.06em',
        border: '1px solid ' + (active ? 'var(--accent-border)' : 'var(--border)'),
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--text-accent)' : 'var(--text-secondary)',
        transition: 'all var(--transition)',
        boxShadow: active ? '0 0 10px rgba(0,200,240,0.08)' : 'none',
      }}>
        {children}
      </button>
    )
  }

  function FileZone({ file, onFile, refEl, placeholder }) {
    return (
      <div onClick={function() { refEl.current && refEl.current.click() }} style={{
        border: '1px dashed ' + (file ? 'var(--accent-border)' : 'var(--border)'),
        borderRadius: 'var(--radius-md)', padding: '14px 16px', cursor: 'pointer',
        background: file ? 'var(--accent-dim)' : 'transparent', transition: 'all var(--transition)',
      }}>
        <input ref={refEl} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
          onChange={function(e) { onFile(e.target.files[0] || null) }} />
        <p style={{ fontSize: 12, color: file ? 'var(--text-accent)' : 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
          {file ? file.name : placeholder}
        </p>
      </div>
    )
  }

  function SectionCard({ n, title, children }) {
    return (
      <div className={'fade-up d' + n} style={{
        background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        padding: '22px 24px', backdropFilter: 'blur(8px)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Corner bracket decorations */}
        <div style={{ position: 'absolute', top: 8, left: 8, width: 12, height: 12, borderTop: '1px solid var(--accent-border)', borderLeft: '1px solid var(--accent-border)', borderRadius: '2px 0 0 0', opacity: 0.6 }} />
        <div style={{ position: 'absolute', top: 8, right: 8, width: 12, height: 12, borderTop: '1px solid var(--accent-border)', borderRight: '1px solid var(--accent-border)', borderRadius: '0 2px 0 0', opacity: 0.6 }} />
        {/* Top line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', opacity: 0.2 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
            border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-dim)',
          }}>
            <span style={{ fontSize: 10, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)', fontWeight: 400 }}>{n}</span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.02em' }}>{title}</p>
        </div>
        {children}
      </div>
    )
  }

  function ModeToggle({ mode, setMode, hasExisting }) {
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        {hasExisting && (
          <button onClick={function() { setMode('existing') }} style={{
            padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-body)', letterSpacing: '0.04em',
            border: '1px solid ' + (mode === 'existing' ? 'var(--accent-border)' : 'var(--border)'),
            background: mode === 'existing' ? 'var(--accent-dim)' : 'transparent',
            color: mode === 'existing' ? 'var(--text-accent)' : 'var(--text-tertiary)',
          }}>Existing</button>
        )}
        <button onClick={function() { setMode('upload') }} style={{
          padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-body)', letterSpacing: '0.04em',
          border: '1px solid ' + (mode === 'upload' ? 'var(--accent-border)' : 'var(--border)'),
          background: mode === 'upload' ? 'var(--accent-dim)' : 'transparent',
          color: mode === 'upload' ? 'var(--text-accent)' : 'var(--text-tertiary)',
        }}>Upload new</button>
      </div>
    )
  }

  if (loadingLists) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 54px)' }}>
        <div style={{ textAlign: 'center' }}>
          <span className="spinner" />
          <p style={{ marginTop: 16, color: 'var(--text-tertiary)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-body)' }}>Connecting</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 54px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>

      {/* Hero */}
      <div className="fade-up" style={{ textAlign: 'center', maxWidth: 500, marginBottom: 44 }}>
        <p style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-accent)', marginBottom: 16, fontFamily: 'var(--font-body)', fontWeight: 500 }}>
          {APP_NAME} · Developer Mode
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.15, color: 'var(--text-primary)', marginBottom: 14 }}>
          Configure Intelligence
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
          Select your data sources, time horizon and context. The AI agent composes your intelligence.
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Dataset */}
        <SectionCard n="1" title="Dataset">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Main data file — .xlsx, .xls or .csv</p>
            <ModeToggle mode={dataMode} setMode={setDataMode} hasExisting={datasets.length > 0} />
          </div>
          {dataMode === 'existing' && datasets.length > 0 && (
            <select value={selDataset} onChange={function(e) { setSelDataset(e.target.value) }} style={selectStyle}>
              {datasets.map(function(d) { return <option key={d.id} value={String(d.id)}>{d.name} — {d.row_count} rows</option> })}
            </select>
          )}
          {dataMode === 'upload' && (
            <>
              <input type="text" placeholder="Dataset name (optional)" value={dataName} onChange={function(e) { setDataName(e.target.value) }} style={inputStyle} />
              <FileZone file={dataFile} onFile={setDataFile} refEl={dataRef} placeholder="Select .xlsx or .csv file" />
            </>
          )}
        </SectionCard>

        {/* Metadata */}
        <SectionCard n="2" title="Metadata">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Field definitions — required: field_name, type, display_name</p>
            <ModeToggle mode={metaMode} setMode={setMetaMode} hasExisting={metaSets.length > 0} />
          </div>
          {metaMode === 'existing' && metaSets.length > 0 && (
            <select value={selMeta} onChange={function(e) { setSelMeta(e.target.value) }} style={selectStyle}>
              {metaSets.map(function(m) { return <option key={m.id} value={String(m.id)}>{m.name}</option> })}
            </select>
          )}
          {metaMode === 'upload' && (
            <>
              <input type="text" placeholder="Metadata name (optional)" value={metaName} onChange={function(e) { setMetaName(e.target.value) }} style={inputStyle} />
              <FileZone file={metaFile} onFile={setMetaFile} refEl={metaRef} placeholder="Select metadata .xlsx or .csv file" />
            </>
          )}
        </SectionCard>

        {/* Time Period */}
        <SectionCard n="3" title="Time Period">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 18 }}>
            <div>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontFamily: 'var(--font-body)' }}>View</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {['MTD','YTD','QTD'].map(function(v) { return <Chip key={v} active={viewType===v} onClick={function() { setViewType(v) }}>{v}</Chip> })}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontFamily: 'var(--font-body)' }}>Compare</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {allowedComp.map(function(opt) { return <Chip key={opt.value} active={compType===opt.value} onClick={function() { setCompType(opt.value) }}>{opt.value}</Chip> })}
              </div>
            </div>
          </div>

          {/* As-of date slider */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-body)' }}>As-of date</p>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)' }}>
                {MONTH_NAMES[selMonth - 1]} {selYear}
              </span>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="range"
                min={0}
                max={SLIDER_MONTHS.length - 1}
                value={sliderIdx}
                onChange={function(e) { setSliderIdx(parseInt(e.target.value)) }}
                style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  {MONTH_NAMES[SLIDER_MONTHS[0].month - 1].slice(0,3)} {SLIDER_MONTHS[0].year}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  {MONTH_NAMES[SLIDER_MONTHS[SLIDER_MONTHS.length - 1].month - 1].slice(0,3)} {SLIDER_MONTHS[SLIDER_MONTHS.length - 1].year}
                </span>
              </div>
            </div>
          </div>

          {/* Period field selector — only shown when multiple pairs exist */}
          {periodPairs.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontFamily: 'var(--font-body)' }}>
                Period calendar to use
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {periodPairs.map(function(pair, idx) {
                  return (
                    <Chip key={idx} active={selPairIdx === idx} onClick={function() { setSelPairIdx(idx) }}>
                      {pair.label}
                    </Chip>
                  )
                })}
              </div>
              {activePair && (
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                  Using: {activePair.yearField} + {activePair.monthField}
                </p>
              )}
            </div>
          )}

          <div style={{ padding: '10px 14px', background: 'var(--accent-dim)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)', flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              {previewLabel}
            </p>
          </div>
        </SectionCard>

        {/* Section 3: User Context */}
        <SectionCard n="3" title={<>Your context <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginLeft: 6, verticalAlign: 'middle' }}>optional</span></>}>
          <textarea
            ref={contextRef}
            defaultValue=""
            placeholder={'e.g. "I am head of West Region and my focus is on Revenue"\n     "Show me only Corporate segment performance"'}
            style={{
              width: '100%', minHeight: 72, padding: '10px 12px',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
              fontSize: 12, fontFamily: 'var(--font-body)', resize: 'vertical',
              outline: 'none', lineHeight: 1.6,
            }}
            onFocus={function(e) { e.target.style.borderColor = 'var(--accent-border)' }}
            onBlur={function(e) { e.target.style.borderColor = 'var(--border)' }}
          />
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
            The LLM will extract <span style={{ color: 'var(--text-accent)' }}>dimension filters</span> (e.g. Region = West) and <span style={{ color: 'var(--text-accent)' }}>KPI focus</span> from your description. You'll confirm before building.
          </p>
        </SectionCard>

        {/* Confirmation modal — shown after context extraction */}
        {showConfirm && extracted && (
          <div className="fade-in" style={{
            background: 'var(--surface)', border: '1px solid var(--accent-border)',
            borderRadius: 'var(--radius-lg)', padding: '20px 22px', marginBottom: 0,
            backdropFilter: 'blur(8px)',
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14, fontFamily: 'var(--font-display)' }}>
              Confirm dashboard context
            </p>

            {extracted.filters && extracted.filters.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Filters applied</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {extracted.filters.map(function(f, i) {
                    return (
                      <span key={i} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', color: 'var(--text-accent)', fontFamily: 'var(--font-mono)' }}>
                        {f.display || (f.field + ' ' + f.operator + ' ' + f.value)}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {extracted.kpi_focus && extracted.kpi_focus.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, fontFamily: 'var(--font-body)' }}>KPI focus (prioritised)</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {extracted.kpi_focus.map(function(k, i) {
                    return (
                      <span key={i} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'rgba(16,196,138,0.1)', border: '1px solid rgba(16,196,138,0.3)', color: '#10C48A', fontFamily: 'var(--font-mono)' }}>
                        {k}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {extracted.explanation && (
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                {extracted.explanation}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={function() { doBuild(extracted) }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, rgba(0,200,240,0.15) 0%, rgba(43,127,227,0.1) 100%)',
                  border: '1px solid var(--accent-border)', color: 'var(--text-accent)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)',
                  letterSpacing: '0.06em',
                }}
              >Build with this context</button>
              <button
                onClick={function() { setShowConfirm(false); setExtracted(null); if (contextRef.current) contextRef.current.value = ''; doBuild(null) }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                  fontFamily: 'var(--font-display)', letterSpacing: '0.06em',
                }}
              >Reset &amp; build without</button>
            </div>
          </div>
        )}

        {/* Section 4: Dashboard Panels */}
        <SectionCard n="4" title="Dashboard panels">
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
            Choose which panels appear on your dashboard.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { key: 'decisions',     label: 'Generate Decisions',  desc: 'AI-ranked actions and health scores' },
              { key: 'summary',       label: 'Generate Summary',    desc: 'Executive narrative report' },
              { key: 'forecast',      label: 'Trend Explorer',      desc: 'Interactive KPI trends and forecasts' },
              { key: 'queryInspector',label: 'Query Inspector',     desc: 'View and copy all generated SQL' },
              { key: 'coveragePanel', label: 'Coverage Report',     desc: 'Why certain KPIs or charts were skipped' },
            ].map(function(item) {
              var on = prefs[item.key] !== false
              return (
                <div
                  key={item.key}
                  onClick={function() { setPrefs(function(p) { var n = Object.assign({}, p); n[item.key] = !on; return n }) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid ' + (on ? 'var(--accent-border)' : 'var(--border)'), background: on ? 'var(--accent-dim)' : 'transparent', cursor: 'pointer', transition: 'all var(--transition)' }}
                >
                  {/* Toggle pill */}
                  <div style={{ width: 32, height: 18, borderRadius: 9, background: on ? 'var(--accent)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background var(--transition)' }}>
                    <div style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left var(--transition)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, color: on ? 'var(--text-accent)' : 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginBottom: 1 }}>{item.label}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>{item.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>

        {/* Build */}
        <div className="fade-up d4">
          <button
            onClick={handleBuild}
            disabled={!canBuild || extracting}
            style={{
              width: '100%', padding: '14px 24px',
              background: canBuild
                ? 'linear-gradient(135deg, rgba(0,200,240,0.15) 0%, rgba(43,127,227,0.1) 100%)'
                : 'transparent',
              border: '1px solid ' + (canBuild ? 'var(--accent-border)' : 'var(--border)'),
              borderRadius: 'var(--radius-md)',
              fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: canBuild ? 'var(--text-accent)' : 'var(--text-tertiary)',
              cursor: canBuild ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              fontFamily: 'var(--font-display)', transition: 'all var(--transition)',
              boxShadow: canBuild ? '0 0 20px rgba(0,200,240,0.06)' : 'none',
            }}
          >
            {extracting
              ? <><span className="spinner" /><span style={{ fontSize: 12 }}>Analysing context...</span></>
              : working
                ? <><span className="spinner" /><span style={{ fontSize: 12 }}>{progress || 'Processing...'}</span></>
                : showConfirm ? 'Confirm above to proceed' : 'Generate Intelligence'
            }
          </button>

          {error && (
            <p style={{ marginTop: 10, fontSize: 12, color: 'var(--red-text)', background: 'var(--red-light)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(224,85,85,0.2)' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Production wizard ─────────────────────────────────────────────────────────

function WizardCard({ children, style }) {
  return (
    <div style={Object.assign({
      background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '36px 40px',
      width: '100%',
      maxWidth: 520,
      backdropFilter: 'blur(8px)',
      position: 'relative',
      overflow: 'hidden',
    }, style)}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', opacity: 0.3 }} />
      {children}
    </div>
  )
}

function ToggleRow({ item, on, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid ' + (on ? 'var(--accent-border)' : 'var(--border)'), background: on ? 'var(--accent-dim)' : 'transparent', cursor: 'pointer', transition: 'all var(--transition)', marginBottom: 8 }}
    >
      <div style={{ width: 32, height: 18, borderRadius: 9, background: on ? 'var(--accent)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background var(--transition)' }}>
        <div style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left var(--transition)' }} />
      </div>
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: on ? 'var(--text-accent)' : 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginBottom: 1 }}>{item.label}</p>
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>{item.desc}</p>
      </div>
    </div>
  )
}

export function SetupScreenProd({ onReady }) {
  var [step,         setStep]         = useState(0)  // 0=splash, 1=data+time, 2=context+panels
  var [animating,    setAnimating]    = useState(false)
  var [slideDir,     setSlideDir]     = useState('left')

  // Shared state — same as dev mode
  var [datasets,     setDatasets]     = useState([])
  var [metaSets,     setMetaSets]     = useState([])
  var [loadingLists, setLoadingLists] = useState(true)
  var [dataMode,     setDataMode]     = useState('existing')
  var [metaMode,     setMetaMode]     = useState('existing')
  var [selDataset,   setSelDataset]   = useState('')
  var [selMeta,      setSelMeta]      = useState('')
  var [dataFile,     setDataFile]     = useState(null)
  var [metaFile,     setMetaFile]     = useState(null)
  var [dataName,     setDataName]     = useState('')
  var [metaName,     setMetaName]     = useState('')
  var [viewType,     setViewType]     = useState('YTD')
  var [sliderIdx,    setSliderIdx]    = useState(SLIDER_DEFAULT)
  var [compType,     setCompType]     = useState('YoY')
  var [periodPairs,  setPeriodPairs]  = useState([])
  var [selPairIdx,   setSelPairIdx]   = useState(0)
  var [prefs,        setPrefs]        = useState({ decisions: true, summary: true, forecast: true, queryInspector: true, coveragePanel: true })
  var [working,      setWorking]      = useState(false)
  var [progress,     setProgress]     = useState('')
  var [error,        setError]        = useState('')
  var [stepError,    setStepError]    = useState('')
  var [extracting,   setExtracting]   = useState(false)
  var [extracted,    setExtracted]    = useState(null)
  var [showConfirm,  setShowConfirm]  = useState(false)
  var contextRef = useRef()
  var dataRef = useRef(); var metaRef = useRef()

  var selYearMonth = SLIDER_MONTHS[sliderIdx] || SLIDER_MONTHS[SLIDER_DEFAULT]
  var selYear  = selYearMonth.year
  var selMonth = selYearMonth.month

  useEffect(function() { loadLists() }, [])
  useEffect(function() {
    // Auto-advance from splash after 2s
    if (step === 0) {
      var t = setTimeout(function() { goTo(1) }, 2000)
      return function() { clearTimeout(t) }
    }
  }, [step])
  useEffect(function() {
    var allowed = COMPARISON_OPTIONS[viewType] || []
    var valid = allowed.some(function(o) { return o.value === compType })
    if (!valid && allowed.length > 0) setCompType(allowed[0].value)
  }, [viewType])
  useEffect(function() {
    var metaId = metaMode === 'existing' ? selMeta : null
    if (!metaId) { setPeriodPairs([]); setSelPairIdx(0); return }
    fetch('/api/metadata-fields?metadataSetId=' + metaId)
      .then(function(r) { return r.json() })
      .then(function(j) { var pairs = detectPeriodPairs(j.fields || []); setPeriodPairs(pairs); setSelPairIdx(0) })
      .catch(function() { setPeriodPairs([]); setSelPairIdx(0) })
  }, [selMeta, metaMode])

  async function loadLists() {
    setLoadingLists(true)
    try {
      var r1 = await fetch('/api/datasets'); var r2 = await fetch('/api/metadata-sets')
      var d1 = await r1.json(); var d2 = await r2.json()
      var ds = d1.datasets || []; var ms = d2.metadataSets || []
      setDatasets(ds); setMetaSets(ms)
      if (ds.length === 0) setDataMode('upload'); else setSelDataset(String(ds[0].id))
      if (ms.length === 0) setMetaMode('upload'); else setSelMeta(String(ms[0].id))
    } catch(e) { setError('Could not connect to database.') }
    setLoadingLists(false)
  }

  function goTo(nextStep) {
    setSlideDir('left')
    setAnimating(true)
    setTimeout(function() { setStep(nextStep); setAnimating(false); setStepError('') }, 280)
  }

  function goBack() {
    setSlideDir('right')
    setAnimating(true)
    setTimeout(function() { setStep(function(s) { return s - 1 }); setAnimating(false); setStepError('') }, 280)
  }

  function handleNext() {
    // Validate step 1
    if (step === 1) {
      var dsOk = dataMode === 'existing' ? !!selDataset : !!dataFile
      var mtOk = metaMode === 'existing' ? !!selMeta    : !!metaFile
      if (!dsOk) { setStepError('Please select or upload a dataset.'); return }
      if (!mtOk) { setStepError('Please select or upload a metadata file.'); return }
    }
    goTo(step + 1)
  }

  async function handleBuild() {
    setError('')
    var contextText = (contextRef.current && contextRef.current.value) || ''
    if (contextText.trim() && !showConfirm) {
      setExtracting(true)
      try {
        var metaId = metaMode === 'existing' ? selMeta : null
        var metaForCtx = []
        if (metaId) { var mfr = await fetch('/api/metadata-fields?metadataSetId=' + metaId); var mfj = await mfr.json(); metaForCtx = mfj.fields || [] }
        var res = await fetch('/api/extract-context', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contextText: contextText.trim(), metadata: metaForCtx }) })
        var j = await res.json()
        if (j.error) throw new Error(j.error)
        setExtracted(j); setShowConfirm(true)
      } catch(err) { setError('Context extraction failed: ' + err.message) }
      setExtracting(false)
      return
    }
    await doBuild(showConfirm ? extracted : null)
  }

  async function doBuild(userContext) {
    setShowConfirm(false); setError(''); setWorking(true)
    var finalDatasetId = selDataset; var finalMetaId = selMeta
    try {
      if (dataMode === 'upload') {
        if (!dataFile) { setError('Please select a data file.'); setWorking(false); return }
        setProgress('Uploading dataset...')
        var fd = new FormData(); fd.append('file', dataFile); fd.append('name', dataName || dataFile.name)
        var dr = await fetch('/api/upload-dataset', { method: 'POST', body: fd }); var dj = await dr.json()
        if (!dr.ok) throw new Error(dj.error || 'Dataset upload failed.')
        finalDatasetId = String(dj.dataset.id); await loadLists()
      }
      if (metaMode === 'upload') {
        if (!metaFile) { setError('Please select a metadata file.'); setWorking(false); return }
        setProgress('Saving metadata...')
        var mf2 = new FormData(); mf2.append('file', metaFile); mf2.append('name', metaName || metaFile.name)
        var mr = await fetch('/api/save-metadata', { method: 'POST', body: mf2 }); var mj = await mr.json()
        if (!mr.ok) throw new Error(mj.error || 'Metadata save failed.')
        finalMetaId = String(mj.metadataSet.id); await loadLists()
      }
      var activePairs = periodPairs.length ? periodPairs : [{ yearField: 'year', monthField: 'month' }]
      var chosenPair  = activePairs[selPairIdx] || activePairs[0]
      setProgress('Composing intelligence queries...')
      var timePeriod = { viewType, year: selYear, month: selMonth, comparisonType: compType, yearField: chosenPair.yearField, monthField: chosenPair.monthField }
      var gqRes = await fetch('/api/generate-queries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datasetId: finalDatasetId, metadataSetId: finalMetaId, timePeriod, userContext: userContext || null }) })
      var gqJson = await gqRes.json()
      if (!gqRes.ok) throw new Error(gqJson.error || 'Failed to generate queries.')
      setProgress('Executing ' + (gqJson.queries ? gqJson.queries.length : '') + ' queries...')
      var rqRes = await fetch('/api/run-queries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries: gqJson.queries }) })
      var rqJson = await rqRes.json()
      if (!rqRes.ok) throw new Error(rqJson.error || 'Failed to run queries.')
      onReady({ datasetId: finalDatasetId, metadataSetId: finalMetaId, queries: gqJson.queries, queryResults: rqJson.results, metadata: gqJson.metadata, timePeriod, periodInfo: gqJson.periodInfo, initialUsage: gqJson.usage || null, userContext: userContext || null, coverageData: gqJson.coverageData || null, preferences: prefs })
    } catch(err) { setError(err.message); setWorking(false); setProgress('') }
  }

  var allowedComp  = COMPARISON_OPTIONS[viewType] || []
  var activePair   = periodPairs[selPairIdx] || periodPairs[0]
  var inputStyle   = { width: '100%', marginBottom: 8, fontSize: 12 }
  var selectStyle  = { width: '100%', fontSize: 12 }

  var cardStyle = {
    transition: 'transform 0.28s ease, opacity 0.28s ease',
    transform:  animating ? ('translateX(' + (slideDir === 'left' ? '-60px' : '60px') + ')') : 'translateX(0)',
    opacity:    animating ? 0 : 1,
  }

  // ── Splash ─────────────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div style={{ minHeight: 'calc(100vh - 54px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <WizardCard style={Object.assign({ textAlign: 'center', padding: '56px 48px' }, cardStyle)}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4, marginBottom: 28 }}>
            {[18, 12, 24, 12, 18].map(function(h, i) {
              return <div key={i} style={{ width: 4, height: h, background: i === 2 ? 'var(--accent)' : 'rgba(0,200,240,0.4)', borderRadius: 2 }} />
            })}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: 10 }}>
            {APP_NAME}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-accent)', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', marginBottom: 32 }}>
            {APP_TAGLINE}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
            {[0,1,2].map(function(i) {
              return <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === 0 ? 'var(--accent)' : 'var(--border)', transition: 'background var(--transition)' }} />
            })}
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 20, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>Loading…</p>
        </WizardCard>
      </div>
    )
  }

  // ── Step 1: Data + Time ───────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ minHeight: 'calc(100vh - 54px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <WizardCard style={cardStyle}>
          {/* Progress dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 28 }}>
            {[0,1,2].map(function(i) {
              return <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === 0 ? 'var(--accent)' : 'var(--border)' }} />
            })}
          </div>

          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Data &amp; time period</h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 24, fontFamily: 'var(--font-body)' }}>Connect your dataset and set the as-of date.</p>

          {/* Dataset */}
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Dataset</p>
          {!loadingLists && datasets.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              {['existing','upload'].map(function(m) {
                return <button key={m} onClick={function() { setDataMode(m) }} style={{ padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid ' + (dataMode===m ? 'var(--accent-border)' : 'var(--border)'), background: dataMode===m ? 'var(--accent-dim)' : 'transparent', color: dataMode===m ? 'var(--text-accent)' : 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>{m === 'existing' ? 'Existing' : 'Upload new'}</button>
              })}
            </div>
          )}
          {dataMode === 'existing'
            ? <select value={selDataset} onChange={function(e){setSelDataset(e.target.value)}} style={Object.assign({marginBottom:16},selectStyle)}>{datasets.map(function(d){return <option key={d.id} value={d.id}>{d.name}</option>})}</select>
            : <><input type="text" placeholder="Dataset name (optional)" value={dataName} onChange={function(e){setDataName(e.target.value)}} style={inputStyle} /><input ref={dataRef} type="file" accept=".csv,.xlsx" onChange={function(e){setDataFile(e.target.files[0])}} style={{marginBottom:16,fontSize:11,color:'var(--text-secondary)'}} /></>
          }

          {/* Metadata */}
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Metadata</p>
          {!loadingLists && metaSets.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              {['existing','upload'].map(function(m) {
                return <button key={m} onClick={function() { setMetaMode(m) }} style={{ padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid ' + (metaMode===m ? 'var(--accent-border)' : 'var(--border)'), background: metaMode===m ? 'var(--accent-dim)' : 'transparent', color: metaMode===m ? 'var(--text-accent)' : 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>{m === 'existing' ? 'Existing' : 'Upload new'}</button>
              })}
            </div>
          )}
          {metaMode === 'existing'
            ? <select value={selMeta} onChange={function(e){setSelMeta(e.target.value)}} style={Object.assign({marginBottom:16},selectStyle)}>{metaSets.map(function(m){return <option key={m.id} value={m.id}>{m.name}</option>})}</select>
            : <><input type="text" placeholder="Metadata name (optional)" value={metaName} onChange={function(e){setMetaName(e.target.value)}} style={inputStyle} /><input ref={metaRef} type="file" accept=".csv,.xlsx" onChange={function(e){setMetaFile(e.target.files[0])}} style={{marginBottom:16,fontSize:11,color:'var(--text-secondary)'}} /></>
          }

          {/* Time period */}
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontFamily: 'var(--font-body)' }}>Time period</p>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 5, fontFamily: 'var(--font-body)' }}>VIEW</p>
              <div style={{ display: 'flex', gap: 5 }}>
                {['MTD','YTD','QTD'].map(function(v) {
                  return <button key={v} onClick={function(){setViewType(v)}} style={{ padding: '4px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid ' + (viewType===v?'var(--accent-border)':'var(--border)'), background: viewType===v?'var(--accent-dim)':'transparent', color: viewType===v?'var(--text-accent)':'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>{v}</button>
                })}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 5, fontFamily: 'var(--font-body)' }}>COMPARE</p>
              <div style={{ display: 'flex', gap: 5 }}>
                {allowedComp.map(function(opt) {
                  return <button key={opt.value} onClick={function(){setCompType(opt.value)}} style={{ padding: '4px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid ' + (compType===opt.value?'var(--accent-border)':'var(--border)'), background: compType===opt.value?'var(--accent-dim)':'transparent', color: compType===opt.value?'var(--text-accent)':'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>{opt.value}</button>
                })}
              </div>
            </div>
          </div>

          {/* Slider */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>As-of date</p>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)' }}>{MONTH_NAMES[selMonth-1]} {selYear}</span>
            </div>
            <input type="range" min={0} max={SLIDER_MONTHS.length-1} value={sliderIdx} onChange={function(e){setSliderIdx(parseInt(e.target.value))}} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{MONTH_NAMES[SLIDER_MONTHS[0].month-1].slice(0,3)} {SLIDER_MONTHS[0].year}</span>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{MONTH_NAMES[SLIDER_MONTHS[SLIDER_MONTHS.length-1].month-1].slice(0,3)} {SLIDER_MONTHS[SLIDER_MONTHS.length-1].year}</span>
            </div>
          </div>

          {/* Period calendar */}
          {periodPairs.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5, fontFamily: 'var(--font-body)' }}>Period calendar</p>
              <div style={{ display: 'flex', gap: 5 }}>
                {periodPairs.map(function(pair, idx) {
                  return <button key={idx} onClick={function(){setSelPairIdx(idx)}} style={{ padding: '4px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid ' + (selPairIdx===idx?'var(--accent-border)':'var(--border)'), background: selPairIdx===idx?'var(--accent-dim)':'transparent', color: selPairIdx===idx?'var(--text-accent)':'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>{pair.label}</button>
                })}
              </div>
            </div>
          )}

          {stepError && <p style={{ fontSize: 11, color: 'var(--red-text)', background: 'var(--red-light)', padding: '7px 10px', borderRadius: 'var(--radius-sm)', marginBottom: 12, border: '1px solid rgba(224,85,85,0.2)' }}>{stepError}</p>}

          <button onClick={handleNext} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, rgba(0,200,240,0.15) 0%, rgba(43,127,227,0.1) 100%)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-accent)', cursor: 'pointer', fontFamily: 'var(--font-display)' }}>
            Next →
          </button>
        </WizardCard>
      </div>
    )
  }

  // ── Step 2: Context + Panels + Build ─────────────────────────────────────
  return (
    <div style={{ minHeight: 'calc(100vh - 54px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
      <WizardCard style={cardStyle}>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 28 }}>
          {[0,1,2].map(function(i) {
            return <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === 1 ? 'var(--accent)' : 'var(--border)' }} />
          })}
        </div>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Context &amp; panels</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20, fontFamily: 'var(--font-body)' }}>Optionally describe your focus. Then choose which panels to include.</p>

        {/* Context */}
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, fontFamily: 'var(--font-body)' }}>
          Your context <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 2, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>optional</span>
        </p>
        <textarea
          ref={contextRef}
          defaultValue=""
          placeholder={'e.g. "I am head of West Region and my focus is Revenue"'}
          style={{ width: '100%', minHeight: 64, padding: '9px 11px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-body)', resize: 'vertical', outline: 'none', lineHeight: 1.5, marginBottom: 16 }}
          onFocus={function(e){e.target.style.borderColor='var(--accent-border)'}}
          onBlur={function(e){e.target.style.borderColor='var(--border)'}}
        />

        {/* Confirmation */}
        {showConfirm && extracted && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--font-body)' }}>Confirm context</p>
            {extracted.filters && extracted.filters.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <p style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontFamily: 'var(--font-body)' }}>Filters</p>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {extracted.filters.map(function(f,i){ return <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', color: 'var(--text-accent)', fontFamily: 'var(--font-mono)' }}>{f.display || (f.field+' '+f.operator+' '+f.value)}</span> })}
                </div>
              </div>
            )}
            {extracted.kpi_focus && extracted.kpi_focus.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <p style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontFamily: 'var(--font-body)' }}>KPI focus</p>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {extracted.kpi_focus.map(function(k,i){ return <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(16,196,138,0.1)', border: '1px solid rgba(16,196,138,0.3)', color: '#10C48A', fontFamily: 'var(--font-mono)' }}>{k}</span> })}
                </div>
              </div>
            )}
            {extracted.explanation && <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>{extracted.explanation}</p>}
          </div>
        )}

        {/* Panel toggles */}
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontFamily: 'var(--font-body)' }}>Dashboard panels</p>
        {[
          { key: 'decisions',     label: 'Generate Decisions',  desc: 'AI-ranked actions and health scores' },
          { key: 'summary',       label: 'Generate Summary',    desc: 'Executive narrative report' },
          { key: 'forecast',      label: 'Trend Explorer',      desc: 'Interactive KPI trends and forecasts' },
          { key: 'queryInspector',label: 'Query Inspector',     desc: 'View and copy all generated SQL' },
          { key: 'coveragePanel', label: 'Coverage Report',     desc: 'Explain why KPIs or charts were skipped' },
        ].map(function(item) {
          var on = prefs[item.key] !== false
          return <ToggleRow key={item.key} item={item} on={on} onToggle={function(){ setPrefs(function(p){ var n=Object.assign({},p); n[item.key]=!on; return n }) }} />
        })}

        {error && <p style={{ fontSize: 11, color: 'var(--red-text)', background: 'var(--red-light)', padding: '7px 10px', borderRadius: 'var(--radius-sm)', marginTop: 8, marginBottom: 8, border: '1px solid rgba(224,85,85,0.2)' }}>{error}</p>}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={goBack} style={{ padding: '11px 18px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-display)' }}>← Back</button>
          <button
            onClick={handleBuild}
            disabled={working || extracting}
            style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, rgba(0,200,240,0.15) 0%, rgba(43,127,227,0.1) 100%)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', color: working||extracting ? 'var(--text-tertiary)' : 'var(--text-accent)', cursor: working||extracting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {extracting ? <><span className="spinner" /> Analysing context…</>
            : working   ? <><span className="spinner" /> {progress || 'Processing…'}</>
            : showConfirm ? 'Build with this context →'
            : 'Generate Intelligence →'}
          </button>
        </div>
      </WizardCard>
    </div>
  )
}

// ── Default export — routes to correct mode based on app-config ───────────────
export default function SetupScreen({ onReady }) {
  if (SETUP_MODE === 'dev') return <SetupScreenDev onReady={onReady} />
  return <SetupScreenProd onReady={onReady} />
}
