import { useMemo, useState } from 'react'
import { formatCurrency, formatPercent, safeNumber } from './procurementDisplay'
import { buildNegotiationSuggestions, buildRiskScores } from './enterpriseFeatures'
import './AgenticPages.css'

function ExternalLink({ href, children }) {
  if (!href) return null
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>
}

function SupplierComparisonPage({ tenderAnalysis, selectedTender, onSelectTender, onNext, onBack }) {
  const tenders = tenderAnalysis?.tenders || []
  const currentId = selectedTender?.id || selectedTender?.tenderRef || tenderAnalysis?.recommendedTender?.id
  const [suggestionStatus, setSuggestionStatus] = useState({})
  const [negotiationNote, setNegotiationNote] = useState('')
  const riskScores = useMemo(() => buildRiskScores(tenders, tenderAnalysis?.requirements), [tenders, tenderAnalysis])
  const negotiationSuggestions = useMemo(() => buildNegotiationSuggestions(tenders, selectedTender || tenderAnalysis?.recommendedTender, tenderAnalysis?.requirements), [tenders, selectedTender, tenderAnalysis])

  const markSuggestion = (index, status) => {
    setSuggestionStatus((current) => ({ ...current, [index]: status }))
    if (status === 'Request revised quote') setNegotiationNote('Revised quote request noted. Supplier selection remains unchanged until the business user applies a revised quote.')
  }

  return (
    <main className="agentic-page supplier-page">
      <section className="agentic-hero-card compact-hero">
        <div>
          <p className="page-eyebrow">Supplier Comparison Agent</p>
          <h1>Company-wise quote comparison</h1>
          <p className="hero-lead">Compare total quote, technical match, commercial match, delivery timeline, source links and product coverage before moving to quote summary.</p>
        </div>
        <div className="workflow-summary-card">
          <strong>{tenders.length}</strong><span>tender options</span>
          <strong>{formatCurrency(tenders[0]?.summary?.grandTotal || 0)}</strong><span>best quote</span>
        </div>
      </section>

      <section className="supplier-card-grid">
        {tenders.map((tender) => {
          const id = tender.id || tender.tenderRef
          const isSelected = id === currentId
          return (
            <article className={`agentic-card supplier-compare-card ${isSelected ? 'is-selected' : ''}`} key={id}>
              <div className="supplier-card-header">
                <div>
                  <p className="tender-ref">{tender.tenderRef}</p>
                  <h2>{tender.company}</h2>
                  <p>{tender.supplierType || 'Verified supplier/source'}</p>
                </div>
                <div className="quote-total compact-total"><span>Total Quote</span><strong>{formatCurrency(tender.summary?.grandTotal)}</strong></div>
              </div>
              <div className="score-grid compact-score-grid">
                <div><strong>{formatPercent(tender.matchScore)}</strong><span>Overall</span></div>
                <div><strong>{formatPercent(tender.technicalScore)}</strong><span>Technical</span></div>
                <div><strong>{formatPercent(tender.commercialScore)}</strong><span>Commercial</span></div>
                <div><strong>{tender.leadTime}</strong><span>Delivery</span></div>
              </div>
              {tender.scoreBreakdown && (
                <div className="score-breakdown-mini">
                  {Object.entries(tender.scoreBreakdown).slice(0, 6).map(([key, value]) => (
                    <span key={key}>{key.replace(/([A-Z])/g, ' $1')}: {safeNumber(value)}%</span>
                  ))}
                </div>
              )}
              <div className="supplier-lines-mini">
                {(tender.lines || []).map((line) => (
                  <div key={`${id}-${line.sku || line.itemName}`}>{line.itemName}<strong>{formatCurrency(line.totalPrice)}</strong></div>
                ))}
              </div>
              <div className="supplier-links-row">
                <ExternalLink href={tender.tenderUrl}>Tender link</ExternalLink>
                <ExternalLink href={tender.website}>Website preview</ExternalLink>
                <ExternalLink href={tender.catalogueUrl}>Products sold</ExternalLink>
              </div>
              <button type="button" className={isSelected ? 'secondary-action' : 'primary-action'} onClick={() => onSelectTender(tender)}>
                {isSelected ? 'Selected tender' : 'Select this tender'}
              </button>
            </article>
          )
        })}
      </section>

      <section className="agentic-card negotiation-agent-card">
        <div className="section-head-row">
          <div>
            <p className="page-eyebrow">Negotiation Agent</p>
            <h2>Commercial negotiation suggestions</h2>
            <p>Suggestions do not automatically change the selected supplier. Apply them only after business review or revised supplier quote.</p>
          </div>
          <span className="status-pill status-ready-to-run">Human controlled</span>
        </div>
        <div className="negotiation-grid">
          {negotiationSuggestions.map((suggestion, index) => (
            <article className="negotiation-card" key={`${suggestion.type}-${index}`}>
              <strong>{suggestion.type}</strong>
              <p>{suggestion.text}</p>
              <div className="mini-action-row">
                <button type="button" onClick={() => markSuggestion(index, 'Accepted')}>Accept suggestion</button>
                <button type="button" onClick={() => markSuggestion(index, 'Ignored')}>Ignore</button>
                <button type="button" onClick={() => markSuggestion(index, 'Request revised quote')}>Request revised quote</button>
              </div>
              {suggestionStatus[index] && <small className="status-note">Status: {suggestionStatus[index]}</small>}
            </article>
          ))}
        </div>
        {negotiationNote && <p className="inline-alert-note">{negotiationNote}</p>}
      </section>

      <section className="agentic-card risk-dashboard-card">
        <div className="section-head-row">
          <div>
            <p className="page-eyebrow">Risk and Compliance Dashboard</p>
            <h2>Supplier risk scorecard</h2>
            <p>Risk is based on source verification, warranty, compliance, price variance, delivery timeline and supplier score.</p>
          </div>
        </div>
        <div className="risk-grid">
          {riskScores.map((risk) => (
            <article className={`risk-card risk-card--${risk.level.toLowerCase().replaceAll(' ', '-')}`} key={risk.id}>
              <div>
                <strong>{risk.supplier}</strong>
                <span>{risk.level}</span>
              </div>
              <div className="risk-meter"><span style={{ width: `${risk.score}%` }} /></div>
              <p>Risk Score: {risk.score}/100</p>
              <p>{risk.status}</p>
              <ul>{risk.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <small>{risk.recommendation}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="agentic-card action-panel-3d">
        <div>
          <h2>Supplier comparison complete</h2>
          <p>Select one tender to continue to the BOQ and quote summary.</p>
        </div>
        <div className="action-button-row">
          <button type="button" className="secondary-action" onClick={onBack}>Back to Prices</button>
          <button type="button" className="primary-action" onClick={onNext} disabled={!currentId}>Continue to Quote Summary</button>
        </div>
      </section>
    </main>
  )
}

export default SupplierComparisonPage
