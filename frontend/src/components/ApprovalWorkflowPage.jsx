import { useMemo, useState } from 'react'
import { formatCurrency, getSelectedTender, safeNumber } from './procurementDisplay'
import { buildExplainableRecommendation } from './enterpriseFeatures'
import './AgenticPages.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
const ORDER_EMAIL_SUBJECT = 'Purchase Order Approved – Delivery and Tracking Details'
const EMAIL_FAILURE_MESSAGE = 'Order approved, but email notification failed. Please check email configuration.'

function parseLeadDays(tender) {
  const match = String(tender?.leadTime || tender?.deliveryDays || '').match(/\d+/)
  return match ? Math.max(1, Number(match[0])) : 14
}

function addDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatDate(value) {
  if (!value) return 'To be confirmed'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatQuantity(lines = []) {
  const total = lines.reduce((sum, line) => sum + safeNumber(line.quantity), 0)
  return total ? `${total} total units across ${lines.length} product line${lines.length === 1 ? '' : 's'}` : `${lines.length} product line${lines.length === 1 ? '' : 's'}`
}

function productCategory(lines = []) {
  const categories = [...new Set(lines.map((line) => line.category || line.itemName).filter(Boolean))]
  return categories.slice(0, 4).join(', ') || 'Procurement products'
}

function secureDigits(length) {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)
    return String(values[0]).slice(0, length).padStart(length, '0')
  }
  return String(Date.now()).slice(-length).padStart(length, '0')
}

function buildLocalOrder(requirementsData, tender) {
  const deliveryDays = parseLeadDays(tender)
  const year = new Date().getFullYear()
  const poSuffix = secureDigits(4)
  const trackingId = `TRK-IND-${secureDigits(6)}`
  const lines = tender?.lines || []
  return {
    orderId: `PO-${year}-${poSuffix}`,
    purchaseOrderId: `PO-${year}-${poSuffix}`,
    trackingNumber: trackingId,
    trackingId,
    trackingUrl: '',
    status: 'Order placed and delivery scheduled',
    currentStatus: 'Order placed and delivery scheduled',
    supplier: tender?.company || 'Selected supplier',
    tenderRef: tender?.tenderRef || tender?.id || 'Selected tender',
    productCategory: productCategory(lines),
    totalQuantity: lines.reduce((sum, line) => sum + safeNumber(line.quantity), 0),
    totalQuote: safeNumber(tender?.summary?.grandTotal),
    dispatchDate: addDays(2),
    expectedDeliveryDate: addDays(deliveryDays),
    deliveryDays,
    deliveryLocation: requirementsData?.deliveryLocation || 'Delivery location not specified',
    recipientEmail: requirementsData?.companyEmail || '',
    contactEmail: requirementsData?.companyEmail || '',
    buyerOrganization: requirementsData?.organization || 'Buyer organization',
    projectTitle: requirementsData?.title || 'Procurement delivery order',
    items: lines,
    timeline: [
      { step: 'Purchase Order Approved', status: 'completed', date: addDays(0) },
      { step: 'Order Placed with Supplier', status: 'completed', date: addDays(0) },
      { step: 'Delivery Scheduled', status: 'scheduled', date: addDays(2) },
      { step: 'Tracking Details Generated', status: 'completed', date: addDays(0) },
      { step: 'Confirmation Email Sent', status: 'pending', date: addDays(0) },
      { step: 'Delivery and Handover', status: 'pending', date: addDays(deliveryDays) },
    ],
  }
}

