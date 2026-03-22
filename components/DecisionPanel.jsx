'use client'

import { useEffect, useState } from 'react'

// ── Colour helpers ────────────────────────────────────────────────────────────
function urgencyStyle(urgency) {
  if (urgency === 'high')   return { bg: 'rgba(224,85,85,0.08)',   border: 'rgba(224,85,85,0.25)',   text: '#E05555',   dot: '#E05555' }
  if (urgency === 'medium') return { bg: 'rgba(240,160,48,0.08)',  border: 'rgba(240,160,48,0.25)',  text: '#F0A030',   dot: '#F0A030' }
  return                           { bg: 'rgba(0,200,240,0.06)',   border: 'rgba(0,200,240,0.18)',   text: '#00C8F0',   dot: '#00C8F0' }
}

function confidenceBadge(confidence) {
  if (confidence === 'high')   return { bg: 'rgba(16,196,138,0.1)',  border: 'rgba(16,196,138,0.3)',  text: '#10C48A' }
  if (confidence === 'medium') return { bg: 'rgba(240,160,48,0.1)',  border: 'rgba(240,160,48,0.3)',  text: '#F0A030' }
  return                              { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', text: '#3D6080' }
}

function effortBadge(effort) {
  if (effort === 'low')    return { bg: 'rgba(16,196,138,0.08)',  border: 'rgba(16,196,138,0.2)',  text: '#10C48A' }
  if (effort === 'medium') return { bg: 'rgba(240,160,48,0.08)',  border: 'rgba(240,160,48,0.2)',  text: '#F0A030' }
  return                          { bg: 'rgba(224,85,85,0.08)',   border: 'rgba(224,85,85,0.2)',   text: '#E05555' }
}

// ── Decision Card ─────────────────────────────────────────────────────────────
function DecisionCard({ decision, index, whatif }) {
  var [expanded, setExpanded] = useState(index === 0)
  var u  = urgencyStyle(decision.urgency)
  var c  = confidenceBadge(decision.confidence)
  var wi = whatif && whatif.find(function(w) { return w.decision_priority === decision.priority })

  return (
    <div
      className={'fade-up d' + Math.min(index + 2, 6)}
      style={{
        background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)',
        border: '1px solid ' + u.border,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        backdropFilter: 'blur(8px)',
        transition: 'border-color var(--transition)',
      }}
    >
      {/* Header row */}
      <button
        onClick={function() { setExpanded(function(v) { return !v }) }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        {/* Priority bubble */}
        <span style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
          background: u.bg, border: '1px solid ' + u.border,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 600, color: u.text, fontFamily: 'var(--font-mono)',
        }}>{decision.priority}</span>

        {/* Signal */}
        <p style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', lineHeight: 1.4 }}>
          {decision.signal}
        </p>

        {/* Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 500,
            background: u.bg, color: u.text, border: '1px solid ' + u.border,
            textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)',
          }}>{decision.urgency}</span>
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 500,
            background: c.bg, color: c.text, border: '1px solid ' + c.border,
            textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)',
          }}>{decision.confidence} conf.</span>
          <span style={{
            fontSize: 10, color: 'var(--text-tertiary)',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'var(--transition)',
            display: 'inline-block',
          }}>▾</span>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>
          {/* Recommended action — most prominent */}
          <div style={{
            background: u.bg, border: '1px solid ' + u.border,
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px', marginTop: 14, marginBottom: 12,
          }}>
            <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: u.text, fontFamily: 'var(--font-body)', marginBottom: 6 }}>
              Recommended action
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', lineHeight: 1.6, fontWeight: 500 }}>
              {decision.recommended_action}
            </p>
            {decision.owner_hint && (
              <p style={{ fontSize: 10, color: u.text, fontFamily: 'var(--font-mono)', marginTop: 6, opacity: 0.8 }}>
                Owner: {decision.owner_hint}
              </p>
            )}
          </div>

          {/* Rationale */}
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', marginBottom: 5 }}>
              Rationale
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.65 }}>
              {decision.rationale}
            </p>
          </div>

          {/* Impact if ignored */}
          <div style={{
            background: 'rgba(224,85,85,0.05)',
            border: '1px solid rgba(224,85,85,0.12)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px', marginBottom: 12,
          }}>
            <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#E05555', fontFamily: 'var(--font-body)', marginBottom: 4 }}>
              Risk if ignored
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
              {decision.impact_if_ignored}
            </p>
          </div>

          {/* What-if scenario */}
          {wi && (
            <div style={{
              background: 'rgba(43,127,227,0.06)',
              border: '1px solid rgba(43,127,227,0.18)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
            }}>
              <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#2B7FE3', fontFamily: 'var(--font-body)', marginBottom: 6 }}>
                What-if scenario
              </p>
              <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', marginBottom: 5, lineHeight: 1.5 }}>
                {wi.scenario}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
                {wi.projected_impact}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {wi.effort && (
                  <span style={{
                    fontSize: 9, padding: '2px 7px', borderRadius: 3,
                    background: effortBadge(wi.effort).bg, color: effortBadge(wi.effort).text,
                    border: '1px solid ' + effortBadge(wi.effort).border,
                    fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500,
                  }}>
                    {wi.effort} effort
                  </span>
                )}
                {wi.timeframe && (
                  <span style={{
                    fontSize: 9, padding: '2px 7px', borderRadius: 3,
                    background: 'rgba(43,127,227,0.08)', color: '#2B7FE3',
                    border: '1px solid rgba(43,127,227,0.2)',
                    fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
                  }}>
                    {wi.timeframe}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Panel Export ─────────────────────────────────────────────────────────
export default function DecisionPanel({ result, state, error }) {
  var [displayed, setDisplayed] = useState(null)

  useEffect(function() {
    if (state !== 'done' || !result) return
    setDisplayed(null)
    var t = setTimeout(function() { setDisplayed(result) }, 80)
    return function() { clearTimeout(t) }
  }, [result, state])

  return (
    <div className="fade-in" style={{
      background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      marginTop: 4,
      backdropFilter: 'blur(8px)',
    }}>
      {/* Panel header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(90deg, rgba(123,143,240,0.08) 0%, transparent 60%)',
        position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, #7B8FF0, rgba(123,143,240,0.1))', opacity: 0.5 }} />

        <div style={{
          width: 34, height: 34,
          background: 'rgba(123,143,240,0.1)',
          border: '1px solid rgba(123,143,240,0.3)',
          borderRadius: 'var(--radius-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {/* Target / crosshair icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="#7B8FF0" strokeWidth="1.2"/>
            <circle cx="8" cy="8" r="3" stroke="#7B8FF0" strokeWidth="1.2"/>
            <line x1="8" y1="2" x2="8" y2="0" stroke="#7B8FF0" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="8" y1="16" x2="8" y2="14" stroke="#7B8FF0" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="2" y1="8" x2="0" y2="8" stroke="#7B8FF0" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="16" y1="8" x2="14" y2="8" stroke="#7B8FF0" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>

        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em', fontFamily: 'var(--font-display)' }}>
            Decision Intelligence
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1, fontFamily: 'var(--font-body)' }}>
            {state === 'loading' ? 'Analysing data and generating recommendations...' : 'Ranked actions, risk signals, and what-if scenarios'}
          </p>
        </div>
      </div>

      <div style={{ padding: '20px 24px' }}>
        {/* Loading skeleton */}
        {state === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2,3].map(function(i) {
              return (
                <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className="skeleton" style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="skeleton" style={{ height: 12, width: '70%', borderRadius: 2 }} />
                    <div className="skeleton" style={{ height: 10, width: '40%', borderRadius: 2 }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Error */}
        {state === 'error' && (
          <p style={{ fontSize: 13, color: 'var(--red-text)', background: 'var(--red-light)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(224,85,85,0.2)' }}>
            {error || 'Failed to generate decisions.'}
          </p>
        )}

        {/* Content */}
        {state === 'done' && displayed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Section header */}
            {displayed.decisions && displayed.decisions.length > 0 && (
              <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', marginTop: 4, marginBottom: 2 }}>
                Prioritised decisions ({displayed.decisions.length})
              </p>
            )}

            {/* Decision cards */}
            {(displayed.decisions || []).map(function(decision, i) {
              return (
                <DecisionCard
                  key={decision.priority}
                  decision={decision}
                  index={i}
                  whatif={displayed.whatif_scenarios}
                />
              )
            })}

            {/* Empty state */}
            {(!displayed.decisions || !displayed.decisions.length) && (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                  No significant decisions flagged for this period.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
