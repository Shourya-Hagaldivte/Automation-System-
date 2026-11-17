import { formatCurrency, formatPercent, safeNumber } from './procurementDisplay'

export const procurementTemplates = [
  {
    id: 'classroom-setup',
    name: 'Classroom setup',
    description: 'Furniture, AV and electrical items for a classroom upgrade.',
    items: [
      { productCategory: 'Furniture', name: 'Classroom benches', quantity: '30', unit: 'pieces', technicalSpecifications: '2-seater classroom bench desk set, durable laminate top', preferredBrand: 'Godrej, Nilkamal, local institutional furniture supplier' },
      { productCategory: 'IT / AV equipment', name: 'Business projector', quantity: '1', unit: 'pieces', technicalSpecifications: 'XGA / WXGA classroom projector, minimum 3300 lumens', preferredBrand: 'Epson, BenQ' },
      { productCategory: 'Lighting', name: 'LED lights', quantity: '20', unit: 'pieces', technicalSpecifications: '20W LED batten or panel light with minimum 1 year warranty', preferredBrand: 'Wipro, Philips, Havells' },
      { productCategory: 'Electrical', name: 'Ceiling fans', quantity: '6', unit: 'pieces', technicalSpecifications: '1200 mm BEE-rated ceiling fan', preferredBrand: 'Havells, Crompton, Orient' },
      { productCategory: 'Office supplies', name: 'Whiteboard', quantity: '1', unit: 'pieces', technicalSpecifications: 'Magnetic whiteboard with wall mount kit', preferredBrand: 'Quartet, Pragati, local supplier' },
      { productCategory: 'Electrical', name: 'Electrical wiring', quantity: '200', unit: 'meters', technicalSpecifications: '2.5 sq.mm FR copper wire, IS 694 compliant', preferredBrand: 'Havells, Polycab, Finolex' },
    ],
  },
  {
    id: 'hospital-ward-setup',
    name: 'Hospital ward setup',
    description: 'Basic ward furniture, lighting, electrical and service accessories.',
    items: [
      { productCategory: 'Hospital / institutional supplies', name: 'Hospital beds', quantity: '10', unit: 'pieces', technicalSpecifications: 'Semi-fowler hospital bed with side rail', preferredBrand: 'Godrej Interio, Midmark, local hospital furniture supplier' },
      { productCategory: 'Lighting', name: 'LED panel lights', quantity: '24', unit: 'pieces', technicalSpecifications: '12W to 18W LED panel light, glare controlled', preferredBrand: 'Philips, Wipro, Havells' },
      { productCategory: 'Electrical', name: 'MCB distribution board', quantity: '2', unit: 'pieces', technicalSpecifications: 'DB with MCB protection and earthing provision', preferredBrand: 'Schneider, Havells, Legrand' },
      { productCategory: 'Facility maintenance', name: 'Cleaning trolley', quantity: '3', unit: 'pieces', technicalSpecifications: 'Hospital housekeeping trolley with bins and wringer', preferredBrand: 'Roots, local housekeeping supplier' },
    ],
  },
  {
    id: 'office-setup',
    name: 'Office setup',
    description: 'Office furniture, lighting, networking and basic utilities.',
    items: [
      { productCategory: 'Furniture', name: 'Modular office chairs', quantity: '25', unit: 'pieces', technicalSpecifications: 'Ergonomic chair with adjustable height and back support', preferredBrand: 'Godrej, Featherlite, Green Soul' },
      { productCategory: 'Furniture', name: 'Office workstations', quantity: '25', unit: 'pieces', technicalSpecifications: 'Modular workstation with cable management', preferredBrand: 'Godrej, Featherlite' },
      { productCategory: 'Lighting', name: 'LED panel lights', quantity: '30', unit: 'pieces', technicalSpecifications: '18W panel lights, neutral white', preferredBrand: 'Philips, Wipro, Havells' },
      { productCategory: 'IT / AV equipment', name: 'WiFi router', quantity: '4', unit: 'pieces', technicalSpecifications: 'Business router/access point with warranty', preferredBrand: 'TP-Link, Cisco, Aruba' },
    ],
  },
  {
    id: 'park-maintenance-kit',
    name: 'Park maintenance kit',
    description: 'Gardening, outdoor lighting and maintenance materials.',
    items: [
      { productCategory: 'Facility maintenance', name: 'Garden tools kit', quantity: '5', unit: 'sets', technicalSpecifications: 'Rake, pruning cutter, shovel and gloves kit', preferredBrand: 'Falcon, local supplier' },
      { productCategory: 'Lighting', name: 'Outdoor LED flood lights', quantity: '12', unit: 'pieces', technicalSpecifications: '50W IP65 outdoor LED flood light', preferredBrand: 'Philips, Wipro, Havells' },
      { productCategory: 'Facility maintenance', name: 'Waste bins', quantity: '20', unit: 'pieces', technicalSpecifications: 'Twin-dustbin outdoor waste bins with stand', preferredBrand: 'Nilkamal, Sintex' },
    ],
  },
  {
    id: 'electrical-maintenance-kit',
    name: 'Electrical maintenance kit',
    description: 'Common wiring, switchgear and lighting items for facility maintenance.',
    items: [
      { productCategory: 'Electrical', name: '2.5 sq.mm copper wire', quantity: '500', unit: 'meters', technicalSpecifications: 'FR copper house wire, IS 694 compliant', preferredBrand: 'Havells, Polycab, Finolex' },
      { productCategory: 'Electrical', name: '25A MCB', quantity: '20', unit: 'pieces', technicalSpecifications: '25A SP MCB, 10kA breaking capacity preferred', preferredBrand: 'Havells, Schneider, Legrand' },
      { productCategory: 'Lighting', name: 'LED batten lights', quantity: '50', unit: 'pieces', technicalSpecifications: '20W LED batten light', preferredBrand: 'Wipro, Havells, Philips' },
      { productCategory: 'Electrical', name: 'Switches and sockets', quantity: '100', unit: 'pieces', technicalSpecifications: 'Modular switches and sockets with plates', preferredBrand: 'Anchor, Legrand, Havells' },
    ],
  },
  {
    id: 'construction-material-package',
    name: 'Construction material package',
    description: 'Core materials for small construction or renovation work.',
    items: [
      { productCategory: 'Construction material', name: 'TMT steel rods', quantity: '2', unit: 'tons', technicalSpecifications: 'Fe500/Fe550 TMT bars as per site BOQ', preferredBrand: 'Tata Tiscon, JSW, SAIL' },
      { productCategory: 'Construction material', name: 'Cement bags', quantity: '200', unit: 'bags', technicalSpecifications: 'OPC/PPC cement as per structural requirement', preferredBrand: 'UltraTech, ACC, Ambuja' },
      { productCategory: 'Construction material', name: 'Construction paint', quantity: '50', unit: 'packs', technicalSpecifications: 'Interior/exterior paint as per finish schedule', preferredBrand: 'Asian Paints, Berger, Nerolac' },
    ],
  },
  {
    id: 'computer-lab-setup',
    name: 'Computer lab setup',
    description: 'IT, furniture, AV and electrical items for a lab.',
    items: [
      { productCategory: 'IT / AV equipment', name: 'Desktop computers', quantity: '30', unit: 'pieces', technicalSpecifications: 'Business desktop with monitor, keyboard, mouse and 3-year warranty preferred', preferredBrand: 'Dell, HP, Lenovo' },
      { productCategory: 'Furniture', name: 'Computer lab tables', quantity: '30', unit: 'pieces', technicalSpecifications: 'Computer table with keyboard tray and cable management', preferredBrand: 'Godrej, Featherlite, local supplier' },
      { productCategory: 'IT / AV equipment', name: 'Network switches', quantity: '2', unit: 'pieces', technicalSpecifications: '24-port managed/unmanaged switch as per lab requirement', preferredBrand: 'Cisco, TP-Link, D-Link' },
      { productCategory: 'Electrical', name: 'UPS backup', quantity: '2', unit: 'pieces', technicalSpecifications: 'UPS backup suitable for lab load', preferredBrand: 'APC, Numeric, Microtek' },
    ],
  },
]

