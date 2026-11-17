import { useState } from 'react'
import './App.css'
import './theme3d.css'
import HomePage from './components/HomePage'
import RequirementsPage from './components/RequirementsPage'
import TenderResults from './components/TenderResults'
import AgentWorkflowPage from './components/AgentWorkflowPage'
import MarketPricePage from './components/MarketPricePage'
import SupplierComparisonPage from './components/SupplierComparisonPage'
import QuoteSummaryPage from './components/QuoteSummaryPage'
import FinalRecommendationPage from './components/FinalRecommendationPage'
import ApprovalWorkflowPage from './components/ApprovalWorkflowPage'
import OrderTrackingPage from './components/OrderTrackingPage'
import SceneBackdrop3D from './components/SceneBackdrop3D'
import ProcurementChatAssistant from './components/ProcurementChatAssistant'
import { formatCurrency, getSelectedTender, slugify } from './components/procurementDisplay'
import { buildNotificationEntries, buildPurchaseOrderPayload } from './components/enterpriseFeatures'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

const STEPS = [
  { id: 0, key: 'home', label: 'Home', view: 'home' },
  { id: 1, key: 'requirements', label: 'Requirement Form', view: 'requirements' },
  { id: 2, key: 'agents', label: 'Agent Workflow', view: 'agents' },
  { id: 3, key: 'tenders', label: 'Tender Results', view: 'tenders' },
  { id: 4, key: 'marketPrices', label: 'Market Prices', view: 'marketPrices' },
  { id: 5, key: 'supplierComparison', label: 'Supplier Comparison', view: 'supplierComparison' },
  { id: 6, key: 'quoteSummary', label: 'Quote Summary', view: 'quoteSummary' },
  { id: 7, key: 'recommendation', label: 'Recommendation', view: 'recommendation' },
  { id: 8, key: 'approval', label: 'Approval', view: 'approval' },
  { id: 9, key: 'orderTracking', label: 'Order Tracking', view: 'orderTracking' },
]

const VIEW_STEP = STEPS.reduce((acc, step) => ({ ...acc, [step.view]: step.id }), {})

function convertTenderToRfpData(tender, tenderAnalysis, requirementsData) {
  const project = requirementsData || tenderAnalysis?.requirements || {}
  const selectedTender = tender || tenderAnalysis?.recommendedTender || {}
  const lines = selectedTender.lines || []
  const summary = selectedTender.summary || {}
  const itemTotal = Number(summary.itemTotal || 0)
  const freight = Number(summary.freight || 0)
  const testing = Number(summary.testing || 0)
  const insurance = Number(summary.insurance || 0)
  const gst = Number(summary.gst || 0)
  const grandTotal = Number(summary.grandTotal || 0)
  const additionalTotal = freight + insurance
  const subtotal = itemTotal + testing + additionalTotal

  const lineItems = lines.map((line, index) => ({
    lineNo: index + 1,
    requestedName: line.itemName,
    name: line.matchedProduct,
    catalogDescription: line.matchedProduct,
    sku: line.sku,
    quantity: Number(line.quantity || 0),
    unit: line.unit || 'units',
    quantityLabel: `${line.quantity || 0} ${line.unit || 'units'}`,
    unitPrice: Number(line.unitPrice || 0),
    totalPrice: Number(line.totalPrice || 0),
    priceSource: line.priceSource || 'Source-linked market pricing',
    supplierName: line.supplierName || selectedTender.company || 'Selected supplier',
    productUrl: line.productUrl || '',
    sourceUrl: line.sourceUrl || line.productUrl || '',
    matchPercentage: Number(line.matchScore || selectedTender.matchScore || 85),
    specifications: {
      Requirement: line.itemName,
      Product: line.matchedProduct,
      SKU: line.sku,
      Source: line.priceSource || 'Source-linked market pricing',
      Supplier: line.supplierName || selectedTender.company || 'Selected supplier',
      Link: line.productUrl || line.sourceUrl || selectedTender.tenderUrl || '',
    },
    standards: 'Vendor to confirm applicable IS / IEC / BIS standards where applicable',
    alternatives: [],
  }))

  return {
    id: selectedTender.tenderRef || selectedTender.id || `TENDER-${Date.now()}`,
    title: `${project.title || 'Procurement Requirement'} - ${selectedTender.company || 'Selected Company'}`,
    source: selectedTender.company || 'Recommended supplier',
    companyName: selectedTender.company || 'Recommended supplier',
    tenderUrl: selectedTender.tenderUrl || selectedTender.website || '',
    sourceSuppliers: selectedTender.sourceSuppliers || [],
    dueDate: selectedTender.validity || '30 days validity',
    daysRemaining: 30,
    productCategories: lines.map((line) => line.matchedProduct).slice(0, 4),
    estimatedValue: formatCurrency(grandTotal),
    priority: 'high',
    matchScore: selectedTender.matchScore,
    estimatedDelivery: selectedTender.leadTime || 'As per tender response',
    priceSource: tenderAnalysis?.pricingMode === 'live' ? 'Live price feed' : 'Source-linked market pricing',
    warranty: project.warrantyRequirement || 'Standard OEM warranty and supplier terms',
    paymentTerms: project.commercialTerms || 'To be finalized during purchase order negotiation',
    validUntil: selectedTender.validity || '30 days',
    lineItems,
    requirements: project,
    pricing: {
      materials: lineItems.map((item) => ({
        sku: item.sku,
        name: item.name,
        quantity: item.quantityLabel,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        priceSource: item.priceSource,
        supplierName: item.supplierName,
        productUrl: item.productUrl,
        sourceUrl: item.sourceUrl,
      })),
      tests: [{ testName: 'Routine quality tests / compliance check', applicableTo: 'All selected SKUs', cost: testing, duration: '2-4 days' }],
      additionalCosts: [
        { item: 'Freight / logistics', cost: freight },
        { item: 'Insurance', cost: insurance },
      ],
      summary: { materialTotal: itemTotal, testTotal: testing, additionalTotal, subtotal, gst, grandTotal },
    },
  }
}

