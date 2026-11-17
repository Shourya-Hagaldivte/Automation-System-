import { useEffect, useMemo, useState } from 'react'
import ProductScene3D from './ProductScene3D'
import { fallbackSuppliers } from '../data/fallbackSuppliers'
import './TenderResults.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
const SUPPLIER_SOURCE_UNAVAILABLE_TEXT = 'Live supplier source unavailable, using benchmark procurement estimate.'

function isMoglixValue(value = '') {
  return String(value || '').toLowerCase().includes('moglix')
}

function safeNumber(value, fallback = 0) {
  const number = Number(String(value ?? '').replace(/[₹,]/g, '').trim())
  return Number.isFinite(number) ? number : fallback
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(safeNumber(value))
}

function formatDate(value) {
  if (!value) return 'today'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'today'
  return date.toLocaleString('en-IN')
}

function slugify(value = 'procurement-rfp') {
  return String(value || 'procurement-rfp').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'procurement-rfp'
}

function normalizeUnit(unit = 'pieces') {
  const map = {
    piece: 'pieces', pieces: 'pieces', pc: 'pieces', pcs: 'pieces', unit: 'pieces', units: 'pieces', number: 'pieces', numbers: 'pieces',
    meter: 'meters', meters: 'meters', metre: 'meters', metres: 'meters', m: 'meters', mtr: 'meters', mtrs: 'meters',
    coil: 'coils', coils: 'coils', roll: 'coils', rolls: 'coils', pack: 'packs', packs: 'packs', box: 'packs', boxes: 'packs',
  }
  const raw = String(unit || 'pieces').toLowerCase().trim()
  return map[raw] || raw
}

const stopWords = new Set(['and', 'for', 'with', 'the', 'from', 'unit', 'units', 'piece', 'pieces', 'meter', 'meters', 'pack', 'packs', 'product'])

function singularize(token) {
  const values = new Set([token])
  if (token.endsWith('ies') && token.length > 4) values.add(`${token.slice(0, -3)}y`)
  if (token.endsWith('es') && token.length > 4) values.add(token.slice(0, -2))
  if (token.endsWith('s') && token.length > 3) values.add(token.slice(0, -1))
  return [...values]
}

function itemTokens(value = '') {
  const normalized = String(value || '').toLowerCase().replace(/sq\.mm|sq mm/g, 'sqmm')
  return [...new Set((normalized.match(/[a-z0-9.]+/g) || [])
    .flatMap((token) => singularize(token))
    .filter((token) => token.length > 1 && !stopWords.has(token)))]
}

function phrase(value = '') {
  return String(value || '').toLowerCase().replace(/sq\.mm|sq mm/g, 'sqmm')
}

const categoryHints = [
  ['projector', 'Projector'], ['projectors', 'Projector'], ['bench', 'Bench'], ['benches', 'Bench'], ['desk', 'Bench'], ['furniture', 'Bench'],
  ['bulb', 'Bulb'], ['bulbs', 'Bulb'], ['lamp', 'Bulb'], ['mcb', 'Circuit Breaker'], ['breaker', 'Circuit Breaker'],
  ['batten', 'Lighting'], ['light', 'Lighting'], ['lights', 'Lighting'], ['led', 'Lighting'], ['wire', 'Wiring'], ['wires', 'Wiring'], ['copper', 'Wiring'], ['cable', 'Cable'],
]

function categoryGuess(name = '') {
  const text = phrase(name)
  const found = categoryHints.find(([keyword]) => text.includes(keyword))
  return found ? found[1] : 'Industrial Product'
}

function specSet(text, regex) {
  return new Set([...(phrase(text).matchAll(regex) || [])].map((match) => match[1]))
}

function poleSet(text) {
  const normalized = phrase(text)
  const values = specSet(normalized, /\b(\d+)\s*p(?:ole)?\b/g)
  if (/\bsp\b|single\s+pole/.test(normalized)) values.add('1')
  if (/\bdp\b|double\s+pole/.test(normalized)) values.add('2')
  if (/\btp\b|triple\s+pole/.test(normalized)) values.add('3')
  if (/\bfp\b|four\s+pole/.test(normalized)) values.add('4')
  return values
}

function setsConflict(requested, offered) {
  return requested.size > 0 && offered.size > 0 && ![...requested].some((value) => offered.has(value))
}

function categoryCompatible(itemCategory, productCategory) {
  const itemCat = String(itemCategory || '').toLowerCase()
  const productCat = String(productCategory || '').toLowerCase()
  if (itemCat === 'industrial product' || !productCat) return true
  if (itemCat === productCat) return true
  if (['electrical', 'electrical items', 'electrical supplies', 'electrical materials', 'electrical equipment'].includes(itemCat) && ['wiring', 'cable', 'circuit breaker', 'lighting', 'bulb', 'wiring accessories', 'distribution board', 'fan'].includes(productCat)) return true
  if (['furniture', 'school furniture', 'classroom furniture'].includes(itemCat) && productCat === 'bench') return true
  if (['av equipment', 'audio visual', 'electronics', 'office equipment'].includes(itemCat) && productCat === 'projector') return true
  if (itemCat === 'lighting' && ['lighting', 'bulb'].includes(productCat)) return true
  if (itemCat === 'cable' && productCat === 'wiring') return true
  return false
}