const suggestionMap = [
  { match: ['projector'], suggestions: ['Projector screen', 'HDMI cable', 'Ceiling mount', 'Speaker', 'Installation service', 'Warranty extension'] },
  { match: ['led', 'light', 'lighting', 'bulb', 'batten', 'panel'], suggestions: ['Electrical wiring', 'Switches', 'MCB', 'Installation service', 'Warranty extension'] },
  { match: ['bench', 'desk', 'chair', 'furniture'], suggestions: ['Whiteboard', 'Classroom storage cabinet', 'Installation service', 'Warranty extension'] },
  { match: ['wire', 'wiring', 'cable'], suggestions: ['MCB', 'Distribution board', 'Switches and sockets', 'Conduit pipe', 'Testing and commissioning'] },
  { match: ['steel', 'tmt', 'cement', 'construction'], suggestions: ['Binding wire', 'Sand aggregate', 'Safety helmets', 'Site inspection service'] },
  { match: ['computer', 'desktop', 'laptop'], suggestions: ['UPS backup', 'Network switch', 'WiFi router', 'Antivirus license', 'Installation service'] },
]

export function relatedProductSuggestions(items = []) {
  const existing = new Set(items.map((item) => String(item.name || '').toLowerCase()))
  const seen = new Set()
  const suggestions = []
  items.forEach((item) => {
    const text = `${item.name || ''} ${item.productCategory || item.category || ''}`.toLowerCase()
    suggestionMap.forEach((rule) => {
      if (rule.match.some((word) => text.includes(word))) {
        rule.suggestions.forEach((name) => {
          const key = name.toLowerCase()
          if (!existing.has(key) && !seen.has(key)) {
            seen.add(key)
            suggestions.push({
              name,
              reason: `Suggested because you added ${item.name || item.productCategory || 'a related product'}`,
              productCategory: name.toLowerCase().includes('installation') ? 'Facility maintenance' : name.toLowerCase().includes('wiring') || name.toLowerCase().includes('mcb') || name.toLowerCase().includes('switch') ? 'Electrical' : name.toLowerCase().includes('screen') || name.toLowerCase().includes('speaker') || name.toLowerCase().includes('hdmi') ? 'IT / AV equipment' : 'Custom / other',
              unit: name.toLowerCase().includes('service') || name.toLowerCase().includes('warranty') || name.toLowerCase().includes('testing') ? 'sets' : 'pieces',
            })
          }
        })
      }
    })
  })
  return suggestions.slice(0, 8)
}