function App() {
  const [activeView, setActiveView] = useState('home')
  const [requirementsData, setRequirementsData] = useState(null)
  const [tenderAnalysis, setTenderAnalysis] = useState(null)
  const [selectedTender, setSelectedTender] = useState(null)
  const [rfpData, setRfpData] = useState(null)
  const [downloadStatus, setDownloadStatus] = useState('')
  const [orderDetails, setOrderDetails] = useState(null)
  const [orderEmailResult, setOrderEmailResult] = useState(null)
  const [notificationHistory, setNotificationHistory] = useState([])

  const activeStep = VIEW_STEP[activeView] ?? 0

  const startRequirement = () => {
    setActiveView('requirements')
  }

  const handleRequirementSubmit = (requirements) => {
    setRequirementsData(requirements)
    setTenderAnalysis(null)
    setSelectedTender(null)
    setRfpData(null)
    setDownloadStatus('')
    setOrderDetails(null)
    setOrderEmailResult(null)
    setNotificationHistory([])
    setActiveView('agents')
  }

  const handleTenderDataReady = (analysis) => {
    setTenderAnalysis(analysis)
    if (!selectedTender && analysis?.recommendedTender) {
      setSelectedTender(analysis.recommendedTender)
      setRfpData(convertTenderToRfpData(analysis.recommendedTender, analysis, requirementsData))
    }
  }

  const handleTenderSelected = (tender, analysis = tenderAnalysis) => {
    if (!tender || !Array.isArray(tender.lines) || tender.lines.length === 0) return
    setTenderAnalysis(analysis)
    setSelectedTender(tender)
    setRfpData(convertTenderToRfpData(tender, analysis, requirementsData))
    setActiveView('marketPrices')
  }

  const updateSelectedTender = (tender) => {
    setSelectedTender(tender)
    setRfpData(convertTenderToRfpData(tender, tenderAnalysis, requirementsData))
  }

  const downloadFallbackDocument = () => {
    const projectTitle = requirementsData?.title || 'Procurement RFP'
    const tenders = tenderAnalysis?.tenders || []
    const selected = getSelectedTender(selectedTender, tenderAnalysis)
    const rows = tenders.map((tender) => `
      <tr><td>${tender.rank}</td><td>${tender.company}</td><td>${tender.tenderRef}</td><td>${tender.matchScore}%</td><td>${tender.technicalScore}%</td><td>${tender.commercialScore}%</td><td>${tender.leadTime}</td><td>${formatCurrency(tender.summary?.grandTotal)}</td><td>${tender.tenderUrl || tender.catalogueUrl || tender.website || ''}</td></tr>
    `).join('')
    const itemRows = (tenderAnalysis?.requestedItems || requirementsData?.items || []).map((item, index) => `<tr><td>${index + 1}</td><td>${item.name}</td><td>${item.quantity || 0}</td><td>${item.unit || 'units'}</td><td>${item.technicalSpecifications || ''}</td></tr>`).join('')
    const sourceRows = tenders.flatMap((tender) => tender.lines || []).map((line) => `
      <tr><td>${line.itemName}</td><td>${line.supplierName || ''}</td><td>${line.matchedProduct}</td><td>${formatCurrency(line.unitPrice)}</td><td>${formatCurrency(line.totalPrice)}</td><td>${line.productUrl || line.sourceUrl || ''}</td></tr>
    `).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${projectTitle} - RFP Document</title><style>body{font-family:Arial,sans-serif;color:#111827;line-height:1.5}table{width:100%;border-collapse:collapse;margin:14px 0 24px}th,td{border:1px solid #d1d5db;padding:8px;text-align:left;vertical-align:top}th{background:#eef2ff}</style></head><body><h1>Request for Proposal</h1><p>Generated on ${new Date().toLocaleString('en-IN')}</p><h2>1. Project Details</h2><p><strong>Project:</strong> ${projectTitle}</p><p><strong>Organization:</strong> ${requirementsData?.organization || 'Not specified'}</p><p><strong>Company Email:</strong> ${requirementsData?.companyEmail || 'Not specified'}</p><p><strong>Organization Type:</strong> ${requirementsData?.organizationType || 'Not specified'}</p><p><strong>Delivery Location:</strong> ${requirementsData?.deliveryLocation || 'Not specified'}</p><p><strong>Delivery Deadline:</strong> ${requirementsData?.deliveryDeadline || 'Not specified'}</p><p><strong>Budget:</strong> ${formatCurrency(requirementsData?.budget)}</p><h2>2. Required Items</h2><table><thead><tr><th>#</th><th>Item</th><th>Quantity</th><th>Unit</th><th>Technical Specs</th></tr></thead><tbody>${itemRows}</tbody></table><h2>3. Tender Comparison</h2><table><thead><tr><th>Rank</th><th>Company</th><th>Tender Ref</th><th>Overall</th><th>Technical</th><th>Commercial</th><th>Lead Time</th><th>Total Quote</th><th>Tender Link</th></tr></thead><tbody>${rows}</tbody></table><h2>4. Selected Tender</h2><p><strong>${selected?.company || 'Not selected'}</strong> - ${formatCurrency(selected?.summary?.grandTotal)}</p><h2>5. Product Source Links</h2><table><thead><tr><th>Requested Item</th><th>Supplier</th><th>Matched Product</th><th>Unit Price</th><th>Total</th><th>Preview / Source Link</th></tr></thead><tbody>${sourceRows}</tbody></table><h2>6. Approval Note</h2><p>AI agents assisted with supplier discovery, tender matching, market price analysis, quote comparison and recommendation. Final approval remains with the business user.</p></body></html>`
    const blob = new Blob([html], { type: 'application/msword' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${slugify(projectTitle)}-rfp-document.doc`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  }

  const handleDownloadRfp = async () => {
    setDownloadStatus('Preparing RFP document...')
    try {
      const response = await fetch(`${BACKEND_URL}/api/generate-rfp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirements: requirementsData, tenderAnalysis, selectedTender }),
      })
      if (!response.ok) throw new Error('Backend PDF generator unavailable')
      const blob = await response.blob()
      const fileName = `${slugify(requirementsData?.title)}-rfp-document.pdf`
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
      setDownloadStatus('RFP PDF downloaded.')
    } catch (error) {
      console.error(error)
      downloadFallbackDocument()
      setDownloadStatus('RFP document downloaded with browser fallback.')
    }
  }

  const resetProcess = () => {
    setActiveView('requirements')
    setRequirementsData(null)
    setTenderAnalysis(null)
    setSelectedTender(null)
    setRfpData(null)
    setDownloadStatus('')
    setOrderDetails(null)
    setOrderEmailResult(null)
    setNotificationHistory([])
  }

  const addNotification = (item) => {
    setNotificationHistory((current) => [
      {
        id: item?.id || `notice-${Date.now()}`,
        timestamp: item?.timestamp || new Date().toISOString(),
        status: item?.status || 'Sent',
        type: item?.type || 'Notification',
        message: item?.message || 'Notification generated.',
        recipient: item?.recipient || '',
        reason: item?.reason || '',
      },
      ...current,
    ])
  }

  const createOrderEmailPayload = () => ({
    companyEmail: requirementsData?.companyEmail || orderDetails?.recipientEmail || orderDetails?.contactEmail || '',
    companyName: requirementsData?.organization || orderDetails?.buyerOrganization || '',
    projectName: requirementsData?.title || requirementsData?.productCategory || orderDetails?.projectTitle || '',
    selectedSupplier: selectedTender?.company || orderDetails?.supplier || '',
    selectedTender: selectedTender?.tenderRef || selectedTender?.id || orderDetails?.tenderRef || '',
    items: selectedTender?.lines || orderDetails?.items || [],
    totalAmount: selectedTender?.summary?.grandTotal || orderDetails?.totalQuote || 0,
    purchaseOrderId: orderDetails?.purchaseOrderId || orderDetails?.orderId || '',
    trackingId: orderDetails?.trackingId || orderDetails?.trackingNumber || '',
    deliveryAddress: requirementsData?.deliveryLocation || orderDetails?.deliveryLocation || '',
    deliveryDays: orderDetails?.deliveryDays || selectedTender?.leadTime || '',
    expectedDeliveryDate: orderDetails?.expectedDeliveryDate || '',
    currentStatus: orderDetails?.currentStatus || orderDetails?.status || 'Order placed and delivery scheduled',
    requirements: requirementsData,
    tender: selectedTender,
    order: orderDetails,
    requestId: orderDetails?.purchaseOrderId || orderDetails?.orderId || requirementsData?.title || 'default-request',
  })

  const handleDownloadPurchaseOrder = async () => {
    const payload = buildPurchaseOrderPayload({ requirementsData, tenderAnalysis, selectedTender, orderDetails })
    const response = await fetch(`${BACKEND_URL}/api/generate-purchase-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error('Purchase Order PDF generator unavailable')
    const blob = await response.blob()
    const poId = orderDetails?.purchaseOrderId || orderDetails?.orderId || 'purchase-order'
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${slugify(poId)}-purchase-order.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
    addNotification({ type: 'PO generated', message: `Purchase Order PDF downloaded for ${poId}.`, status: 'Sent' })
  }

  const handleResendEmail = async () => {
    try {
      const payload = createOrderEmailPayload()
      console.info('[Notification History] Calling POST /api/resend-email', { recipient: payload.companyEmail, purchaseOrderId: payload.purchaseOrderId })
      const response = await fetch(`${BACKEND_URL}/api/resend-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => null)
      console.info('[Notification History] /api/resend-email response', { ok: response.ok, status: response.status, data })
      if (!response.ok || !data?.success) throw new Error(data?.error || data?.message || 'Email resend failed')
      setOrderEmailResult((current) => ({ ...(current || {}), ...data, recipient: data.recipient || payload.companyEmail }))
      addNotification(data.notification || { type: 'Resend Email', message: data.message || 'Order confirmation email resent.', recipient: data.recipient || payload.companyEmail, status: data.status === 'sent' ? 'Sent' : 'Pending' })
    } catch (error) {
      console.error('[Notification History] Resend email failed', error)
      addNotification({ type: 'Resend Email', message: 'Order approved, but email notification failed. Please check email configuration.', recipient: requirementsData?.companyEmail || '', status: 'Failed', reason: error.message })
    }
  }

  const handleOrderPlaced = ({ order, email }) => {
    setOrderDetails(order)
    setOrderEmailResult(email)
    setNotificationHistory(buildNotificationEntries(order, email))
    setActiveView('orderTracking')
  }

  const renderContent = () => {
    switch (activeView) {
      case 'home':
        return <HomePage onStart={startRequirement} />
      case 'requirements':
        return <RequirementsPage onFindSuppliers={handleRequirementSubmit} />
      case 'agents':
        return (
          <AgentWorkflowPage
            requirementsData={requirementsData}
            tenderAnalysis={tenderAnalysis}
            selectedTender={selectedTender}
            onRunMatching={() => setActiveView('tenders')}
            onContinue={() => setActiveView('tenders')}
          />
        )
      case 'tenders':
        return (
          <TenderResults
            requirementsData={requirementsData}
            loginData={null}
            onContinueWorkflow={handleTenderSelected}
            onBackToRequirements={() => setActiveView('requirements')}
            onTenderDataReady={handleTenderDataReady}
          />
        )
      case 'marketPrices':
        return <MarketPricePage tenderAnalysis={tenderAnalysis} selectedTender={selectedTender} onBack={() => setActiveView('tenders')} onNext={() => setActiveView('supplierComparison')} />
      case 'supplierComparison':
        return <SupplierComparisonPage tenderAnalysis={tenderAnalysis} selectedTender={selectedTender} onSelectTender={updateSelectedTender} onBack={() => setActiveView('marketPrices')} onNext={() => setActiveView('quoteSummary')} />
      case 'quoteSummary':
        return <QuoteSummaryPage tenderAnalysis={tenderAnalysis} selectedTender={selectedTender} rfpData={rfpData} onBack={() => setActiveView('supplierComparison')} onNext={() => setActiveView('recommendation')} onDownloadRfp={handleDownloadRfp} downloadStatus={downloadStatus} />
      case 'recommendation':
        return <FinalRecommendationPage tenderAnalysis={tenderAnalysis} selectedTender={selectedTender} requirementsData={requirementsData} onBack={() => setActiveView('quoteSummary')} onNext={() => setActiveView('approval')} />
      case 'approval':
        return <ApprovalWorkflowPage tenderAnalysis={tenderAnalysis} selectedTender={selectedTender} requirementsData={requirementsData} onBack={() => setActiveView('recommendation')} onRestart={resetProcess} onOrderPlaced={handleOrderPlaced} />
      case 'orderTracking':
        return <OrderTrackingPage orderDetails={orderDetails} emailResult={orderEmailResult} tenderAnalysis={tenderAnalysis} selectedTender={selectedTender} requirementsData={requirementsData} notificationHistory={notificationHistory} onDownloadPurchaseOrder={handleDownloadPurchaseOrder} onResendEmail={handleResendEmail} onNotification={addNotification} onBack={() => setActiveView('approval')} onRestart={resetProcess} />
      default:
        return <HomePage onStart={startRequirement} />
    }
  }

  return (
    <div className="app app-workspace-3d procurement-platform-app">
      <SceneBackdrop3D />
      <div className="app-shell procurement-shell">
        <header className="app-header procurement-header">
          <div className="brand">
            <button type="button" className="brand-mark brand-button" onClick={() => setActiveView('home')}>AI</button>
            <div className="brand-copy">
              <h1>Agentic Procurement Workspace</h1>
              <p>Automated supplier discovery with final business approval.</p>
            </div>
          </div>

          <nav className="stepper procurement-stepper" aria-label="Procurement process steps">
            {STEPS.map((step) => {
              const isActive = activeStep === step.id
              const isCompleted = activeStep > step.id
              const canOpen = step.id <= activeStep || step.view === 'requirements' || step.view === 'home' || (step.view === 'orderTracking' && orderDetails)
              return (
                <button
                  type="button"
                  key={step.key}
                  className={`stepper-item ${isActive ? 'stepper-item--active' : ''} ${isCompleted ? 'stepper-item--complete' : ''}`}
                  onClick={() => canOpen && setActiveView(step.view)}
                  disabled={!canOpen}
                >
                  <span className="stepper-pill">
                    <span className="stepper-index">{step.id}</span>
                    <span className="stepper-label">{step.label}</span>
                  </span>
                </button>
              )
            })}
          </nav>
        </header>

        <main className="app-main procurement-main">
          <section className={`app-panel procurement-panel procurement-panel--${activeView}`}>{renderContent()}</section>
        </main>

        <ProcurementChatAssistant context={{ requirementsData, tenderAnalysis, selectedTender, orderDetails, orderEmailResult }} />

        <footer className="app-footer">
          <div className="footer-inner">
            <span>© 2026 Agentic Procurement Platform</span>
            <span className="footer-divider" />
            <span>AI-assisted matching, business-user final approval</span>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App
