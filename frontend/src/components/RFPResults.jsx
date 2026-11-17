import './RFPResults.css'

const BACKEND_URL = 'http://localhost:8000'

function RFPResults({ finalResponse, onReset }) {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(Number(amount || 0))
  }

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  const buildHtmlDocument = () => {
    const requirements = finalResponse?.requirements || finalResponse?.rfp?.requirements || {}
    const rfp = finalResponse?.rfp || {}
    const pricing = finalResponse?.pricing || {}
    const summary = pricing.summary || {}
    const lineRows = (pricing.materials || []).map((item) => `
      <tr>
        <td>${item.name || ''}</td>
        <td>${item.sku || ''}</td>
        <td>${item.quantity || ''}</td>
        <td>${formatCurrency(item.unitPrice)}</td>
        <td>${formatCurrency(item.totalPrice)}</td>
      </tr>`).join('')

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Original RFP Document</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; line-height: 1.55; max-width: 960px; margin: 36px auto; }
    h1, h2, h3 { color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0 24px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #e0f2fe; }
    .amount { text-align: right; }
  </style>
</head>
<body>
  <h1>Request for Proposal (RFP) Document</h1>
  <p><strong>Project:</strong> ${requirements.title || rfp.title || 'Procurement Requirement'}</p>
  <p><strong>Organization:</strong> ${requirements.organization || 'Buyer / Issuing Organization'}</p>
  <p><strong>Industry:</strong> ${requirements.industry || 'Not specified'}</p>
  <p><strong>Budget:</strong> ${requirements.budget ? formatCurrency(requirements.budget) : 'Not specified'}</p>
  <p><strong>Delivery Timeline:</strong> ${requirements.timeline || 'Not specified'}</p>
  <h2>Recommended Tender</h2>
  <p><strong>Company:</strong> ${rfp.companyName || rfp.source || 'Not specified'}</p>
  <p><strong>Tender ID:</strong> ${rfp.id || 'N/A'}</p>
  <p><strong>Match Score:</strong> ${rfp.matchScore || 'N/A'}%</p>
  <p><strong>Estimated Delivery:</strong> ${rfp.estimatedDelivery || 'N/A'}</p>
  <h2>Scope of Supply and BoQ</h2>
  <table>
    <thead><tr><th>Product</th><th>SKU</th><th>Quantity</th><th>Unit Price</th><th>Total</th></tr></thead>
    <tbody>${lineRows}</tbody>
  </table>
  <h2>Commercial Summary</h2>
  <p>Material Total: ${formatCurrency(summary.materialTotal)}</p>
  <p>Testing / Inspection: ${formatCurrency(summary.testTotal)}</p>
  <p>Additional Costs: ${formatCurrency(summary.additionalTotal)}</p>
  <p>Subtotal: ${formatCurrency(summary.subtotal)}</p>
  <p>GST: ${formatCurrency(summary.gst)}</p>
  <h3>Grand Total: ${formatCurrency(summary.grandTotal)}</h3>
  <h2>Required RFP Contents</h2>
  <ul>
    <li>Signed commercial proposal and item-wise price schedule</li>
    <li>Technical datasheets and compliance matrix</li>
    <li>Warranty, delivery schedule, payment terms, GST details and authorized signatory details</li>
    <li>Inspection, testing, acceptance and documentation requirements</li>
    <li>Clearly stated deviations from the buyer requirement, if any</li>
  </ul>
</body>
</html>`
  }

  const downloadReport = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/generate-rfp-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirements: finalResponse?.requirements || finalResponse?.rfp?.requirements || {},
          tender: finalResponse?.rfp,
          pricing: finalResponse?.pricing,
          technical: finalResponse?.technical,
        }),
      })
      if (!response.ok) throw new Error('PDF generation failed')
      const blob = await response.blob()
      downloadBlob(blob, 'Original_RFP_Document.pdf')
    } catch {
      downloadBlob(new Blob([buildHtmlDocument()], { type: 'text/html;charset=utf-8' }), 'Original_RFP_Document.html')
    }
  }

  const exportToPDF = downloadReport

  const rfp = finalResponse?.rfp || {}
  const pricing = finalResponse?.pricing || { materials: [], tests: [], additionalCosts: [], summary: {} }
  const technical = finalResponse?.technical || []
  const requirements = finalResponse?.requirements || rfp.requirements || {}

  return (
    <div className="rfp-results">
      <div className="results-header">
        <div>
          <h2>✅ RFP Response Complete</h2>
          <p>Final consolidated response and original RFP document are ready</p>
        </div>
        <div className="header-actions">
          <button className="action-btn secondary" onClick={downloadReport}>
            📥 Download Original RFP Document
          </button>
          <button className="action-btn secondary" onClick={exportToPDF}>
            📄 Export to PDF
          </button>
          <button className="action-btn primary" onClick={onReset}>
            🔄 New RFP Process
          </button>
        </div>
      </div>

      <div className="rfp-info-banner">
        <div className="banner-item">
          <span className="banner-label">Tender ID:</span>
          <span className="banner-value">{rfp.id}</span>
        </div>
        <div className="banner-item">
          <span className="banner-label">Project:</span>
          <span className="banner-value">{requirements.title || rfp.title}</span>
        </div>
        <div className="banner-item">
          <span className="banner-label">Company:</span>
          <span className="banner-value">{rfp.companyName || rfp.source}</span>
        </div>
        <div className="banner-item">
          <span className="banner-label">Total Value:</span>
          <span className="banner-value success">{formatCurrency(pricing.summary?.grandTotal)}</span>
        </div>
      </div>

      <div className="tabs-container">
        <section className="rfp-section">
          <h3 className="rfp-section-title">Executive Summary</h3>
          <div className="summary-text">
            <p>
              The system selected <strong>{rfp.companyName || rfp.source}</strong> for <strong>{requirements.title || rfp.title}</strong> with a match score of <strong>{rfp.matchScore || 'N/A'}%</strong>. The recommendation is based on item fit, delivery timeline, supplier reliability, and commercial competitiveness.
            </p>
            <p>
              <strong>Price source:</strong> {rfp.priceSource || 'Project pricing catalog / estimate'} · <strong>Delivery:</strong> {rfp.estimatedDelivery || 'As per selected tender'} · <strong>Warranty:</strong> {rfp.warranty || 'As per OEM terms'}.
            </p>
          </div>
        </section>

        <section className="rfp-section">
          <h3 className="rfp-section-title">Product Match Summary</h3>
          <table className="compact-table">
            <thead>
              <tr>
                <th>RFP Line Item</th>
                <th>Proposed SKU</th>
                <th>Product</th>
                <th>Match %</th>
              </tr>
            </thead>
            <tbody>
              {technical.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.rfpItem}</td>
                  <td><code>{item.selectedSKU}</code></td>
                  <td>{item.selectedProduct}</td>
                  <td>
                    <span className={`match-badge match-${item.matchPercentage >= 95 ? 'high' : 'medium'}`}>
                      {item.matchPercentage}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rfp-section">
          <h3 className="rfp-section-title">Commercial Summary</h3>
          <table className="compact-table">
            <tbody>
              <tr><th scope="row">Material Value</th><td>{formatCurrency(pricing.summary?.materialTotal)}</td></tr>
              <tr><th scope="row">Testing & Certification</th><td>{formatCurrency(pricing.summary?.testTotal)}</td></tr>
              <tr><th scope="row">Additional Costs</th><td>{formatCurrency(pricing.summary?.additionalTotal)}</td></tr>
              <tr><th scope="row">Subtotal</th><td>{formatCurrency(pricing.summary?.subtotal)}</td></tr>
              <tr><th scope="row">GST (18%)</th><td>{formatCurrency(pricing.summary?.gst)}</td></tr>
              <tr><th scope="row">Grand Total (Incl. GST)</th><td><strong>{formatCurrency(pricing.summary?.grandTotal)}</strong></td></tr>
            </tbody>
          </table>
        </section>

        <section className="rfp-section">
          <h3 className="rfp-section-title">Indicative Delivery Schedule</h3>
          <div className="timeline">
            <div className="timeline-item"><div className="timeline-marker">1</div><div className="timeline-content"><strong>Order Confirmation</strong><span>Within 2 working days from PO / LOA</span></div></div>
            <div className="timeline-item"><div className="timeline-marker">2</div><div className="timeline-content"><strong>Supply Preparation</strong><span>{rfp.estimatedDelivery || 'As per selected tender'}</span></div></div>
            <div className="timeline-item"><div className="timeline-marker">3</div><div className="timeline-content"><strong>Testing & QC</strong><span>Covered in inspection and compliance pack</span></div></div>
            <div className="timeline-item"><div className="timeline-marker">4</div><div className="timeline-content"><strong>Dispatch & Delivery</strong><span>After documentation and payment milestone clearance</span></div></div>
          </div>
        </section>

        <section className="pricing-content">
          <h3>Bill of Quantities & Pricing</h3>
          <div className="pricing-section-result">
            <h4>Material Items</h4>
            <table className="pricing-table-result">
              <thead>
                <tr><th>RFP / Product</th><th>SKU</th><th>Quantity</th><th>Unit Price</th><th>Line Total</th></tr>
              </thead>
              <tbody>
                {pricing.materials.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.name}</td>
                    <td><code>{item.sku}</code></td>
                    <td>{item.quantity}</td>
                    <td>{formatCurrency(item.unitPrice)}{item.unit ? `/${item.unit}` : ''}</td>
                    <td className="amount">{formatCurrency(item.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pricing-section-result">
            <h4>Testing & Certification</h4>
            <table className="pricing-table-result">
              <thead><tr><th>Test / Service</th><th>Applicable To</th><th>Duration</th><th>Cost</th></tr></thead>
              <tbody>
                {pricing.tests.map((test, idx) => (
                  <tr key={idx}><td>{test.testName}</td><td>{test.applicableTo}</td><td>{test.duration}</td><td className="amount">{formatCurrency(test.cost)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pricing-section-result">
            <h4>Other Commercials</h4>
            <table className="pricing-table-result">
              <thead><tr><th>Description</th><th>Cost</th></tr></thead>
              <tbody>
                {pricing.additionalCosts.map((cost, idx) => (
                  <tr key={idx}><td>{cost.item}</td><td className="amount">{formatCurrency(cost.cost)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="final-totals">
            <div className="total-row"><span>Subtotal</span><span>{formatCurrency(pricing.summary?.subtotal)}</span></div>
            <div className="total-row"><span>GST (18%)</span><span>{formatCurrency(pricing.summary?.gst)}</span></div>
            <div className="total-row grand"><span>Grand Total (Incl. GST)</span><span>{formatCurrency(pricing.summary?.grandTotal)}</span></div>
          </div>
        </section>

        <section className="compliance-content">
          <h3>Compliance & Documentation</h3>
          <div className="compliance-grid">
            <div className="compliance-section"><h4>Technical Compliance</h4><ul className="compliance-list"><li><span className="check">✓</span> Datasheets and compliance matrix required</li><li><span className="check">✓</span> Applicable IS / IEC standards to be confirmed</li><li><span className="check">✓</span> Deviations to be clearly declared</li></ul></div>
            <div className="compliance-section"><h4>Quality & Testing</h4><ul className="compliance-list"><li><span className="check">✓</span> Inspection and routine checks covered</li><li><span className="check">✓</span> Test reports available for buyer review</li><li><span className="check">✓</span> Traceability maintained for all lots</li></ul></div>
            <div className="compliance-section"><h4>Documentation</h4><ul className="compliance-list"><li><span className="check">✓</span> Original RFP document generated</li><li><span className="check">✓</span> BoQ, pricing and tender summary included</li><li><span className="check">✓</span> Warranty and payment terms included</li></ul></div>
            <div className="compliance-section"><h4>Commercial Terms</h4><ul className="compliance-list"><li><span className="check">✓</span> GST and commercial costs shown separately</li><li><span className="check">✓</span> Pricing validity: {rfp.validUntil || '30 days'}</li><li><span className="check">✓</span> Payment terms: {rfp.paymentTerms || 'To be finalized'}</li></ul></div>
          </div>
        </section>
      </div>

      <div className="action-footer">
        <div className="footer-info">
          <p><strong>Response prepared by AI Agent System</strong></p>
          <p>Generated on: {new Date(finalResponse.timestamp).toLocaleString()}</p>
        </div>
        <div className="footer-actions">
          <button className="action-btn large primary" onClick={() => alert('RFP Response submitted successfully!')}>
            📤 Submit RFP Response
          </button>
        </div>
      </div>
    </div>
  )
}

export default RFPResults
