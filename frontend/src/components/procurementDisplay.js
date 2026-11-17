export function safeNumber(value, fallback = 0) {
  const number = Number(String(value ?? '').replace(/[₹,]/g, '').trim())
  return Number.isFinite(number) ? number : fallback
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(safeNumber(value))
}

export function formatPercent(value) {
  return `${Math.round(safeNumber(value))}%`
}

export function allTenderLines(tenderAnalysis = {}) {
  return (tenderAnalysis?.tenders || []).flatMap((tender) => (tender.lines || []).map((line) => ({ ...line, tender })))
}

export function getSelectedTender(selectedTender, tenderAnalysis) {
  return selectedTender || tenderAnalysis?.recommendedTender || tenderAnalysis?.tenders?.[0] || null
}

export function requirementMissingInfo(requirements = {}) {
  const missing = []
  if (!requirements.organizationType) missing.push('organization type')
  if (!requirements.companyEmail) missing.push('company email for order tracking')
  if (!requirements.deliveryLocation) missing.push('delivery location')
  if (!requirements.deliveryDeadline) missing.push('delivery deadline')
  if (!requirements.warrantyRequirement) missing.push('warranty requirement')
  if (!requirements.complianceRequirements) missing.push('certification / compliance requirements')
  const items = requirements.items || []
  if (!items.length) missing.push('product line items')
  items.forEach((item, index) => {
    if (!item.technicalSpecifications) missing.push(`technical specs for product ${index + 1}`)
  })
  return missing
}

export function slugify(value = 'procurement') {
  return String(value || 'procurement').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'procurement'
}