export function buildRiskScores(tenders = [], requirements = {}) {
  const complianceNeeded = Boolean(requirements?.complianceRequirements)
  return tenders.map((tender) => {
    const reasons = []
    const sourceUnavailable = (tender.lines || []).some((line) => line.sourceUnavailable || String(line.sourceStatus || '').toLowerCase().includes('unavailable'))
    const missingWarranty = !requirements?.warrantyRequirement && !(tender.warranty || tender.certifications || []).length
    const quote = safeNumber(tender.summary?.grandTotal)
    const avgQuote = tenders.length ? tenders.reduce((sum, item) => sum + safeNumber(item.summary?.grandTotal), 0) / tenders.length : quote
    const priceAbove = avgQuote > 0 ? ((quote - avgQuote) / avgQuote) * 100 : 0
    const deliveryDays = safeNumber(String(tender.leadTime || '').match(/\d+/)?.[0], 14)
    let risk = 18
    if (sourceUnavailable) { risk += 22; reasons.push('Live source unavailable or not fully verified') }
    if (missingWarranty) { risk += 12; reasons.push('Warranty requirement not clearly documented') }
    if (complianceNeeded && !(tender.certifications || tender.compliance || []).length) { risk += 12; reasons.push('Compliance certificate needs supplier confirmation') }
    if (priceAbove > 7) { risk += Math.min(18, Math.round(priceAbove)); reasons.push(`Quote is ${Math.round(priceAbove)}% above supplier average`) }
    if (deliveryDays > 21) { risk += 12; reasons.push('Longer delivery timeline than preferred') }
    if (safeNumber(tender.matchScore) < 75) { risk += 10; reasons.push('Lower overall match score') }
    if (!tender.tenderUrl && !tender.website && !tender.catalogueUrl) { risk += 10; reasons.push('Supplier source link missing') }
    const rating = safeNumber(tender.rating || tender.supplierRating, 4)
    if (rating < 4) { risk += 8; reasons.push('Supplier rating below preferred benchmark') }
    const score = Math.max(0, Math.min(100, risk))
    const level = score >= 70 ? 'High Risk' : score >= 40 ? 'Medium Risk' : 'Low Risk'
    return {
      id: tender.id || tender.tenderRef || tender.company,
      supplier: tender.company || 'Supplier',
      score,
      level,
      status: level === 'Low Risk' ? 'Compliant with standard checks' : 'Needs procurement review',
      reasons: reasons.length ? reasons : ['Verified source, acceptable delivery, and quote within benchmark range'],
      recommendation: level === 'High Risk' ? 'Request updated compliance documents before approval.' : level === 'Medium Risk' ? 'Proceed with approval after confirming warranty/source details.' : 'Proceed with normal business approval.',
    }
  })
}

