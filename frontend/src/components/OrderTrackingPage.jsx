import { useMemo, useState } from 'react'
import { formatCurrency, getSelectedTender, safeNumber } from './procurementDisplay'
import { extendedTimeline } from './enterpriseFeatures'
import './AgenticPages.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
const ORDER_EMAIL_SUBJECT = 'Purchase Order Approved – Delivery and Tracking Details'

function formatDate(value) {
  if (!value) return 'To be confirmed'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatQuantity(lines = [], order = {}) {
  if (order.totalQuantity) return `${order.totalQuantity} total units across ${lines.length || 1} product line${lines.length === 1 ? '' : 's'}`
  const total = lines.reduce((sum, line) => sum + safeNumber(line.quantity), 0)
  return total ? `${total} total units across ${lines.length} product line${lines.length === 1 ? '' : 's'}` : `${lines.length} product line${lines.length === 1 ? '' : 's'}`
}

function categoryLabel(lines = [], order = {}) {
  if (order.productCategory) return order.productCategory
  const categories = [...new Set(lines.map((line) => line.category || line.itemName).filter(Boolean))]
  return categories.slice(0, 4).join(', ') || 'Procurement products'
}

function EmailConfirmation({ email, order }) {
  const recipient = email?.recipient || order?.recipientEmail || order?.contactEmail
  const failed = email?.status === 'failed' || email?.mode === 'missing-email'
  const previewOnly = email?.status === 'preview_only' || email?.mode === 'mock'
  const title = failed
    ? 'Email notification failed'
    : previewOnly
      ? 'Email preview generated'
      : 'Confirmation Email Sent'
  const message = failed
    ? 'Order approved, but email notification failed. Please check email configuration.'
    : previewOnly
      ? `Order approved successfully. Gmail/SMTP credentials are not configured, so a complete email preview was generated for ${recipient || 'the company email'}; no real email was sent.`
      : `Order approved successfully. Delivery and tracking details have been sent to ${recipient || 'the company email'}.`

  return (
    <div className={`email-status-card email-status-card--${email?.status || 'sent'}`}>
      <div>
        <strong>{title}</strong>
        <span>{recipient ? `Email Sent To: ${recipient}` : 'Company email not available'}</span>
        <p>{message}</p>
        {previewOnly && <p>Gmail/SMTP is not configured, so the UI shows the full email preview instead of silently failing.</p>}
        {failed && email?.error && <p>SMTP error: {email.error}</p>}
        {!failed && email?.message && <p>{email.message}</p>}
      </div>
      {email?.gmailComposeUrl && (
        <a className="secondary-action compact-link-action" href={email.gmailComposeUrl} target="_blank" rel="noreferrer">Open Gmail Draft</a>
      )}
    </div>
  )
}

function EmailPreviewCard({ email, order }) {
  const body = email?.body || email?.preview
  if (!body) return null
  const recipient = email?.recipient || order?.recipientEmail || order?.contactEmail || 'Company email'
  return (
    <div className="email-preview-card">
      <div className="email-preview-header">
        <div>
          <span>Email preview</span>
          <strong>{email?.subject || ORDER_EMAIL_SUBJECT}</strong>
        </div>
        <small>Recipient: {recipient}</small>
      </div>
      <pre>{body}</pre>
    </div>
  )
}

function DocumentUploadPanel({ order, tender, onNotification }) {
  const [uploads, setUploads] = useState([])
  const [documentType, setDocumentType] = useState('Supplier Invoice')
  const [uploadStatus, setUploadStatus] = useState('')
  const [matchResult, setMatchResult] = useState(null)

  const invoice = uploads.find((item) => String(item.document?.documentType || '').toLowerCase().includes('invoice'))?.extractedFields
  const deliveryNote = uploads.find((item) => String(item.document?.documentType || '').toLowerCase().includes('delivery'))?.extractedFields

  const uploadDocument = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadStatus('Uploading document and extracting fields...')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('documentType', documentType)
    formData.append('requestId', order.purchaseOrderId || order.orderId || 'default-request')
    formData.append('orderDetails', JSON.stringify(order))
    formData.append('selectedTender', JSON.stringify(tender || {}))
    try {
      const response = await fetch(`${BACKEND_URL}/api/upload-document`, { method: 'POST', body: formData })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'Document upload failed')
      setUploads((current) => [...current, data])
      if (data.notification) onNotification?.(data.notification)
      setUploadStatus('Document uploaded. Extracted fields are ready for review.')
    } catch (error) {
      console.error('[Document Upload] Failed', error)
      setUploadStatus(`Document upload failed: ${error.message}`)
    } finally {
      event.target.value = ''
    }
  }

  const runThreeWayMatch = async () => {
    setUploadStatus('Running 3-way match...')
    try {
      const response = await fetch(`${BACKEND_URL}/api/three-way-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseOrder: order, selectedTender: tender, invoice, deliveryNote, requestId: order.purchaseOrderId || order.orderId }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || '3-way matching failed')
      setMatchResult(data.result)
      setUploadStatus('3-way match completed.')
    } catch (error) {
      console.error('[3-Way Match] Failed', error)
      setUploadStatus(`3-way match failed: ${error.message}`)
    }
  }

  return (
    <section className="agentic-card document-upload-card">
      <div className="section-head-row">
        <div>
          <p className="page-eyebrow">Document Upload and OCR Extraction</p>
          <h2>Upload procurement documents</h2>
          <p>Upload quotations, invoices, compliance certificates, warranty documents, tender PDFs or delivery notes. Mock extraction is used when OCR is not configured.</p>
        </div>
      </div>
      <div className="upload-control-row">
        <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
          <option>Supplier Quotation</option>
          <option>Product Brochure</option>
          <option>Supplier Invoice</option>
          <option>Compliance Certificate</option>
          <option>Warranty Document</option>
          <option>Tender PDF</option>
          <option>Delivery Note</option>
        </select>
        <label className="file-upload-button">
          Upload document
          <input type="file" onChange={uploadDocument} accept=".pdf,.txt,.doc,.docx,.png,.jpg,.jpeg" />
        </label>
      </div>
      {uploadStatus && <p className="inline-alert-note">{uploadStatus}</p>}
      <div className="uploaded-doc-grid">
        {uploads.map((upload) => (
          <article className="uploaded-doc-card" key={upload.document.id}>
            <div>
              <strong>{upload.document.filename}</strong>
              <span>{upload.document.documentType}</span>
              <small>Extraction mode: {upload.extractedFields.extractionMode}</small>
            </div>
            <div className="extracted-field-grid">
              {Object.entries(upload.extractedFields).filter(([key]) => !['documentName', 'documentType', 'extractionMode', 'reviewRequired'].includes(key)).slice(0, 10).map(([key, value]) => (
                <div key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><strong>{String(value)}</strong></div>
              ))}
            </div>
            <p className="muted-note">Review extracted details before using them for payment approval. Requirement-form values are never overwritten automatically.</p>
          </article>
        ))}
      </div>
      <div className="three-way-card">
        <div>
          <p className="page-eyebrow">3-Way Matching</p>
          <h3>PO vs Invoice vs Delivery Note</h3>
          <p>Compare supplier name, item, quantity, unit price, GST/tax, total amount, delivery address and delivery date.</p>
        </div>
        <button type="button" className="primary-action" onClick={runThreeWayMatch}>Run 3-Way Match</button>
      </div>
      {matchResult && (
        <div className="match-result-card">
          <strong>{matchResult.status}</strong>
          <span>{matchResult.paymentApproval ? 'Payment can be approved' : 'Payment approval blocked until mismatches are resolved'}</span>
          <div className="match-check-grid">
            {(matchResult.checks || []).map((check) => (
              <div className={`match-check match-check--${String(check.status).toLowerCase().replaceAll(' ', '-')}`} key={check.field}>
                <span>{check.field}</span>
                <strong>{check.status}</strong>
                <small>{check.message}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function NotificationHistory({ items = [], onResendEmail }) {
  return (
    <section className="agentic-card notification-history-card">
      <div className="section-head-row">
        <div>
          <p className="page-eyebrow">Email and Notification History</p>
          <h2>Procurement activity log</h2>
          <p>Shows email, PO generation, approval, tracking, document and payment-related events.</p>
        </div>
        <button type="button" className="secondary-action" onClick={onResendEmail}>Resend Email</button>
      </div>
      <div className="notification-log-list">
        {items.length ? items.map((item) => (
          <article className={`notification-log-item notification-log-item--${String(item.status || '').toLowerCase()}`} key={item.id || `${item.type}-${item.timestamp}`}>
            <div>
              <strong>{item.type}</strong>
              <p>{item.message}</p>
              {item.reason && <small>Reason: {item.reason}</small>}
            </div>
            <div>
              <span>{item.recipient || 'System'}</span>
              <span>{formatDate(item.timestamp)}</span>
              <strong>{item.status}</strong>
            </div>
          </article>
        )) : <p className="muted-note">No notification history yet.</p>}
      </div>
    </section>
  )
}

function OrderTrackingPage({ orderDetails, emailResult, tenderAnalysis, selectedTender, requirementsData, notificationHistory = [], onDownloadPurchaseOrder, onResendEmail, onNotification, onBack, onRestart }) {
  const tender = getSelectedTender(selectedTender, tenderAnalysis)
  const order = orderDetails || {}
  const lines = tender?.lines || []
  const timeline = useMemo(() => extendedTimeline(order), [order])
  const [poStatus, setPoStatus] = useState('')

  const downloadPo = async () => {
    setPoStatus('Generating Purchase Order PDF...')
    try {
      await onDownloadPurchaseOrder?.()
      setPoStatus('Purchase Order PDF downloaded.')
    } catch (error) {
      console.error('[Purchase Order PDF] Failed', error)
      setPoStatus(`Purchase Order PDF failed: ${error.message}`)
    }
  }

  return (
    <main className="agentic-page order-tracking-page">
      <section className="agentic-hero-card compact-hero">
        <div>
          <p className="page-eyebrow">Order Tracking</p>
          <h1>Order placed and tracking generated</h1>
          <p className="hero-lead">The purchase order has been approved, placed with the selected supplier, and registered for delivery follow-up. Tracking details and the confirmation email are shown below.</p>
        </div>
        <div className="workflow-summary-card">
          <strong>{order.currentStatus || order.status || 'Order placed and delivery scheduled'}</strong>
          <span>current status</span>
        </div>
      </section>

      <section className="approval-grid">
        <article className="agentic-card approval-card-main">
          <h2>{requirementsData?.title || order.projectTitle || 'Procurement order'}</h2>
          <p>{requirementsData?.organization || order.buyerOrganization} • {requirementsData?.organizationType || 'Business procurement'}</p>
          <div className="approval-summary-list">
            <div><span>Purchase Order ID</span><strong>{order.purchaseOrderId || order.orderId || 'PO pending'}</strong></div>
            <div><span>Supplier</span><strong>{order.supplier || tender?.company || 'Selected supplier'}</strong></div>
            <div><span>Product / Category</span><strong>{categoryLabel(lines, order)}</strong></div>
            <div><span>Quantity</span><strong>{formatQuantity(lines, order)}</strong></div>
            <div><span>Total Amount</span><strong>{formatCurrency(order.totalQuote || tender?.summary?.grandTotal)}</strong></div>
            <div><span>Delivery Address</span><strong>{order.deliveryLocation || requirementsData?.deliveryLocation || 'Not specified'}</strong></div>
            <div><span>Expected Delivery</span><strong>{order.deliveryDays ? `${order.deliveryDays} days` : tender?.leadTime || 'To be confirmed'} • {formatDate(order.expectedDeliveryDate)}</strong></div>
            <div><span>Tracking ID</span><strong>{order.trackingId || order.trackingNumber || 'Tracking pending'}</strong></div>
            <div><span>Contact Email</span><strong>{order.contactEmail || order.recipientEmail || requirementsData?.companyEmail || 'Not specified'}</strong></div>
          </div>
          <div className="action-button-row po-download-row">
            <button type="button" className="primary-action" onClick={downloadPo}>Download Purchase Order PDF</button>
            {poStatus && <span className="download-status-text">{poStatus}</span>}
          </div>
        </article>

        <article className="agentic-card approval-card-main order-status-panel">
          <h2>Order tracking timeline</h2>
          <p>Current status is highlighted. Update milestones as supplier dispatch and delivery documents arrive.</p>
          <div className="status-stack">
            {timeline.map((step, index) => (
              <div className={`status-stack-item status-stack-item--${step.status}`} key={`${step.step}-${index}`}>
                <span>{index + 1}</span>
                <div>
                  <strong>{step.step}</strong>
                  <small>{step.status} • {formatDate(step.date)}</small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="agentic-card delivery-tracking-card">
        <div className="section-head-row">
          <div>
            <p className="page-eyebrow">Tracking card</p>
            <h2>Delivery tracking details</h2>
            <p>Use this panel for supplier follow-up, delivery inspection, invoice verification, and handover tracking.</p>
          </div>
          <div className="quote-total compact-total"><span>Current Status</span><strong>{order.currentStatus || order.status || 'Order placed and delivery scheduled'}</strong></div>
        </div>

        <div className="tracking-summary-grid">
          <div><span>Purchase Order ID</span><strong>{order.purchaseOrderId || order.orderId}</strong></div>
          <div><span>Supplier Name</span><strong>{order.supplier || tender?.company}</strong></div>
          <div><span>Tracking ID</span><strong>{order.trackingId || order.trackingNumber}</strong></div>
          <div><span>Expected Dispatch</span><strong>{formatDate(order.dispatchDate)}</strong></div>
          <div><span>Expected Delivery Date</span><strong>{formatDate(order.expectedDeliveryDate)}</strong></div>
          <div><span>Email Sent To</span><strong>{emailResult?.recipient || order.recipientEmail || requirementsData?.companyEmail}</strong></div>
        </div>

        <EmailConfirmation email={emailResult} order={order} />
        <EmailPreviewCard email={emailResult} order={order} />

        <div className="responsive-table quote-table order-lines-table">
          <div className="table-row table-head">
            <span>Product</span><span>Brand / model</span><span>Qty</span><span>Unit price</span><span>Total</span><span>Supplier source</span>
          </div>
          {lines.map((line, index) => (
            <div className="table-row" key={`${line.sku}-${index}`}>
              <span>{line.itemName}</span>
              <span>{line.matchedProduct}<small>{line.sku}</small></span>
              <span>{line.quantity} {line.unit}</span>
              <span>{formatCurrency(line.unitPrice)}</span>
              <span>{formatCurrency(line.totalPrice)}</span>
              <span className="link-stack">
                {line.productUrl && <a href={line.productUrl} target="_blank" rel="noreferrer">Product</a>}
                {line.sourceUrl && <a href={line.sourceUrl} target="_blank" rel="noreferrer">Price source</a>}
              </span>
            </div>
          ))}
        </div>
      </section>

      <DocumentUploadPanel order={order} tender={tender} onNotification={onNotification} />
      <NotificationHistory items={notificationHistory} onResendEmail={onResendEmail} />

      <section className="agentic-card action-panel-3d">
        <div>
          <h2>Procurement order ready for delivery follow-up</h2>
          <p>Keep this tracking panel and the generated RFP/quote summary for audit, purchase order processing, and supplier coordination.</p>
        </div>
        <div className="action-button-row">
          <button type="button" className="secondary-action" onClick={onBack}>Back to Approval</button>
          <button type="button" className="primary-action" onClick={onRestart}>Start New Requirement</button>
        </div>
      </section>
    </main>
  )
}

export default OrderTrackingPage
