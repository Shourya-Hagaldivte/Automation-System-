import { useMemo } from 'react'
import { formatCurrency, formatPercent, getSelectedTender, safeNumber } from './procurementDisplay'
import { buildExplainableRecommendation } from './enterpriseFeatures'
import './AgenticPages.css'

function FinalRecommendationPage({ tenderAnalysis, selectedTender, requirementsData, onNext, onBack }) {
  const tender = getSelectedTender(selectedTender, tenderAnalysis)
  const budget = safeNumber(requirementsData?.budget)
  const total = safeNumber(tender?.summary?.grandTotal)
  const withinBudget = budget > 0 && total <= budget
  const explanation = useMemo(() => buildExplainableRecommendation(tenderAnalysis?.tenders || [], tender, requirementsData), [tenderAnalysis, tender, requirementsData])
  const reasons = [
    `${formatPercent(tender?.technicalScore)} technical fit across requested specifications`,
    `${formatPercent(tender?.commercialScore)} commercial competitiveness with ${formatCurrency(total)} total quote`,
    `${tender?.leadTime || 'Supplier-confirmed delivery to be captured'} delivery timeline`,
    withinBudget ? 'Quote is within the entered budget' : 'Quote may need budget approval or negotiation',
    ...explanation.reasons.filter((reason) => !String(reason).includes('technical') && !String(reason).includes('commercial')).slice(0, 4),
  ]

  return (
    <main className="agentic-page recommendation-page">
      <section className="agentic-hero-card recommendation-hero">
        <div>
          <p className="page-eyebrow">Recommendation Agent</p>
          <h1>Recommended procurement option</h1>
          <p className="hero-lead">The AI recommendation is based on product coverage, market pricing, supplier/source quality, technical fit, commercial fit, timeline and risk indicators.</p>
        </div>
        <div className="recommendation-score-orb">
          <strong>{formatPercent(tender?.matchScore)}</strong>
          <span>overall match</span>
        </div>
      </section>

      <section className="agentic-card recommendation-card-large">
        <p className="tender-ref">{tender?.tenderRef}</p>
        <h2>{tender?.company || 'No tender selected'}</h2>
        <div className="recommendation-metrics">
          <span>Total quote: <strong>{formatCurrency(total)}</strong></span>
          <span>Technical: <strong>{formatPercent(tender?.technicalScore)}</strong></span>
          <span>Commercial: <strong>{formatPercent(tender?.commercialScore)}</strong></span>
          <span>Delivery: <strong>{tender?.leadTime}</strong></span>
        </div>
        <h3>Why this option is recommended</h3>
        <ul className="reason-list">
          {[...new Set(reasons)].map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
        <p className="approval-message">AI automates supplier discovery, tender matching, quote comparison and recommendation. The final approval remains with the business user.</p>
      </section>

      <section className="agentic-card explainability-card">
        <div className="section-head-row">
          <div>
            <p className="page-eyebrow">Explainable AI Recommendation</p>
            <h2>Selection rationale and trade-offs</h2>
            <p>The recommendation is explainable so procurement teams can justify supplier selection during approval and audit.</p>
          </div>
        </div>
        <div className="explainability-grid">
          <article>
            <h3>Why selected</h3>
            <ul>{explanation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          </article>
          <article>
            <h3>Why others were not selected</h3>
            <ul>{explanation.alternatives.length ? explanation.alternatives.map((item) => <li key={item.supplier}><strong>{item.supplier}:</strong> {item.reason} <small>{item.scores}</small></li>) : <li>No alternative suppliers available in this comparison.</li>}</ul>
          </article>
          <article>
            <h3>Trade-offs</h3>
            <ul>{explanation.tradeoffs.map((tradeoff) => <li key={tradeoff}>{tradeoff}</li>)}</ul>
          </article>
        </div>
      </section>

      <section className="agentic-card action-panel-3d">
        <div>
          <h2>Move to final approval</h2>
          <p>Review the recommendation and send it to the approval workflow.</p>
        </div>
        <div className="action-button-row">
          <button type="button" className="secondary-action" onClick={onBack}>Back to Quote</button>
          <button type="button" className="primary-action" onClick={onNext}>Proceed to Approval</button>
        </div>
      </section>
    </main>
  )
}

export default FinalRecommendationPage