export function buildNegotiationSuggestions(tenders = [], selectedTender = null, requirements = {}) {
  const selected = selectedTender || tenders[0]
  if (!selected) return []
  const avgQuote = tenders.length ? tenders.reduce((sum, tender) => sum + safeNumber(tender.summary?.grandTotal), 0) / tenders.length : safeNumber(selected.summary?.grandTotal)
  const selectedQuote = safeNumber(selected.summary?.grandTotal)
  const selectedDays = safeNumber(String(selected.leadTime || '').match(/\d+/)?.[0], 14)
  const bestDelivery = Math.min(...tenders.map((tender) => safeNumber(String(tender.leadTime || '').match(/\d+/)?.[0], 14)))
  const suggestions = []
  if (avgQuote > 0 && selectedQuote > avgQuote * 1.05) {
    suggestions.push({ type: 'Bulk discount', text: `${selected.company} is ${Math.round(((selectedQuote - avgQuote) / avgQuote) * 100)}% higher than the current supplier average. Ask for a bulk discount or revised quote.`, action: 'Request revised quote' })
  } else {
    suggestions.push({ type: 'Price lock', text: 'Ask the selected supplier to lock the quoted rates until purchase order issue and delivery completion.', action: 'Accept suggestion' })
  }
  if (requirements?.installationRequirement && String(requirements.installationRequirement).toLowerCase().includes('required')) {
    suggestions.push({ type: 'Installation', text: 'Request free installation, testing, and handover documentation as part of the final commercial terms.', action: 'Accept suggestion' })
  }
  if (requirements?.warrantyRequirement) {
    suggestions.push({ type: 'Warranty', text: `Ask supplier to confirm ${requirements.warrantyRequirement} in the final quote and purchase order acceptance.`, action: 'Accept suggestion' })
  } else {
    suggestions.push({ type: 'Warranty', text: 'Request a minimum 1-year warranty or OEM warranty certificate before approval.', action: 'Accept suggestion' })
  }
  if (selectedDays > bestDelivery) {
    const faster = tenders.find((tender) => safeNumber(String(tender.leadTime || '').match(/\d+/)?.[0], 14) === bestDelivery)
    suggestions.push({ type: 'Delivery trade-off', text: `${faster?.company || 'Another supplier'} has faster delivery, but the selected supplier may still be better on price or compliance. Ask for expedited delivery.`, action: 'Request revised quote' })
  }
  const sourceUnavailable = (selected.lines || []).some((line) => line.sourceUnavailable)
  if (sourceUnavailable) {
    suggestions.push({ type: 'Source verification', text: 'Live source is unavailable for one or more product rows. Request supplier quotation and catalogue proof before PO release.', action: 'Request revised quote' })
  }
  return suggestions.slice(0, 6)
}

