import { formatCurrency, getSelectedTender } from './procurementDisplay'
import './AgenticPages.css'

function ExternalLink({ href, children }) {
  if (!href) return null
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>
}

function QuoteSummaryPage({ tenderAnalysis, selectedTender, onNext, onBack, onDownloadRfp }) {
  const tender = getSelectedTender(selectedTender, tenderAnalysis)
  const summary = tender?.summary || {}

  return (
    <main className="agentic-page quote-page">
      <section className="agentic-hero-card compact-hero">
        <div>
          <p className="page-eyebrow">Quote Comparison Agent</p>
          <h1>Quote summary and BOQ</h1>
          <p className="hero-lead">Review item-wise rates, source links, freight, testing, insurance, GST and final quote amount before recommendation.</p>
        </div>
        <div className="quote-total hero-total"><span>Selected Quote</span><strong>{formatCurrency(summary.grandTotal)}</strong></div>
      </section>

      <section className="agentic-card table-card">
        <div className="section-head-row">
          <div>
            <p className="tender-ref">{tender?.tenderRef}</p>
            <h2>{tender?.company || 'No tender selected'}</h2>
          </div>
          <div className="supplier-links-row">
            <ExternalLink href={tender?.tenderUrl}>Tender link</ExternalLink>
            <ExternalLink href={tender?.website}>Website preview</ExternalLink>
            <ExternalLink href={tender?.catalogueUrl}>Products sold</ExternalLink>
          </div>
        </div>

        <div className="responsive-table quote-table">
          <div className="table-row table-head">
            <span>Item</span><span>Matched product</span><span>Qty</span><span>Unit price</span><span>Line total</span><span>Source</span>
          </div>
          {(tender?.lines || []).map((line, index) => (
            <div className="table-row" key={`${line.sku}-${index}`}>
              <span>{line.itemName}</span>
              <span>{line.matchedProduct}<small>{line.sku}</small></span>
              <span>{line.quantity} {line.unit}</span>
              <span>{formatCurrency(line.unitPrice)}</span>
              <span>{formatCurrency(line.totalPrice)}</span>
              <span className="link-stack"><ExternalLink href={line.productUrl}>Product</ExternalLink><ExternalLink href={line.sourceUrl}>Price</ExternalLink></span>
            </div>
          ))}
        </div>
      </section>

      <section className="quote-summary-grid">
        <article className="agentic-card total-breakup-card"><span>Material Total</span><strong>{formatCurrency(summary.itemTotal)}</strong></article>
        <article className="agentic-card total-breakup-card"><span>Freight</span><strong>{formatCurrency(summary.freight)}</strong></article>
        <article className="agentic-card total-breakup-card"><span>Testing / Inspection</span><strong>{formatCurrency(summary.testing)}</strong></article>
        <article className="agentic-card total-breakup-card"><span>Insurance</span><strong>{formatCurrency(summary.insurance)}</strong></article>
        <article className="agentic-card total-breakup-card"><span>GST</span><strong>{formatCurrency(summary.gst)}</strong></article>
        <article className="agentic-card total-breakup-card grand"><span>Grand Total</span><strong>{formatCurrency(summary.grandTotal)}</strong></article>
      </section>

      <section className="agentic-card action-panel-3d">
        <div>
          <h2>RFP document is ready</h2>
          <p>Download the generated RFP document or continue to final AI recommendation.</p>
        </div>
        <div className="action-button-row">
          <button type="button" className="secondary-action" onClick={onBack}>Back to Comparison</button>
          <button type="button" className="secondary-action" onClick={onDownloadRfp}>Download RFP Document</button>
          <button type="button" className="primary-action" onClick={onNext}>View Recommendation</button>
        </div>
      </section>
    </main>
  )
}

export default QuoteSummaryPage