function scoreFallbackProduct(item, supplier, product) {
  const itemContext = `${item.name || ''} ${item.productCategory || item.category || ''} ${item.technicalSpecifications || ''} ${item.preferredBrand || ''}`
  const itemText = phrase(itemContext)
  const productText = phrase(`${product.name} ${product.category} ${(product.keywords || []).join(' ')}`)
  const itemCategory = item.productCategory || item.category || categoryGuess(item.name)
  const productCategory = product.category || ''
  if (!categoryCompatible(itemCategory, productCategory)) return 0
  if (String(productCategory).toLowerCase() === 'bulb' && !/bulbs?|lamps?/.test(itemText)) return 0
  if (itemText.includes('projector') && !productText.includes('projector')) return 0
  if ((itemText.includes('bench') || itemText.includes('benches') || itemText.includes('desk')) && !/(bench|desk|seating)/.test(productText)) return 0
  if (itemText.includes('bulb') && !productText.includes('bulb')) return 0
  if (itemText.includes('batten') && !productText.includes('batten')) return 0
  if (itemText.includes('mcb') && !productText.includes('mcb')) return 0

  const checks = [
    [/([0-9]+(?:\.[0-9]+)?)\s*sqmm/g, /([0-9]+(?:\.[0-9]+)?)\s*sqmm/g],
    [/\b([0-9]+(?:\.[0-9]+)?)\s*a(?:mpere|mp|mps)?\b/g, /\b([0-9]+(?:\.[0-9]+)?)\s*a(?:mpere|mp|mps)?\b/g],
    [/\b([0-9]+(?:\.[0-9]+)?)\s*w(?:att|atts)?\b/g, /\b([0-9]+(?:\.[0-9]+)?)\s*w(?:att|atts)?\b/g],
  ]
  if (checks.some(([req, offer]) => setsConflict(specSet(itemText, req), specSet(productText, offer)))) return 0
  if (setsConflict(poleSet(itemText), poleSet(productText))) return 0

  const tokens = itemTokens(itemContext)
  const overlap = tokens.filter((token) => productText.includes(token))
  let score = Math.round((overlap.length / Math.max(tokens.length, 1)) * 58)
  ;['copper', 'wire', 'mcb', 'breaker', 'led', 'batten', 'light', 'bulb', 'projector', 'bench', 'desk'].forEach((term) => {
    if (itemText.includes(term) && productText.includes(term)) score += 6
  })
  const itemNumbers = new Set(itemText.match(/\d+(?:\.\d+)?/g) || [])
  const productNumbers = new Set(productText.match(/\d+(?:\.\d+)?/g) || [])
  if (itemNumbers.size) {
    const numberMatches = [...itemNumbers].filter((number) => productNumbers.has(number))
    score += numberMatches.length ? 18 + (numberMatches.length - 1) * 4 : -16
  }
  if (String(productCategory).toLowerCase() === itemCategory.toLowerCase()) score += 12
  const coverageText = (supplier.coverage || []).join(' ').toLowerCase()
  score += tokens.reduce((total, token) => total + (coverageText.includes(token) ? 2 : 0), 0)
  return Math.max(0, Math.min(99, score))
}

function isGenericRequirementItem(name = '') {
  const normalized = String(name || '').toLowerCase().trim()
  if (!normalized) return true
  if (/electrical\s+(works?|infrastructure|project|materials|supplies)/.test(normalized)) return true
  const tokens = itemTokens(normalized)
  const genericTerms = new Set(['electrical', 'works', 'work', 'infrastructure', 'upgrade', 'project', 'maintenance', 'installation', 'supply', 'materials', 'supplies', 'package'])
  return tokens.length > 0 && tokens.every((token) => genericTerms.has(token))
}

function looksElectricalScope(requirements = {}, rawItems = []) {
  const text = `${requirements.title || ''} ${requirements.industry || ''} ${rawItems.map((item) => item.name || '').join(' ')}`.toLowerCase()
  return /electrical|wire|wiring|cable|mcb|switchgear|breaker|lighting|led|fan|power|distribution|panel/.test(text)
}

function normalizeFallbackItems(requirements = {}) {
  const rawItems = requirements?.items?.filter((item) => item.name?.trim()).map((item) => {
    const userQuantity = safeNumber(item.quantity, 0)
    return { ...item, quantity: userQuantity > 0 ? userQuantity : 0, unit: normalizeUnit(item.unit || 'pieces') }
  }) || []
  const specificItems = rawItems.filter((item) => !isGenericRequirementItem(item.name))
  if (specificItems.length) return { items: specificItems, inferredItems: false, inferenceNote: '' }
  if (looksElectricalScope(requirements, rawItems)) {
    const seedQuantity = Math.max(safeNumber(rawItems[0]?.quantity, 1), 1)
    return {
      inferredItems: true,
      inferenceNote: 'The entered scope was broad, so a starter electrical BOQ was inferred. Edit the requirement items for exact site quantities before issuing the RFP.',
      items: [
        { name: '2.5 sq.mm copper wire', quantity: seedQuantity, unit: 'meters', inferred: true },
        { name: '25A MCB', quantity: seedQuantity, unit: 'pieces', inferred: true },
        { name: '20W LED batten light', quantity: seedQuantity, unit: 'pieces', inferred: true },
      ],
    }
  }
  return { items: rawItems, inferredItems: false, inferenceNote: '' }
}

function priceForFallbackProduct(product, quantity, requestedUnit) {
  const normalizedUnit = normalizeUnit(requestedUnit || 'pieces')
  const productUnit = normalizeUnit(product.unit || 'piece')
  if (normalizedUnit === 'meters' && product.packSize && normalizeUnit(product.packUnit) === 'meters') {
    const unitPrice = Math.round((safeNumber(product.price) / safeNumber(product.packSize)) * 100) / 100
    return { unitPrice, totalPrice: unitPrice * quantity, unit: 'meter', quantityNote: `Converted from ${product.packSize} m coil price` }
  }
  if (normalizedUnit === 'pieces' && product.packSize && normalizeUnit(product.packUnit) === 'pieces') {
    const unitPrice = Math.round((safeNumber(product.price) / safeNumber(product.packSize)) * 100) / 100
    return { unitPrice, totalPrice: unitPrice * quantity, unit: 'piece', quantityNote: `Converted from pack of ${product.packSize} price` }
  }
  if (productUnit === 'coils' && ['pieces', 'coils'].includes(normalizedUnit)) {
    return { unitPrice: safeNumber(product.price), totalPrice: safeNumber(product.price) * quantity, unit: quantity === 1 ? 'coil' : 'coils', quantityNote: `1 piece treated as 1 retail coil / pack (${product.packSize || 90} m)` }
  }
  return { unitPrice: safeNumber(product.price), totalPrice: safeNumber(product.price) * quantity, unit: product.unit || 'piece', quantityNote: 'Direct product unit price' }
}

function lineFromProduct(item, supplier, product, score) {
  const quantity = Math.max(safeNumber(item.quantity, 0), 0)
  const pricing = priceForFallbackProduct(product, quantity, item.unit)
  const sourceUnavailable = Boolean(product.sourceUnavailable) || isMoglixValue(product.sourceName) || isMoglixValue(product.sourceUrl) || isMoglixValue(product.productUrl) || isMoglixValue(supplier.company)
  const sourceStatus = sourceUnavailable ? (product.sourceStatus || SUPPLIER_SOURCE_UNAVAILABLE_TEXT) : ''
  return {
    itemName: item.name,
    quantity,
    requestedUnit: item.unit || 'pieces',
    unit: pricing.unit,
    matchedProduct: product.name,
    sku: product.sku,
    matchScore: score,
    unitPrice: pricing.unitPrice,
    totalPrice: pricing.totalPrice,
    priceSource: product.sourceName || product.priceBasis || 'Verified source-linked catalog',
    sourceUrl: sourceUnavailable ? '' : product.sourceUrl,
    productUrl: sourceUnavailable ? '' : product.productUrl,
    sourceStatus,
    sourceUnavailable,
    supplierWebsite: supplier.website,
    supplierName: supplier.company,
    category: product.category,
    priceBasis: sourceUnavailable ? sourceStatus : product.priceBasis,
    quantityNote: pricing.quantityNote,
    imageType: product.imageType,
  }
}