export function buildExplainableRecommendation(tenders = [], selectedTender = null, requirements = {}) {
  const selected = selectedTender || tenders[0]
  if (!selected) return { reasons: ['No supplier has been selected yet.'], alternatives: [], tradeoffs: [] }
  const budget = safeNumber(requirements?.budget)
  const total = safeNumber(selected.summary?.grandTotal)
  const lowest = tenders.reduce((best, tender) => safeNumber(tender.summary?.grandTotal) < safeNumber(best?.summary?.grandTotal, Infinity) ? tender : best, selected)
  const fastest = tenders.reduce((best, tender) => {
    const days = safeNumber(String(tender.leadTime || '').match(/\d+/)?.[0], 99)
    const bestDays = safeNumber(String(best?.leadTime || '').match(/\d+/)?.[0], 99)
    return days < bestDays ? tender : best
  }, selected)
  const reasons = [
    `${formatPercent(selected.matchScore)} overall match for the requested BOQ`,
    `${formatPercent(selected.technicalScore)} technical score based on product/specification fit`,
    `${formatPercent(selected.commercialScore)} commercial score based on quote, budget, source quality and delivery`,
    `${selected.leadTime || 'Supplier delivery timeline available'} delivery timeline`,
  ]
  if (budget > 0) reasons.push(total <= budget ? `Within the entered budget of ${formatCurrency(budget)}` : `Above the entered budget by ${formatCurrency(total - budget)}, negotiation or higher approval recommended`)
  if (selected === lowest) reasons.push('Lowest total quote among compared suppliers')
  if (selected === fastest) reasons.push('Fastest delivery among compared suppliers')
  const alternatives = tenders.filter((tender) => (tender.id || tender.tenderRef) !== (selected.id || selected.tenderRef)).map((tender) => {
    const diff = safeNumber(tender.summary?.grandTotal) - total
    return {
      supplier: tender.company,
      reason: diff < 0
        ? `${formatCurrency(Math.abs(diff))} cheaper, but lower combined match/risk score than selected option`
        : `${formatCurrency(diff)} higher than selected option or weaker value score`,
      scores: `Overall ${formatPercent(tender.matchScore)}, Technical ${formatPercent(tender.technicalScore)}, Commercial ${formatPercent(tender.commercialScore)}`,
    }
  })
  const tradeoffs = [
    selected === lowest ? 'Cost is prioritized without sacrificing technical coverage.' : `Cheapest supplier is ${lowest?.company}, but selected supplier offers better overall balance.`,
    selected === fastest ? 'Delivery speed is strong for this recommendation.' : `Fastest supplier is ${fastest?.company}; selected option may be stronger on cost/compliance.`,
    'Final PO release remains subject to business-user approval and supplier confirmation.',
  ]
  return { reasons, alternatives, tradeoffs }
}

export function buildNotificationEntries(order = {}, email = {}) {
  const now = new Date().toISOString()
  const recipient = email?.recipient || order?.recipientEmail || order?.contactEmail || ''
  return [
    { id: `approval-${order.purchaseOrderId || Date.now()}`, type: 'Approval completed', message: 'Final business approval completed.', recipient: '', timestamp: now, status: 'Sent' },
    { id: `po-${order.purchaseOrderId || Date.now()}`, type: 'PO generated', message: `Purchase Order ${order.purchaseOrderId || order.orderId || 'created'} generated.`, recipient: '', timestamp: now, status: 'Sent' },
    { id: `tracking-${order.trackingId || Date.now()}`, type: 'Tracking created', message: `Tracking ${order.trackingId || order.trackingNumber || 'created'} generated.`, recipient: '', timestamp: now, status: 'Sent' },
    { id: `email-${recipient || Date.now()}`, type: 'Email sent to company', message: email?.message || 'Order confirmation and tracking email processed.', recipient, timestamp: now, status: email?.status === 'failed' ? 'Failed' : email?.status === 'preview_only' ? 'Pending' : 'Sent', reason: email?.error || (email?.status === 'preview_only' ? 'SMTP credentials not configured; preview generated.' : '') },
  ]
}

