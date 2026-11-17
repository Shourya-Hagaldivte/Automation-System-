import ProductScene3D from './ProductScene3D'
import { allTenderLines, formatCurrency } from './procurementDisplay'
import './AgenticPages.css'

function ExternalLink({ href, children, fallback = 'Not available' }) {
  if (!href) return <span className="muted-link">{fallback}</span>
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>
}

function SourceLinks({ line }) {
  if (line.sourceUnavailable || line.sourceStatus) {
    return <span className="source-unavailable-badge">{line.sourceStatus || 'Live supplier source unavailable, using benchmark procurement estimate.'}</span>
  }
  return (
    <span className="link-stack">
      <ExternalLink href={line.productUrl}>Product</ExternalLink>
      <ExternalLink href={line.sourceUrl}>Price source</ExternalLink>
    </span>
  )
}

function MarketPricePage({ tenderAnalysis, selectedTender, onNext, onBack }) {
  const lines = allTenderLines(tenderAnalysis)
  const selectedLines = selectedTender?.lines || tenderAnalysis?.recommendedTender?.lines || []
  const groupedItems = (tenderAnalysis?.requestedItems || []).map((item) => ({
    item,
    options: lines.filter((line) => String(line.itemName).toLowerCase() === String(item.name).toLowerCase()).slice(0, 5),
  }))

  return (
    <main className="agentic-page market-page">
      <section className="agentic-hero-card split-hero">
        <div>
          <p className="page-eyebrow">Market Price Analysis Agent</p>
          <h1>Product market prices and source links</h1>
          <p className="hero-lead">Every product line is converted into unit pricing, line totals, supplier/source links, and quote-ready BOQ data.</p>
          <div className="metric-row">
            <span>{groupedItems.length} requested products</span>
            <span>{lines.length} source-linked price options</span>
            <span>{selectedLines.length} lines in selected tender</span>
          </div>
        </div>
        <ProductScene3D products={selectedLines.slice(0, 6)} />
      </section>

      <section className="agentic-card table-card">
        <h2>Item-wise market price sheet</h2>
        <div className="responsive-table price-table">
          <div className="table-row table-head">
            <span>Requested product</span>
            <span>Supplier / source</span>
            <span>Matched product</span>
            <span>Unit price</span>
            <span>Delivery estimate</span>
            <span>Source</span>
          </div>
          {groupedItems.map(({ item, options }, index) => (
            options.length ? options.map((line, optionIndex) => (
              <div className="table-row" key={`${item.name}-${line.sku}-${optionIndex}`}>
                <span>{optionIndex === 0 ? `${index + 1}. ${item.name}` : ''}</span>
                <span>{line.supplierName || line.tender?.company}</span>
                <span>{line.matchedProduct}<small>{line.sourceStatus || line.priceBasis || line.priceSource}</small></span>
                <span>{formatCurrency(line.unitPrice)} / {line.unit}</span>
                <span>{line.deliveryEstimate || line.tender?.leadTime || `${line.deliveryDays || line.tender?.deliveryDays || 14} days`}</span>
                <SourceLinks line={line} />
              </div>
            )) : (
              <div className="table-row" key={`${item.name}-empty`}>
                <span>{index + 1}. {item.name}</span>
                <span>Supplier source enrichment</span>
                <span>Awaiting exact supplier source match</span>
                <span>{formatCurrency(0)}</span>
                <span>To be confirmed</span>
                <span>Not available</span>
              </div>
            )
          ))}
        </div>
      </section>

      <section className="agentic-card action-panel-3d">
        <div>
          <h2>Pricing analysis complete</h2>
          <p>Next, compare suppliers and select the preferred company-wise tender.</p>
        </div>
        <div className="action-button-row">
          <button type="button" className="secondary-action" onClick={onBack}>Back to Tenders</button>
          <button type="button" className="primary-action" onClick={onNext}>Compare Suppliers</button>
        </div>
      </section>
    </main>
  )
}

export default MarketPricePage