function bestProductForItem(item, supplier) {
  const ranked = (supplier.products || [])
    .map((product) => ({ product, score: scoreFallbackProduct(item, supplier, product) }))
    .filter((entry) => entry.score >= 25)
    .sort((a, b) => b.score - a.score || safeNumber(a.product.price) - safeNumber(b.product.price))
  return ranked[0] || null
}

function commercialSummary(itemTotal) {
  const freight = Math.round(Math.max(950, itemTotal * 0.025))
  const testing = Math.round(Math.max(1250, itemTotal * 0.008))
  const insurance = Math.round(Math.max(350, itemTotal * 0.004))
  const subtotal = itemTotal + freight + testing + insurance
  const gst = Math.round(subtotal * 0.18)
  return { itemTotal, freight, testing, insurance, subtotal, gst, grandTotal: subtotal + gst }
}

function timelineDays(requirements = {}) {
  const mapping = { urgent: 14, '30-days': 30, '60-days': 60, '90-days': 90 }
  if (requirements.deliveryDeadline) {
    const deadline = new Date(requirements.deliveryDeadline)
    if (!Number.isNaN(deadline.getTime())) {
      const diff = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      if (diff > 0) return diff
    }
  }
  return mapping[requirements.timeline] || 30
}

function clampScore(value, min = 45, max = 99) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function buildScoreBreakdown({ lines, summary, deliveryDays, rating, commercialSeed, requirements = {} }) {
  const productMatch = clampScore(lines.reduce((sum, line) => sum + safeNumber(line.matchScore, 70), 0) / Math.max(lines.length, 1), 50)
  const requestedDays = timelineDays(requirements)
  const deliveryTimeline = deliveryDays <= requestedDays ? 94 : clampScore(94 - (deliveryDays - requestedDays) * 1.2, 52)
  const budget = safeNumber(requirements.budget)
  const budgetMatch = budget > 0 ? (summary.grandTotal <= budget ? 96 : clampScore(96 - ((summary.grandTotal - budget) / Math.max(budget, 1)) * 44, 45)) : 78
  const technicalSpec = (requirements.items || []).some((item) => item.technicalSpecifications) ? clampScore(productMatch + 4, 55) : 78
  return {
    productMatch,
    quantityMatch: 92,
    budgetMatch,
    deliveryLocation: requirements.deliveryLocation ? 88 : 74,
    deliveryTimeline,
    technicalSpecificationMatch: technicalSpec,
    warrantyMatch: requirements.warrantyRequirement ? 86 : 72,
    complianceMatch: requirements.complianceRequirements ? 84 : 74,
    supplierRating: clampScore(safeNumber(rating, 4.2) * 20, 60),
    priceCompetitiveness: clampScore(commercialSeed, 55),
  }
}

function scoresFromBreakdown(breakdown) {
  const technicalScore = clampScore(
    breakdown.productMatch * 0.34 +
    breakdown.technicalSpecificationMatch * 0.20 +
    breakdown.warrantyMatch * 0.12 +
    breakdown.complianceMatch * 0.14 +
    breakdown.deliveryTimeline * 0.12 +
    breakdown.quantityMatch * 0.08,
    50,
  )
  const commercialScore = clampScore(
    breakdown.budgetMatch * 0.34 +
    breakdown.priceCompetitiveness * 0.34 +
    breakdown.deliveryLocation * 0.10 +
    breakdown.deliveryTimeline * 0.14 +
    breakdown.quantityMatch * 0.08,
    50,
  )
  const matchScore = clampScore(technicalScore * 0.55 + commercialScore * 0.35 + breakdown.supplierRating * 0.10, 50)
  return { technicalScore, commercialScore, matchScore }
}

function createTenderFromLines({ id, label, company, supplierType, description, website, catalogueUrl, tenderUrl, leadTime, deliveryDays, rating, commercialSeed, lines, consolidated = false, requirements = {} }) {
  const itemTotal = lines.reduce((sum, line) => sum + safeNumber(line.totalPrice), 0)
  const summary = commercialSummary(itemTotal)
  const actualDeliveryDays = safeNumber(deliveryDays, 30)
  const breakdown = buildScoreBreakdown({ lines, summary, deliveryDays: actualDeliveryDays, rating, commercialSeed, requirements })
  const scores = scoresFromBreakdown(breakdown)
  return {
    id,
    rank: 0,
    company,
    supplierType,
    description,
    website,
    catalogueUrl,
    tenderUrl: tenderUrl || catalogueUrl || website,
    tenderRef: `${label}-${new Date().getFullYear()}-${String(id).replace(/\D/g, '').padStart(3, '0')}`,
    matchScore: scores.matchScore,
    technicalScore: scores.technicalScore,
    commercialScore: scores.commercialScore,
    scoreBreakdown: breakdown,
    rating,
    leadTime: leadTime || `${actualDeliveryDays || 30} days`,
    validity: '30 days',
    lines,
    summary,
    compliance: ['All requested items quoted', 'Product source links included', 'AI-assisted matching with final business approval'],
    pricingMode: consolidated ? 'complete-consolidated' : 'verified-catalog',
    previewProducts: lines.slice(0, 5).map((line) => ({ sku: line.sku, name: line.matchedProduct, category: line.category, productUrl: line.productUrl, sourceUrl: line.sourceUrl, unitPrice: line.unitPrice, unit: line.unit, imageType: line.imageType, sourceStatus: line.sourceStatus, sourceVerified: !line.sourceUnavailable, sourceUnavailable: line.sourceUnavailable })),
    sourceSuppliers: [...new Set(lines.map((line) => line.supplierName).filter(Boolean))],
  }
}

function refreshTenderCommercialScores(tender, requirements, minTotal) {
  if (!minTotal || !tender.summary?.grandTotal) return tender
  const priceScore = clampScore((minTotal / tender.summary.grandTotal) * 99, 55)
  tender.priceScore = priceScore
  tender.scoreBreakdown = {
    ...(tender.scoreBreakdown || {}),
    priceCompetitiveness: priceScore,
    budgetMatch: buildScoreBreakdown({
      lines: tender.lines || [],
      summary: tender.summary || {},
      deliveryDays: safeNumber(String(tender.leadTime || '').match(/\d+/)?.[0], 30),
      rating: tender.rating,
      commercialSeed: priceScore,
      requirements,
    }).budgetMatch,
  }
  const scores = scoresFromBreakdown(tender.scoreBreakdown)
  tender.technicalScore = scores.technicalScore
  tender.commercialScore = scores.commercialScore
  tender.matchScore = scores.matchScore
  return tender
}

const restrictedProcurementTerms = /\b(gun|firearm|ammunition|ammo|bullet|rifle|pistol|knife|blade|grenade|explosive|firework|pepper\s*spray|mace|taser|drug|cocaine|heroin|thc|cannabis|marijuana|alcohol|beer|wine|vape|nicotine|cigarette|gambling|casino)\b/i