export function extendedTimeline(order = {}) {
  const baseDate = order.approvalDate || new Date().toISOString().slice(0, 10)
  const expected = order.expectedDeliveryDate || baseDate
  const existing = new Map((order.timeline || order.statusSteps || []).map((step) => [step.step || step.label, step]))
  const steps = [
    'PO Approved',
    'Order Sent to Supplier',
    'Supplier Accepted',
    'Packed',
    'Dispatched',
    'In Transit',
    'Out for Delivery',
    'Delivered',
    'Invoice Received',
    'Payment Pending',
    'Completed',
  ]
  return steps.map((step, index) => {
    const existingStep = existing.get(step) || existing.get(step.replace('PO Approved', 'Purchase Order Approved'))
    const status = index <= 2 ? 'completed' : index === 3 ? 'current' : 'pending'
    return {
      step,
      status: existingStep?.status || status,
      date: existingStep?.date || (index <= 2 ? baseDate : expected),
    }
  })
}

export function buildPurchaseOrderPayload({ requirementsData, tenderAnalysis, selectedTender, orderDetails }) {
  return {
    requirements: requirementsData,
    tenderAnalysis,
    selectedTender: selectedTender || tenderAnalysis?.recommendedTender,
    order: orderDetails,
  }
}

export function answerProcurementQuestion(question, context = {}) {
  const text = String(question || '').toLowerCase()
  const tenders = context.tenderAnalysis?.tenders || []
  const selected = context.selectedTender || context.tenderAnalysis?.recommendedTender || tenders[0]
  if (!text.trim()) return ''
  if (!tenders.length && !selected) return 'I do not have enough information from the current procurement request.'
  if (text.includes('cheapest')) {
    const cheapest = tenders.reduce((best, tender) => safeNumber(tender.summary?.grandTotal) < safeNumber(best?.summary?.grandTotal, Infinity) ? tender : best, tenders[0])
    return cheapest ? `${cheapest.company} is currently the cheapest option at ${formatCurrency(cheapest.summary?.grandTotal)}.` : 'I do not have enough information from the current procurement request.'
  }
  if (text.includes('why') && text.includes('recommended')) {
    const explanation = buildExplainableRecommendation(tenders, selected, context.requirementsData)
    return explanation.reasons.join(' ')
  }
  if (text.includes('delivery') || text.includes('tracking')) {
    const order = context.orderDetails || {}
    if (!order.trackingId && !order.trackingNumber) return 'Tracking details are not available until final approval creates the purchase order.'
    return `Tracking ID ${order.trackingId || order.trackingNumber}. Current status: ${order.currentStatus || order.status || 'Order placed and delivery scheduled'}. Expected delivery: ${order.expectedDeliveryDate || 'to be confirmed'}.`
  }
  if (text.includes('email')) {
    const email = context.orderEmailResult || {}
    if (!email.status) return 'Email status is not available until final approval.'
    return `Email status: ${email.status}. Recipient: ${email.recipient || context.requirementsData?.companyEmail || 'company email not available'}.`
  }
  if (text.includes('risk')) {
    const risks = buildRiskScores(tenders, context.requirementsData)
    const risk = risks.find((item) => item.supplier === selected?.company) || risks[0]
    return risk ? `${risk.supplier} risk level is ${risk.level} with score ${risk.score}/100. Reasons: ${risk.reasons.join(', ')}.` : 'I do not have enough information from the current procurement request.'
  }
  if (text.includes('compare')) {
    return tenders.map((tender) => `${tender.company}: ${formatCurrency(tender.summary?.grandTotal)}, overall ${formatPercent(tender.matchScore)}, delivery ${tender.leadTime}`).join(' | ') || 'I do not have enough information from the current procurement request.'
  }
  if (text.includes('budget')) {
    const budget = safeNumber(context.requirementsData?.budget)
    const total = safeNumber(selected?.summary?.grandTotal)
    if (!budget || !total) return 'I do not have enough information from the current procurement request.'
    return total <= budget ? `The selected quote ${formatCurrency(total)} is within the budget ${formatCurrency(budget)}.` : `The selected quote ${formatCurrency(total)} exceeds the budget ${formatCurrency(budget)} by ${formatCurrency(total - budget)}.`
  }
  return 'I do not have enough information from the current procurement request.'
}