function buildFallbackEmail(order, requirementsData, tender) {
  const recipient = requirementsData?.companyEmail || order?.recipientEmail || order?.contactEmail || ''
  const itemLines = (tender?.lines || []).map((line) => {
    const name = line.matchedProduct || line.itemName || 'Procurement item'
    return `${name} | Quantity: ${line.quantity || 0} ${line.unit || 'units'} | Unit Price: ${formatCurrency(line.unitPrice)} | Total: ${formatCurrency(line.totalPrice)} | Supplier/Source: ${line.supplierName || tender?.company || 'Selected supplier'} | Link: ${line.productUrl || line.sourceUrl || tender?.tenderUrl || tender?.website || 'Source link not available'}`
  }).join('\n')
  const selectedProducts = (tender?.lines || [])
    .map((line) => line.matchedProduct || line.itemName)
    .filter(Boolean)
    .slice(0, 5)
    .join(', ') || 'Selected procurement items'
  const body = `Dear Team,

Your procurement request has been approved successfully.

Order Summary:
Company Name: ${requirementsData?.organization || order?.buyerOrganization || 'Buyer organization'}
Project/Requirement: ${requirementsData?.title || requirementsData?.productCategory || order?.projectTitle || 'Procurement request'}
Selected Supplier: ${tender?.company || order?.supplier || 'Selected supplier'}
Selected Tender: ${tender?.tenderRef || tender?.id || order?.tenderRef || 'Selected tender'}
Selected Product/Items: ${selectedProducts}
Total Quote Amount: ${formatCurrency(tender?.summary?.grandTotal || order?.totalQuote)}
Approval Status: Approved by business user

Delivery Details:
Purchase Order ID: ${order?.purchaseOrderId || order?.orderId || 'Pending'}
Tracking ID: ${order?.trackingId || order?.trackingNumber || 'Pending'}
Current Order Status: ${order?.currentStatus || order?.status || 'Order placed and delivery scheduled'}
Expected Delivery Timeline: ${order?.deliveryDays || parseLeadDays(tender)} days
Expected Delivery Date: ${order?.expectedDeliveryDate || 'To be confirmed'}
Delivery Address: ${requirementsData?.deliveryLocation || order?.deliveryLocation || 'Delivery address not specified'}
Supplier Contact / Source: ${tender?.tenderUrl || tender?.website || tender?.catalogueUrl || 'Supplier source link not available'}

Item Details:
${itemLines || 'Item details will be confirmed from the approved purchase order.'}

Next Steps:
The supplier has received the approved purchase order. Delivery tracking has been generated, and the order status will be updated as the delivery progresses.

Thank you,
Agentic Procurement Platform
`
  return {
    subject: ORDER_EMAIL_SUBJECT,
    body,
    gmailComposeUrl: recipient
      ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${encodeURIComponent(ORDER_EMAIL_SUBJECT)}&body=${encodeURIComponent(body)}`
      : '',
  }
}

function EmailStatus({ email }) {
  if (!email) return null
  const recipient = email.recipient || 'the company email'
  const failed = email.status === 'failed' || email.mode === 'missing-email' || email.mode === 'error'
  const statusText = failed
    ? 'Email notification failed'
    : email.status === 'preview_only'
      ? 'Email preview generated'
      : 'Confirmation Email Sent'
  const message = failed
    ? EMAIL_FAILURE_MESSAGE
    : email.status === 'preview_only'
      ? `Order approved successfully. Gmail/SMTP credentials are not configured, so a complete email preview was generated for ${recipient}; no real email was sent.`
      : `Order approved successfully. Delivery and tracking details have been sent to ${recipient}.`

  return (
    <div className={`email-status-card email-status-card--${email.status || 'unknown'}`}>
      <div>
        <strong>{statusText}</strong>
        <span>{email.recipient ? `Email Sent To: ${email.recipient}` : 'Company email not available'}</span>
        <p>{message}</p>
        {email.status === 'preview_only' && <p>Gmail/SMTP credentials are not configured, so the app is showing a mock email preview instead of silently failing.</p>}
        {failed && email.error && <p>SMTP error: {email.error}</p>}
        {!failed && email.message && <p>{email.message}</p>}
      </div>
      {email.gmailComposeUrl && (
        <a className="secondary-action compact-link-action" href={email.gmailComposeUrl} target="_blank" rel="noreferrer">Open Gmail Draft</a>
      )}
    </div>
  )
}

function EmailPreviewCard({ email }) {
  const body = email?.body || email?.preview
  if (!body) return null
  return (
    <div className="email-preview-card">
      <div className="email-preview-header">
        <div>
          <span>Email preview</span>
          <strong>{email.subject || ORDER_EMAIL_SUBJECT}</strong>
        </div>
        <small>Recipient: {email.recipient || 'Company email'}</small>
      </div>
      <pre>{body}</pre>
    </div>
  )
}

function buildOrderEmailPayload(requirementsData, tender, order) {
  return {
    companyEmail: requirementsData?.companyEmail || order?.recipientEmail || order?.contactEmail || '',
    companyName: requirementsData?.organization || order?.buyerOrganization || '',
    projectName: requirementsData?.title || requirementsData?.productCategory || order?.projectTitle || '',
    selectedSupplier: tender?.company || order?.supplier || '',
    selectedTender: tender?.tenderRef || tender?.id || order?.tenderRef || '',
    items: tender?.lines || order?.items || [],
    totalAmount: tender?.summary?.grandTotal || order?.totalQuote || 0,
    purchaseOrderId: order?.purchaseOrderId || order?.orderId || '',
    trackingId: order?.trackingId || order?.trackingNumber || '',
    deliveryAddress: requirementsData?.deliveryLocation || order?.deliveryLocation || '',
    deliveryDays: order?.deliveryDays || parseLeadDays(tender),
    expectedDeliveryDate: order?.expectedDeliveryDate || '',
    currentStatus: order?.currentStatus || order?.status || 'Order placed and delivery scheduled',
    requirements: requirementsData,
    tender,
    order,
  }
}

function updateEmailTimeline(order, email) {
  const emailOk = email?.status === 'sent' || email?.status === 'preview_only' || email?.mode === 'mock'
  const status = emailOk ? 'completed' : 'failed'
  const mapSteps = (steps = []) => steps.map((step) => (
    String(step.step || step.label || '').toLowerCase().includes('confirmation email')
      ? { ...step, status, date: new Date().toISOString().slice(0, 10) }
      : step
  ))
  return {
    ...order,
    timeline: mapSteps(order?.timeline || order?.statusSteps || []),
    statusSteps: mapSteps(order?.statusSteps || order?.timeline || []),
  }
}

async function sendOrderEmailNotification(requirementsData, tender, order) {
  const payload = buildOrderEmailPayload(requirementsData, tender, order)
  console.info('[Order Email] Calling POST /api/send-order-email', {
    recipient: payload.companyEmail,
    purchaseOrderId: payload.purchaseOrderId,
    trackingId: payload.trackingId,
    selectedSupplier: payload.selectedSupplier,
  })
  const response = await fetch(`${BACKEND_URL}/api/send-order-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch((error) => {
    console.error('[Order Email] Email API response could not be parsed', error)
    return null
  })
  console.info('[Order Email] /api/send-order-email response', { status: response.status, ok: response.ok, data })
  if (!data || !response.ok || data.status === 'failed') {
    console.error('[Order Email] Email notification failed', { status: response.status, data })
    const fallbackEmail = buildFallbackEmail(order, requirementsData, tender)
    return {
      status: 'failed',
      mode: data?.mode || 'error',
      recipient: payload.companyEmail,
      subject: data?.subject || fallbackEmail.subject,
      body: data?.body || data?.preview || fallbackEmail.body,
      preview: data?.preview || data?.body || fallbackEmail.body,
      gmailComposeUrl: data?.gmailComposeUrl || fallbackEmail.gmailComposeUrl,
      message: EMAIL_FAILURE_MESSAGE,
      error: data?.error || data?.message || 'Email service unavailable',
    }
  }
  return {
    ...data,
    recipient: data.recipient || payload.companyEmail,
    subject: data.subject || ORDER_EMAIL_SUBJECT,
    body: data.body || data.preview,
    preview: data.preview || data.body,
  }
}

function ApprovalWorkflowPage({ tenderAnalysis, selectedTender, requirementsData, onBack, onRestart, onOrderPlaced }) {
  const [decision, setDecision] = useState('Awaiting final business approval')
  const [order, setOrder] = useState(null)
  const [emailResult, setEmailResult] = useState(null)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const tender = getSelectedTender(selectedTender, tenderAnalysis)
  const lineCount = tender?.lines?.length || 0

  const orderLines = useMemo(() => tender?.lines || [], [tender])
  const explanation = useMemo(() => buildExplainableRecommendation(tenderAnalysis?.tenders || [], tender, requirementsData), [tenderAnalysis, tender, requirementsData])
  const statusBadge = order ? 'Order placed and tracking generated' : decision

  const handleApproveAndPlaceOrder = async () => {
    if (!tender || isPlacingOrder) return
    const companyEmail = String(requirementsData?.companyEmail || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) {
      console.error('[Approval] Missing or invalid companyEmail; approval email was not sent.', { companyEmail })
      setEmailResult({
        status: 'failed',
        mode: 'missing-email',
        recipient: companyEmail,
        subject: ORDER_EMAIL_SUBJECT,
        message: EMAIL_FAILURE_MESSAGE,
        error: 'Company email is missing or invalid in the Requirement Form.',
      })
      setDecision('Awaiting final business approval')
      return
    }

    setIsPlacingOrder(true)
    setDecision('Creating purchase order...')
    try {
      const placeOrderPayload = {
        requirements: requirementsData,
        tenderAnalysis,
        selectedTender: tender,
        toEmail: companyEmail,
        skipEmail: true,
      }
      console.info('[Approval] Calling POST /api/place-order', {
        recipient: companyEmail,
        selectedSupplier: tender?.company,
        selectedTender: tender?.tenderRef || tender?.id,
      })
      const response = await fetch(`${BACKEND_URL}/api/place-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(placeOrderPayload),
      })
      const data = await response.json().catch((error) => {
        console.error('[Approval] /api/place-order response could not be parsed', error)
        return null
      })
      console.info('[Approval] /api/place-order response', { ok: response.ok, status: response.status, data })
      if (!response.ok) throw new Error(data?.error || 'Delivery order service unavailable')
      if (!data?.success) throw new Error(data?.error || 'Unable to place delivery order')
      const email = await sendOrderEmailNotification(requirementsData, tender, data.order)
      const updatedOrder = updateEmailTimeline(data.order, email)
      setOrder(updatedOrder)
      setEmailResult(email)
      setDecision('Order placed and tracking generated')
      onOrderPlaced?.({ order: updatedOrder, email, tender })
    } catch (error) {
      console.error('[Approval] Order placement or email notification failed. Falling back to local order and email preview.', error)
      const fallbackOrder = buildLocalOrder(requirementsData, tender)
      let fallbackEmail
      try {
        fallbackEmail = await sendOrderEmailNotification(requirementsData, tender, fallbackOrder)
      } catch (emailError) {
        console.error('[Order Email] POST /api/send-order-email failed after fallback order creation.', emailError)
        const fallbackEmailDraft = buildFallbackEmail(fallbackOrder, requirementsData, tender)
        fallbackEmail = {
          status: 'failed',
          mode: 'error',
          recipient: companyEmail,
          subject: fallbackEmailDraft.subject,
          body: fallbackEmailDraft.body,
          preview: fallbackEmailDraft.body,
          gmailComposeUrl: fallbackEmailDraft.gmailComposeUrl,
          message: EMAIL_FAILURE_MESSAGE,
          error: emailError?.message || String(emailError),
        }
      }
      const updatedOrder = updateEmailTimeline(fallbackOrder, fallbackEmail)
      setOrder(updatedOrder)
      setEmailResult(fallbackEmail)
      setDecision('Order placed and tracking generated')
      onOrderPlaced?.({ order: updatedOrder, email: fallbackEmail, tender })
    } finally {
      setIsPlacingOrder(false)
    }
  }

  return (
    <main className="agentic-page approval-page">
      <section className="agentic-hero-card compact-hero">
        <div>
          <p className="page-eyebrow">Final Approval Agent</p>
          <h1>Approval and Order Placement</h1>
          <p className="hero-lead">The AI agents have completed supplier discovery, tender comparison, quote analysis, and recommendation. Once approved, the system places the order and generates delivery tracking details.</p>
        </div>
        <div className="workflow-summary-card">
          <strong>{statusBadge}</strong>
          <span>current status</span>
        </div>
      </section>

      <section className="approval-grid">
        <article className="agentic-card approval-card-main">
          <h2>{requirementsData?.title || 'Procurement approval'}</h2>
          <p>{requirementsData?.organization} • {requirementsData?.organizationType}</p>
          <div className="approval-summary-list">
            <div><span>Selected supplier/tender</span><strong>{tender?.company}</strong></div>
            <div><span>Total quote</span><strong>{formatCurrency(tender?.summary?.grandTotal)}</strong></div>
            <div><span>Delivery</span><strong>{tender?.leadTime}</strong></div>
            <div><span>Company email</span><strong>{requirementsData?.companyEmail || 'Not provided'}</strong></div>
            <div><span>Approval rule</span><strong>Automated supplier discovery with final business approval</strong></div>
          </div>
        </article>

        <article className="agentic-card approval-card-main">
          <h2>Decision controls</h2>
          <p>Select the final business action. Approval creates the purchase order, places the order with the supplier, generates tracking details, and sends the confirmation to the company email.</p>
          <div className="approval-actions">
            <button type="button" className="primary-action" onClick={handleApproveAndPlaceOrder} disabled={!tender || isPlacingOrder || !!order}>
              {isPlacingOrder ? 'Creating purchase order...' : order ? 'Order Placed' : 'Approve & Place Order'}
            </button>
            <button type="button" className="secondary-action" onClick={() => setDecision('Sent back for supplier negotiation')} disabled={!!order}>Request Negotiation</button>
            <button type="button" className="secondary-action" onClick={() => setDecision('Sent back for requirement revision')} disabled={!!order}>Revise Requirement</button>
          </div>
        </article>
      </section>

      <EmailStatus email={emailResult && !order ? emailResult : null} />

      <section className="agentic-card explainability-card">
        <div className="section-head-row">
          <div>
            <p className="page-eyebrow">Explainable AI Recommendation</p>
            <h2>Approval rationale</h2>
            <p>Use this explanation for business approval, internal audit, and supplier-selection justification.</p>
          </div>
        </div>
        <div className="explainability-grid">
          <article>
            <h3>Why this supplier</h3>
            <ul>{explanation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          </article>
          <article>
            <h3>Other supplier trade-offs</h3>
            <ul>{explanation.alternatives.length ? explanation.alternatives.slice(0, 4).map((item) => <li key={item.supplier}><strong>{item.supplier}:</strong> {item.reason}</li>) : <li>No alternative supplier trade-offs available.</li>}</ul>
          </article>
          <article>
            <h3>Approval note</h3>
            <ul>{explanation.tradeoffs.map((tradeoff) => <li key={tradeoff}>{tradeoff}</li>)}</ul>
          </article>
        </div>
      </section>

      {order && (
        <section className="agentic-card delivery-tracking-card">
          <div className="section-head-row">
            <div>
              <p className="page-eyebrow">Delivery placed</p>
              <h2>Order tracking details</h2>
              <p>Tracking details are stored on the approval screen and included in the company email.</p>
            </div>
            <div className="quote-total compact-total"><span>Purchase Order ID</span><strong>{order.purchaseOrderId || order.orderId}</strong></div>
          </div>

          <div className="tracking-summary-grid">
            <div><span>Supplier</span><strong>{order.supplier}</strong></div>
            <div><span>Product / Category</span><strong>{order.productCategory || productCategory(orderLines)}</strong></div>
            <div><span>Quantity</span><strong>{formatQuantity(orderLines)}</strong></div>
            <div><span>Total amount</span><strong>{formatCurrency(order.totalQuote)}</strong></div>
            <div><span>Expected delivery</span><strong>{order.deliveryDays} days • {formatDate(order.expectedDeliveryDate)}</strong></div>
            <div><span>Tracking ID</span><strong>{order.trackingId || order.trackingNumber}</strong></div>
            <div><span>Current status</span><strong>{order.currentStatus || order.status}</strong></div>
            <div><span>Delivery address</span><strong>{order.deliveryLocation}</strong></div>
            <div><span>Contact email</span><strong>{order.contactEmail || order.recipientEmail || requirementsData?.companyEmail}</strong></div>
          </div>

          <EmailStatus email={emailResult} />
          <EmailPreviewCard email={emailResult} />

          <div className="tracking-timeline">
            {(order.timeline || []).map((step, index) => (
              <div className={`tracking-step tracking-step--${step.status}`} key={`${step.step}-${index}`}>
                <span>{index + 1}</span>
                <div>
                  <strong>{step.step}</strong>
                  <small>{step.status} • {formatDate(step.date)}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="responsive-table quote-table order-lines-table">
            <div className="table-row table-head">
              <span>Item</span><span>Matched product</span><span>Qty</span><span>Unit price</span><span>Line total</span><span>Source</span>
            </div>
            {orderLines.map((line, index) => (
              <div className="table-row" key={`${line.sku || line.itemName}-${index}`}>
                <span>{line.itemName}</span>
                <span>{line.matchedProduct}<small>{line.sku}</small></span>
                <span>{line.quantity} {line.unit}</span>
                <span>{formatCurrency(line.unitPrice)}</span>
                <span>{formatCurrency(line.totalPrice)}</span>
                <span className="link-stack">
                  {line.productUrl && <a href={line.productUrl} target="_blank" rel="noreferrer">Product</a>}
                  {line.sourceUrl && <a href={line.sourceUrl} target="_blank" rel="noreferrer">Source</a>}
                  {!line.productUrl && !line.sourceUrl && <small className="source-unavailable">Source unavailable</small>}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="agentic-card action-panel-3d">
        <div>
          <h2>{order ? 'Delivery order is now placed' : statusBadge}</h2>
          <p>{order ? `${lineCount} product lines are attached to the delivery order. Use the tracking details for follow-up and audit.` : 'The automated analysis is complete. The business user must approve before the purchase order and delivery tracking are generated.'}</p>
        </div>
        <div className="action-button-row">
          <button type="button" className="secondary-action" onClick={onBack}>Back to Recommendation</button>
          <button type="button" className="primary-action" onClick={onRestart}>Start New Requirement</button>
        </div>
      </section>
    </main>
  )
}

export default ApprovalWorkflowPage