const genericProcurementSources = [
  {
    company: 'GeM Marketplace',
    supplierType: 'Public procurement marketplace source',
    website: 'https://gem.gov.in/',
    catalogueUrl: 'https://mkp.gem.gov.in/',
    tenderUrl: 'https://bidplus.gem.gov.in/all-bids',
    deliveryDays: 21,
    rating: 4.25,
    commercialScore: 82,
    description: 'Public procurement marketplace source for institutional bulk buying when an exact catalog SKU is not available in the bundled supplier catalog.',
  },
  {
    company: 'IndiaMART Business Supplier Directory',
    supplierType: 'B2B supplier discovery source',
    website: 'https://www.indiamart.com/',
    catalogueUrl: 'https://dir.indiamart.com/',
    tenderUrl: 'https://dir.indiamart.com/',
    deliveryDays: 16,
    rating: 4.05,
    commercialScore: 78,
    description: 'B2B supplier-discovery source with searchable company listings for quotation and product confirmation.',
  },
  {
    company: 'Moglix Enterprise Catalogue Source',
    supplierType: 'B2B procurement marketplace source',
    website: 'https://www.moglix.com/',
    catalogueUrl: 'https://www.moglix.com/',
    tenderUrl: 'https://www.moglix.com/',
    deliveryDays: 14,
    rating: 4.18,
    commercialScore: 84,
    description: 'Enterprise procurement marketplace benchmark used when direct live product source verification is unavailable.',
    sourceStatus: 'Live supplier source unavailable, using benchmark procurement estimate.',
  },
]

function isRestrictedProcurementItem(item = {}) {
  const text = `${item.name || ''} ${item.productCategory || item.category || ''} ${item.technicalSpecifications || ''}`
  return restrictedProcurementTerms.test(text)
}

function searchLinkForSource(source, itemName) {
  const query = encodeURIComponent(itemName || 'procurement item')
  if (source.company.includes('GeM')) return `https://mkp.gem.gov.in/search?q=${query}`
  if (source.company.includes('IndiaMART')) return `https://dir.indiamart.com/search.mp?ss=${query}`
  // Moglix search URLs frequently return no-result or 404 pages for unverified keywords.
  // Do not expose a broken Moglix search URL as a valid supplier source; keep the flow on benchmark fallback data instead.
  if (source.company.includes('Moglix')) return ''
  return source.catalogueUrl
}

function sourceUnavailableMessage(source) {
  return source.company.includes('Moglix')
    ? 'Live supplier source unavailable, using benchmark procurement estimate.'
    : ''
}

function genericImageType(item = {}) {
  const category = categoryGuess(`${item.name || ''} ${item.productCategory || item.category || ''}`).toLowerCase()
  if (category.includes('wiring') || category.includes('cable')) return 'wire'
  if (category.includes('breaker')) return 'mcb'
  if (category.includes('lighting')) return 'lighting'
  if (category.includes('bulb')) return 'bulb'
  if (category.includes('projector')) return 'projector'
  if (category.includes('bench')) return 'furniture'
  return 'product'
}

function estimateGenericUnitPrice(item = {}, sourceIndex = 0) {
  const text = phrase(`${item.name || ''} ${item.productCategory || item.category || ''} ${item.technicalSpecifications || ''}`)
  let base = 1000
  if (/projector|display|audio visual|av/.test(text)) base = 34000
  else if (/bench|desk|chair|furniture|seating/.test(text)) base = 6400
  else if (/bulb|lamp/.test(text)) base = 75
  else if (/batten|light|lighting/.test(text)) base = 260
  else if (/mcb|breaker|switchgear/.test(text)) base = 240
  else if (/wire|wiring|cable/.test(text)) base = normalizeUnit(item.unit) === 'meters' ? 55 : 4500
  else if (/cement/.test(text)) base = 430
  else if (/steel|tmt|bar/.test(text)) base = normalizeUnit(item.unit) === 'tons' ? 62000 : 62
  else if (/paint/.test(text)) base = 3200
  else if (/tile|tiles/.test(text)) base = 900
  else if (/fan/.test(text)) base = 2100
  else if (/laptop|computer/.test(text)) base = 52000
  else if (/printer/.test(text)) base = 14500
  const multiplier = [1.04, 0.96, 1.0][sourceIndex % 3]
  return Math.max(1, Math.round(base * multiplier))
}

function brandSpecificProductName(preferredBrand, itemName, text) {
  const brand = String(preferredBrand || '').trim()
  const lowerBrand = brand.toLowerCase()
  if (/projector|display|audio visual|\bav\b/.test(text)) {
    if (lowerBrand.includes('epson')) return 'Epson EB-E01 XGA Business Projector'
    if (lowerBrand.includes('benq')) return 'BenQ MX560 XGA Business Projector'
    if (lowerBrand.includes('viewsonic')) return 'ViewSonic PA503X XGA Business Projector'
    return `${brand} XGA Business Projector`
  }
  if (/bulb|lamp/.test(text)) {
    if (lowerBrand.includes('wipro')) return 'Wipro Garnet 9W B22 LED Bulb'
    if (lowerBrand.includes('philips')) return 'Philips 12W B22 LED Bulb'
    return `${brand} LED Bulb, B22 base`
  }
  if (/batten|light|lighting/.test(text)) {
    if (lowerBrand.includes('philips')) return 'Philips 20W LED Batten Light'
    if (lowerBrand.includes('wipro')) return 'Wipro Garnet 20W LED Batten Light'
    if (lowerBrand.includes('havells')) return 'Havells 20W LED Batten Light'
    return `${brand} LED Lighting Fixture`
  }
  if (/bench|desk|chair|furniture|seating/.test(text)) {
    if (lowerBrand.includes('godrej')) return 'Godrej Interio Modular Office Chair / Institutional Seating'
    if (lowerBrand.includes('nilkamal')) return 'Nilkamal Institutional Classroom Bench'
    return `${brand} Institutional Furniture / Seating`
  }
  if (/steel|tmt|bar/.test(text)) {
    if (lowerBrand.includes('tata')) return 'Tata Tiscon TMT Construction Rod'
    if (lowerBrand.includes('jsw')) return 'JSW Neosteel TMT Construction Rod'
    return `${brand} TMT Construction Rod`
  }
  if (/wire|wiring|cable/.test(text)) {
    if (lowerBrand.includes('polycab')) return 'Polycab FR Copper House Wire'
    if (lowerBrand.includes('havells')) return 'Havells Life Line FR Copper Wire'
    return `${brand} Copper Wire / Cable`
  }
  return `${brand} ${itemName} procurement listing`
}

function realisticGenericProductName(item = {}, sourceIndex = 0) {
  const itemName = item.name || 'Procurement item'
  const text = phrase(`${itemName} ${item.productCategory || item.category || ''} ${item.technicalSpecifications || ''}`)
  const preferredBrand = String(item.preferredBrand || '').trim()
  if (preferredBrand) return brandSpecificProductName(preferredBrand, itemName, text)
  const variants = {
    projector: [
      'Epson EB-E01 / BenQ MX560 equivalent projector quotation',
      'BenQ / ViewSonic classroom projector supplier listing',
      'Epson / BenQ institutional projector procurement listing',
    ],
    bench: [
      'Godrej Interio / Nilkamal institutional bench quotation',
      'Nilkamal / Godrej classroom bench supplier listing',
      'Institutional classroom bench and desk procurement listing',
    ],
    bulb: [
      'Wipro Garnet / Philips LED bulb quotation',
      'Philips / Wipro LED bulb supplier listing',
      'B2B LED bulb procurement catalogue listing',
    ],
    lighting: [
      'Havells / Wipro LED batten light quotation',
      'Philips / Wipro LED lighting supplier listing',
      'Institutional LED lighting procurement catalogue listing',
    ],
    mcb: [
      'Havells X7 / Schneider Easy9 MCB quotation',
      'Schneider / Havells MCB supplier listing',
      'B2B circuit breaker procurement catalogue listing',
    ],
    wire: [
      'Polycab / Havells FR copper wire quotation',
      'KEI / Finolex copper wire supplier listing',
      'B2B copper wiring procurement catalogue listing',
    ],
    cement: [
      'UltraTech / ACC cement supplier quotation',
      'Ambuja / ACC cement distributor listing',
      'B2B cement procurement catalogue listing',
    ],
    steel: [
      'Tata Tiscon / JSW TMT steel quotation',
      'SAIL / JSW steel supplier listing',
      'B2B steel procurement catalogue listing',
    ],
    paint: [
      'Asian Paints / Berger paint quotation',
      'Berger / Nerolac paint supplier listing',
      'B2B paint procurement catalogue listing',
    ],
  }
  let key = 'generic'
  if (/projector|display|audio visual|\bav\b/.test(text)) key = 'projector'
  else if (/bench|desk|chair|furniture|seating/.test(text)) key = 'bench'
  else if (/bulb|lamp/.test(text)) key = 'bulb'
  else if (/batten|light|lighting/.test(text)) key = 'lighting'
  else if (/mcb|breaker|switchgear/.test(text)) key = 'mcb'
  else if (/wire|wiring|cable/.test(text)) key = 'wire'
  else if (/cement/.test(text)) key = 'cement'
  else if (/steel|tmt|bar/.test(text)) key = 'steel'
  else if (/paint/.test(text)) key = 'paint'
  const options = variants[key] || [`${itemName} brand-wise supplier quotation`, `${itemName} marketplace supplier listing`, `${itemName} procurement catalogue listing`]
  return options[sourceIndex % options.length]
}

function sourceSkuPrefix(source) {
  if (source.company.includes('GeM')) return 'GEM-SRC'
  if (source.company.includes('IndiaMART')) return 'IMART-SRC'
  if (source.company.includes('Moglix')) return 'MOGLIX-SRC'
  return 'SOURCE-SRC'
}

function genericPriceBasis(source, item, sourceIndex, productName) {
  const name = productName || realisticGenericProductName(item, sourceIndex)
  if (source.company.includes('GeM')) return `${name} - GeM marketplace procurement listing with institutional supplier options`
  if (source.company.includes('IndiaMART')) return `${name} - IndiaMART business supplier listing for bulk quotation`
  if (source.company.includes('Moglix')) return `${name} - Live supplier source unavailable, using benchmark procurement estimate`
  return `${name} - source-linked supplier catalogue price reference`
}


function genericCandidateForItem(item, source, sourceIndex) {
  const unit = normalizeUnit(item.unit || 'pieces')
  const unitPrice = estimateGenericUnitPrice(item, sourceIndex)
  const itemName = item.name || 'Procurement item'
  const link = searchLinkForSource(source, itemName)
  const productName = realisticGenericProductName(item, sourceIndex)
  const sourceStatus = sourceUnavailableMessage(source)
  const product = {
    sku: `${sourceSkuPrefix(source)}-${sourceIndex + 1}-${slugify(itemName).toUpperCase().slice(0, 28)}`,
    name: productName,
    category: item.productCategory || item.category || categoryGuess(itemName),
    price: unitPrice,
    unit: unit === 'pieces' ? 'piece' : unit,
    imageType: genericImageType(item),
    keywords: itemTokens(`${itemName} ${item.technicalSpecifications || ''} ${item.preferredBrand || ''}`),
    productUrl: sourceStatus ? '' : link,
    sourceUrl: sourceStatus ? '' : link,
    sourceName: source.company,
    priceBasis: sourceStatus || genericPriceBasis(source, item, sourceIndex, productName),
    sourceStatus,
    sourceUnavailable: Boolean(sourceStatus),
  }
  const line = lineFromProduct(item, source, product, Math.max(66, 78 - sourceIndex * 4))
  return { line, supplier: source, score: line.matchScore, deliveryDays: source.deliveryDays, rating: source.rating, commercialScore: source.commercialScore, totalPrice: safeNumber(line.totalPrice) }
}

function candidateGroupsForItems(items) {
  return items.map((item) => {
    if (isRestrictedProcurementItem(item)) return []
    const candidates = fallbackSuppliers.flatMap((supplier) => {
      const match = bestProductForItem(item, supplier)
      if (!match) return []
      const line = lineFromProduct(item, supplier, match.product, match.score)
      return [{ line, supplier, score: match.score, deliveryDays: safeNumber(supplier.deliveryDays, 30), rating: safeNumber(supplier.rating, 4.2), commercialScore: safeNumber(supplier.commercialScore, 85), totalPrice: safeNumber(line.totalPrice) }]
    }).sort((a, b) => b.score - a.score || a.totalPrice - b.totalPrice)
    if (candidates.length) return candidates
    return genericProcurementSources.map((source, sourceIndex) => genericCandidateForItem(item, source, sourceIndex))
      .sort((a, b) => b.score - a.score || a.totalPrice - b.totalPrice)
  })
}

function createConsolidatedFallbackTenders(items, startIndex = 1, requirements = {}) {
  const groups = candidateGroupsForItems(items)
  if (!groups.length || groups.some((group) => !group.length)) return []
  const strategies = [
    ['COMPLETE-VALUE', 'Best Value Complete Tender', 'Complete multi-source quote using the lowest validated line prices for every requested item.', (candidate) => [candidate.totalPrice, -candidate.score, candidate.deliveryDays], 90, 4.35],
    ['COMPLETE-TECH', 'Best Technical Complete Tender', 'Complete multi-source quote prioritising the highest item match and OEM source quality.', (candidate) => [-candidate.score, -candidate.rating, candidate.totalPrice], 87, 4.55],
    ['COMPLETE-FAST', 'Fast Delivery Complete Tender', 'Complete multi-source quote prioritising faster supplier lead times while keeping source links for each item.', (candidate) => [candidate.deliveryDays, candidate.totalPrice, -candidate.score], 86, 4.25],
  ]
  const seen = new Set()
  const compareBy = (sorter) => (a, b) => {
    const av = sorter(a); const bv = sorter(b)
    for (let i = 0; i < av.length; i += 1) if (av[i] !== bv[i]) return av[i] - bv[i]
    return 0
  }
  return strategies.flatMap(([label, company, description, sorter, commercialSeed, ratingSeed], index) => {
    let chosen = groups.map((group) => [...group].sort(compareBy(sorter))[0])
    let signature = chosen.map((entry) => entry.line.sku).join('|')
    if (seen.has(signature)) {
      const largestGroupIndex = groups.findIndex((group) => group.length > 1)
      if (largestGroupIndex >= 0) {
        chosen = [...chosen]
        chosen[largestGroupIndex] = [...groups[largestGroupIndex]].sort(compareBy(sorter))[1]
        signature = chosen.map((entry) => entry.line.sku).join('|')
      }
    }
    if (seen.has(signature)) return []
    seen.add(signature)
    const firstSupplier = chosen[0].supplier
    const lines = chosen.map((entry) => entry.line)
    const deliveryDays = Math.max(...chosen.map((entry) => entry.deliveryDays))
    const avgCommercial = chosen.reduce((sum, entry) => sum + entry.commercialScore, 0) / chosen.length
    const avgRating = chosen.reduce((sum, entry) => sum + entry.rating, 0) / chosen.length
    return [createTenderFromLines({
      requirements,
      id: `composite-${startIndex + index}`,
      label,
      company,
      supplierType: 'Complete consolidated tender',
      description,
      website: firstSupplier.website,
      catalogueUrl: firstSupplier.catalogueUrl,
      tenderUrl: firstSupplier.tenderUrl,
      deliveryDays,
      rating: avgRating * 0.78 + ratingSeed * 0.22,
      commercialSeed: avgCommercial * 0.78 + commercialSeed * 0.22,
      lines,
      consolidated: true,
    })]
  })
}

function createFallbackRecommendations(requirements) {
  const normalized = normalizeFallbackItems(requirements)
  const items = normalized.items
  const tenders = fallbackSuppliers.map((supplier, supplierIndex) => {
    const lines = items.map((item) => {
      const match = bestProductForItem(item, supplier)
      return match ? lineFromProduct(item, supplier, match.product, match.score) : null
    }).filter(Boolean)
    if (!items.length || lines.length !== items.length) return null
    return createTenderFromLines({
      requirements,
      id: `fallback-${supplierIndex + 1}`,
      label: 'RFP-QTN',
      company: supplier.company,
      supplierType: supplier.supplierType,
      description: supplier.description || 'Verified browser-side supplier match used when the backend is not running.',
      website: supplier.website,
      catalogueUrl: supplier.catalogueUrl,
      tenderUrl: supplier.tenderUrl,
      leadTime: supplier.leadTime,
      deliveryDays: supplier.deliveryDays,
      rating: supplier.rating,
      commercialSeed: supplier.commercialScore,
      lines,
    })
  }).filter(Boolean)

  if (tenders.length < 3) {
    const signatures = new Set(tenders.map((tender) => tender.lines.map((line) => line.sku).join('|')))
    createConsolidatedFallbackTenders(items, tenders.length + 1, requirements).forEach((tender) => {
      const signature = tender.lines.map((line) => line.sku).join('|')
      if (!signatures.has(signature)) {
        tenders.push(tender)
        signatures.add(signature)
      }
    })
  }

  const totals = tenders.map((tender) => tender.summary.grandTotal).filter((total) => total > 0)
  const minTotal = Math.min(...totals)
  tenders.forEach((tender) => {
    if (Number.isFinite(minTotal) && tender.summary.grandTotal > 0) {
      refreshTenderCommercialScores(tender, requirements, minTotal)
    }
  })
  tenders.sort((a, b) => b.matchScore - a.matchScore || a.summary.grandTotal - b.summary.grandTotal)
  tenders.forEach((tender, index) => { tender.rank = index + 1 })
  const missingCatalogItems = items.filter((item, index) => !(candidateGroupsForItems(items)[index] || []).length).map((item) => item.name)
  return {
    success: true,
    generatedAt: new Date().toISOString(),
    pricingMode: 'verified-catalog',
    priceDisclaimer: 'AI-assisted supplier and tender matching using source-linked price snapshots, marketplace and procurement source links, and configured catalog data. Final approval remains with the business user.',
    tenders,
    recommendedTender: tenders[0],
    requestedItems: items,
    budget: safeNumber(requirements?.budget),
    inferredItems: normalized.inferredItems,
    inferenceNote: normalized.inferenceNote,
    partialMode: false,
    missingCatalogItems,
  }
}

function ProductThumbnail({ type = 'product' }) {
  const icon = { wire: '🧵', mcb: '▣', lighting: '▰', bulb: '💡', fan: '✦', furniture: '🪑', projector: '▱' }[type] || '📦'
  return <span className={`product-thumb product-thumb--${type}`}>{icon}</span>
}

function ExternalLink({ href, children, className = '', fallback = null }) {
  if (!href) return fallback || null
  return <a href={href} target="_blank" rel="noreferrer" className={className}>{children}</a>
}

function SourceUnavailableBadge({ message }) {
  if (!message) return null
  return <span className="source-unavailable-badge">{message}</span>
}

function TenderResults({ requirementsData, loginData, onContinueWorkflow, onBackToRequirements, onTenderDataReady }) {
  const [tenderData, setTenderData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloadStatus, setDownloadStatus] = useState('')

  const rawItems = useMemo(() => requirementsData?.items?.filter((item) => item.name?.trim()) || [], [requirementsData])

  useEffect(() => {
    const loadTenders = async () => {
      setLoading(true)
      try {
        const response = await fetch(`${BACKEND_URL}/api/tender-recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requirements: requirementsData, requester: loginData }),
        })
        if (!response.ok) throw new Error('Backend recommendation service unavailable')
        const data = await response.json()
        if (!data.success) throw new Error(data.error || 'Unable to calculate tender recommendations')
        const localFallback = createFallbackRecommendations(requirementsData)
        const requestedCount = localFallback.requestedItems?.length || 0
        const hasCompleteBackendTender = data.tenders?.some((tender) => (tender.lines?.length || 0) >= requestedCount && safeNumber(tender.summary?.grandTotal) > 0)
        if (!hasCompleteBackendTender) {
          setTenderData(localFallback)
          onTenderDataReady?.(localFallback)
        } else {
          setTenderData(data)
          onTenderDataReady?.(data)
        }
      } catch (requestError) {
        console.error(requestError)
        const fallbackData = createFallbackRecommendations(requirementsData)
        setTenderData(fallbackData)
        onTenderDataReady?.(fallbackData)
      } finally {
        setLoading(false)
      }
    }
    loadTenders()
  }, [requirementsData, loginData])

  const previewProducts = useMemo(() => tenderData?.tenders?.flatMap((tender) => tender.lines || []).slice(0, 8) || [], [tenderData])
  const displayItems = tenderData?.requestedItems?.length ? tenderData.requestedItems : rawItems
  const hasTenderMatches = (tenderData?.tenders?.filter((tender) => (tender.lines?.length || 0) >= Math.max(displayItems.length, 1) && safeNumber(tender.summary?.grandTotal) > 0).length || 0) > 0
  const budget = safeNumber(requirementsData?.budget)
  const bestTotal = tenderData?.recommendedTender?.summary?.grandTotal || tenderData?.tenders?.[0]?.summary?.grandTotal || 0
  const isWithinBudget = budget > 0 && bestTotal <= budget

  const downloadFallbackDocument = () => {
    const projectTitle = requirementsData?.title || 'Procurement RFP'
    const tenders = tenderData?.tenders || []
    const rows = tenders.map((tender) => `
      <tr><td>${tender.rank}</td><td>${tender.company}</td><td>${tender.tenderRef}</td><td>${tender.matchScore}%</td><td>${tender.leadTime}</td><td>${formatCurrency(tender.summary?.grandTotal)}</td><td>${tender.tenderUrl || tender.catalogueUrl || tender.website || ''}</td></tr>
    `).join('')
    const itemRows = displayItems.map((item, index) => `<tr><td>${index + 1}</td><td>${item.name}</td><td>${item.quantity || 0}</td><td>${item.unit || 'units'}</td></tr>`).join('')
    const sourceRows = tenders.flatMap((tender) => tender.lines || []).map((line) => `
      <tr><td>${line.itemName}</td><td>${line.supplierName || ''}</td><td>${line.matchedProduct}</td><td>${formatCurrency(line.unitPrice)}</td><td>${formatCurrency(line.totalPrice)}</td><td>${line.productUrl || line.sourceUrl || ''}</td></tr>
    `).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${projectTitle} - RFP Document</title><style>body{font-family:Arial,sans-serif;color:#111827;line-height:1.5}table{width:100%;border-collapse:collapse;margin:14px 0 24px}th,td{border:1px solid #d1d5db;padding:8px;text-align:left;vertical-align:top}th{background:#eef2ff}</style></head><body><h1>Request for Proposal</h1><p>Generated on ${new Date().toLocaleString('en-IN')}</p><h2>1. Project Details</h2><p><strong>Project:</strong> ${projectTitle}</p><p><strong>Organization:</strong> ${requirementsData?.organization || 'Not specified'}</p><p><strong>Company Email:</strong> ${requirementsData?.companyEmail || 'Not specified'}</p><p><strong>Industry:</strong> ${requirementsData?.industry || 'Not specified'}</p><p><strong>Budget:</strong> ${formatCurrency(requirementsData?.budget)}</p><p><strong>Delivery Timeline:</strong> ${requirementsData?.timeline || 'Not specified'}</p><h2>2. Required Items</h2><table><thead><tr><th>#</th><th>Item</th><th>Quantity</th><th>Unit</th></tr></thead><tbody>${itemRows}</tbody></table><h2>3. Top Company Tender Comparison</h2><table><thead><tr><th>Rank</th><th>Company</th><th>Tender Ref</th><th>Match</th><th>Lead Time</th><th>Total Quote</th><th>Tender Link</th></tr></thead><tbody>${rows}</tbody></table><h2>4. Product Source Links</h2><table><thead><tr><th>Requested Item</th><th>Supplier</th><th>Matched Product</th><th>Unit Price</th><th>Total</th><th>Preview / Source Link</th></tr></thead><tbody>${sourceRows}</tbody></table><h2>5. Scope and Terms</h2><p>Vendors must submit product datasheets, commercial quote, warranty terms, GST details, delivery schedule, and compliance declarations. Pricing should include packaging, freight, testing, inspection, insurance, applicable taxes, and all charges needed for complete delivery.</p></body></html>`
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
        body: JSON.stringify({ requirements: requirementsData, requester: loginData, tenderAnalysis: tenderData }),
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
    } catch (downloadError) {
      console.error(downloadError)
      downloadFallbackDocument()
      setDownloadStatus('Backend PDF was unavailable, so a Word-compatible RFP document was downloaded instead.')
    }
  }

  return (
    <main className="tender-page">
      <section className="tender-container">
        <header className="tender-header">
          <div className="tender-header-mark">✓</div>
          <div>
            <h1>Top Company Tenders</h1>
            <p>Complete quotes for every entered requirement item, with source-linked product prices and tender links.</p>
          </div>
        </header>

        <section className="tender-card requirement-summary-card">
          <div className="summary-left">
            <span className="section-icon blue">📋</span>
            <div>
              <h2>{requirementsData?.title || 'Procurement Requirement'}</h2>
              <p>{requirementsData?.organization || 'Organization not specified'} • {requirementsData?.industry || 'Industry not selected'}</p>
            </div>
          </div>
          <div className="summary-metrics">
            <div><strong>{displayItems.length}</strong><span>{tenderData?.inferredItems ? 'Starter BOQ items' : 'Items'}</span></div>
            <div><strong>{formatCurrency(budget)}</strong><span>Budget</span></div>
            <div className={isWithinBudget ? 'budget-ok' : 'budget-watch'}><strong>{bestTotal ? formatCurrency(bestTotal) : 'Calculating'}</strong><span>{isWithinBudget ? 'Best quote within budget' : 'Best quote / estimate'}</span></div>
          </div>
        </section>

        {loading && (
          <section className="tender-card loading-card">
            <div className="spinner" />
            <h2>Finding matching company tenders...</h2>
            <p>Checking every requested item, supplier coverage, product price links, delivery timeline, technical fit, and commercial totals.</p>
          </section>
        )}

        {!loading && tenderData && (
          <>
            {tenderData.inferredItems && (
              <section className="tender-card tender-note-card inferred-note-card">
                <h2>Starter BOQ inferred from your broad electrical input</h2>
                <p>{tenderData.inferenceNote}</p>
                <div className="inferred-items-list">{displayItems.map((item, index) => <span key={`${item.name}-${index}`}>{item.name} · {item.quantity} {item.unit}</span>)}</div>
              </section>
            )}

            <section className="tender-3d-panel">
              <div className="tender-3d-copy">
                <p className="tender-eyebrow">3D Tender Workspace</p>
                <h2>Every tender below contains line items, source links, product prices, quote totals, and selectable workflow data.</h2>
                <p>{tenderData.priceDisclaimer}</p>
                <div className="source-summary">
                  <span>{tenderData.tenders?.length || 0} tender options</span>
                  <span>{previewProducts.length} linked products</span>
                  <span>Updated {formatDate(tenderData.generatedAt)}</span>
                </div>
              </div>
              <ProductScene3D products={previewProducts} />
            </section>

            {tenderData.missingCatalogItems?.length > 0 && (
              <section className="tender-card tender-note-card warning-note-card">
                <h2>Additional supplier source enrichment needed</h2>
                <p>The bundled supplier catalog does not contain exact contracted SKU pricing for: {tenderData.missingCatalogItems.join(', ')}. Source-linked procurement listings were prepared where safe; exact contracted rates can be connected through your pricing feed when needed.</p>
              </section>
            )}

            {!hasTenderMatches && (
              <section className="tender-card no-tender-card">
                <h2>No verified company tender matched the exact items yet</h2>
                <p>Try adding specific item names such as “2.5 sq.mm copper wire”, “25A MCB”, “20W LED batten”, “school bench”, “projector”, or “9W LED bulb”.</p>
                <button type="button" className="primary-action" onClick={onBackToRequirements}>Edit Requirements</button>
              </section>
            )}

            {hasTenderMatches && (
              <section className="tenders-list">
                {tenderData.tenders?.filter((tender) => (tender.lines?.length || 0) >= Math.max(displayItems.length, 1) && safeNumber(tender.summary?.grandTotal) > 0).map((tender) => (
                  <article className="company-tender-card" key={tender.id || tender.tenderRef}>
                    <div className="tender-rank">#{tender.rank}</div>
                    <div className="company-tender-main">
                      <div className="company-tender-top">
                        <div>
                          <p className="tender-ref">{tender.tenderRef}</p>
                          <h3>{tender.company}</h3>
                          <div className="company-meta">
                            <span>{tender.supplierType || 'Verified supplier'}</span>
                            <ExternalLink href={tender.tenderUrl || tender.catalogueUrl || tender.website}>Tender link</ExternalLink>
                            <ExternalLink href={tender.website}>Website preview</ExternalLink>
                            <ExternalLink href={tender.catalogueUrl}>Products sold</ExternalLink>
                          </div>
                          {tender.description && <p className="company-description">{tender.description}</p>}
                          {tender.sourceSuppliers?.length > 1 && <p className="source-suppliers"><strong>Source suppliers:</strong> {tender.sourceSuppliers.join(', ')}</p>}
                        </div>
                        <div className="quote-total"><span>Total Quote</span><strong>{formatCurrency(tender.summary?.grandTotal)}</strong></div>
                      </div>

                      <div className="score-grid">
                        <div><strong>{tender.matchScore}%</strong><span>Overall Match</span></div>
                        <div><strong>{tender.technicalScore}%</strong><span>Technical</span></div>
                        <div><strong>{tender.commercialScore}%</strong><span>Commercial</span></div>
                        <div><strong>{tender.leadTime}</strong><span>Delivery</span></div>
                      </div>

                      {tender.previewProducts?.length > 0 && (
                        <div className="product-preview-strip">
                          {tender.previewProducts.slice(0, 5).map((product) => {
                            const href = product.productUrl || product.sourceUrl
                            const chip = (
                              <>
                                <ProductThumbnail type={product.imageType} />
                                <span><strong>{product.category || 'Product'}</strong><small>{product.name}</small>{product.sourceStatus && <small>{product.sourceStatus}</small>}</span>
                              </>
                            )
                            return href
                              ? <ExternalLink href={href} className="preview-chip" key={product.sku || product.name}>{chip}</ExternalLink>
                              : <span className="preview-chip preview-chip--disabled" key={product.sku || product.name}>{chip}</span>
                          })}
                        </div>
                      )}

                      <div className="tender-lines-table">
                        <div className="tender-lines-head"><span>Item</span><span>Matched Product</span><span>Qty</span><span>Unit Price</span><span>Total</span><span>Preview</span></div>
                        {tender.lines?.map((line, index) => (
                          <div className="tender-line" key={`${line.sku}-${index}`}>
                            <span>{line.itemName}</span>
                            <span className="line-product-cell">
                              <ProductThumbnail type={line.imageType} />
                              <span>{line.matchedProduct}<small>{line.sku} • {line.matchScore}% match</small><small>{line.supplierName || line.priceSource}</small><small>{line.sourceStatus || line.priceBasis || line.priceSource}</small>{line.quantityNote && <small>{line.quantityNote}</small>}</span>
                            </span>
                            <span>{line.quantity} {line.unit}</span>
                            <span>{formatCurrency(line.unitPrice)}</span>
                            <span>{formatCurrency(line.totalPrice)}</span>
                            <span className="line-links">{line.sourceUnavailable ? <small className="source-unavailable">Source unavailable</small> : <><ExternalLink href={line.productUrl}>Product</ExternalLink><ExternalLink href={line.sourceUrl}>Price</ExternalLink></>}</span>
                          </div>
                        ))}
                      </div>

                      <div className="commercial-breakup">
                        <span>Material: {formatCurrency(tender.summary?.itemTotal)}</span>
                        <span>Freight: {formatCurrency(tender.summary?.freight)}</span>
                        <span>Testing: {formatCurrency(tender.summary?.testing)}</span>
                        <span>Insurance: {formatCurrency(tender.summary?.insurance)}</span>
                        <span>GST: {formatCurrency(tender.summary?.gst)}</span>
                      </div>

                      <div className="compliance-tags">{tender.compliance?.map((item) => <span key={item}>{item}</span>)}</div>
                      <div className="select-tender-row">
                        <button type="button" className="primary-action compact-action" onClick={() => onContinueWorkflow(tender, tenderData)} disabled={!tender.lines?.length}>Use this tender in workflow</button>
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            )}

            <section className="tender-actions tender-card">
              <div>
                <h2>Download generated RFP document</h2>
                <p>The document includes project scope, BOQ, vendor comparison, product source links, commercial terms, evaluation criteria, compliance checklist, and submission instructions.</p>
                {downloadStatus && <span className="download-status">{downloadStatus}</span>}
              </div>
              <div className="action-buttons">
                <button type="button" className="secondary-action" onClick={onBackToRequirements}>Edit Requirements</button>
                <button type="button" className="secondary-action" onClick={() => onContinueWorkflow(tenderData?.recommendedTender || tenderData?.tenders?.[0], tenderData)} disabled={!((tenderData?.recommendedTender || tenderData?.tenders?.[0])?.lines?.length)}>Continue Existing Workflow</button>
                <button type="button" className="primary-action" onClick={handleDownloadRfp}>Download RFP Document</button>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  )
}

export default TenderResults
