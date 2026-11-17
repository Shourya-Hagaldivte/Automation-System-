import { useState, useEffect } from 'react'
import './PricingAgent.css'

const BACKEND_URL = 'http://localhost:8000'

function PricingAgent({ rfpData, technicalData, onComplete }) {
  const [processing, setProcessing] = useState(true)
  const [pricingData, setpricingData] = useState(null)

  useEffect(() => {
    calculatePricing()
  }, [rfpData])

  const normalizeSelectedTenderPricing = () => {
    if (!rfpData?.pricing) return null

    const pricing = rfpData.pricing
    const materials = pricing.materials?.length
      ? pricing.materials
      : (rfpData.lineItems || []).map((item) => ({
          sku: item.sku,
          name: item.name,
          quantity: item.quantityLabel,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          priceSource: item.priceSource,
        }))

    return {
      materials,
      tests: pricing.tests || [],
      additionalCosts: pricing.additionalCosts || [],
      summary: pricing.summary || {
        materialTotal: materials.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0),
        testTotal: 0,
        additionalTotal: 0,
        subtotal: materials.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0),
        gst: materials.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0) * 0.18,
        grandTotal: materials.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0) * 1.18,
      },
    }
  }

  const calculatePricing = async () => {
    try {
      const selectedTenderPricing = normalizeSelectedTenderPricing()
      if (selectedTenderPricing) {
        setpricingData(selectedTenderPricing)
        return
      }

      const response = await fetch(`${BACKEND_URL}/api/calculate-pricing`)
      const data = await response.json()
      if (data.success) {
        setpricingData(data.pricing)
      } else {
        throw new Error(data.error || 'Failed to load pricing')
      }
    } catch (error) {
      console.error('Pricing Agent error:', error)
      setpricingData({
        materials: [],
        tests: [],
        additionalCosts: [],
        summary: {
          materialTotal: 0,
          testTotal: 0,
          additionalTotal: 0,
          subtotal: 0,
          gst: 0,
          grandTotal: 0,
        },
      })
    } finally {
      setProcessing(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const unitLabel = (item) => {
    if (item.unit) return `/${item.unit.replace(/s$/, '')}`
    if (String(item.quantity || '').toLowerCase().includes('meter')) return '/meter'
    return '/unit'
  }

  const proceedToResults = () => {
    onComplete({
      technical: technicalData?.technical || [],
      pricing: pricingData,
    })
  }

  return (
    <div className="pricing-agent">
      <div className="agent-header">
        <h2>💰 Pricing Agent</h2>
        <p>Calculating item-wise cost from the selected company tender and pricing source</p>
      </div>

      {processing && (
        <div className="processing-indicator">
          <div className="spinner"></div>
          <p>Preparing pricing, GST, inspection and logistics totals...</p>
        </div>
      )}

      {!processing && pricingData && (
        <>
          <div className="pricing-section">
            <h3>Material Pricing</h3>
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product Name</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Total Price</th>
                </tr>
              </thead>
              <tbody>
                {pricingData.materials.map((item, idx) => (
                  <tr key={idx}>
                    <td><code>{item.sku}</code></td>
                    <td>
                      {item.name}
                      {item.priceSource && <small className="price-source">Source: {item.priceSource}</small>}
                    </td>
                    <td>{item.quantity}</td>
                    <td>{formatCurrency(item.unitPrice)}{unitLabel(item)}</td>
                    <td className="amount">{formatCurrency(item.totalPrice)}</td>
                  </tr>
                ))}
                <tr className="subtotal-row">
                  <td colSpan="4"><strong>Material Subtotal</strong></td>
                  <td className="amount"><strong>{formatCurrency(pricingData.summary.materialTotal)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="pricing-section">
            <h3>Testing & Acceptance Costs</h3>
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>Test Name</th>
                  <th>Applicable To</th>
                  <th>Duration</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {pricingData.tests.map((test, idx) => (
                  <tr key={idx}>
                    <td>{test.testName}</td>
                    <td>{test.applicableTo}</td>
                    <td>{test.duration}</td>
                    <td className="amount">{formatCurrency(test.cost)}</td>
                  </tr>
                ))}
                <tr className="subtotal-row">
                  <td colSpan="3"><strong>Testing Subtotal</strong></td>
                  <td className="amount"><strong>{formatCurrency(pricingData.summary.testTotal)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="pricing-section">
            <h3>Additional Costs</h3>
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {pricingData.additionalCosts.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.item}</td>
                    <td className="amount">{formatCurrency(item.cost)}</td>
                  </tr>
                ))}
                <tr className="subtotal-row">
                  <td><strong>Additional Costs Subtotal</strong></td>
                  <td className="amount"><strong>{formatCurrency(pricingData.summary.additionalTotal)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="final-summary">
            <h3>Final Pricing Summary</h3>
            <div className="summary-card">
              <div className="summary-row">
                <span className="label">Material Cost</span>
                <span className="value">{formatCurrency(pricingData.summary.materialTotal)}</span>
              </div>
              <div className="summary-row">
                <span className="label">Testing Cost</span>
                <span className="value">{formatCurrency(pricingData.summary.testTotal)}</span>
              </div>
              <div className="summary-row">
                <span className="label">Additional Costs</span>
                <span className="value">{formatCurrency(pricingData.summary.additionalTotal)}</span>
              </div>
              <div className="summary-row subtotal">
                <span className="label">Subtotal</span>
                <span className="value">{formatCurrency(pricingData.summary.subtotal)}</span>
              </div>
              <div className="summary-row">
                <span className="label">GST (18%)</span>
                <span className="value">{formatCurrency(pricingData.summary.gst)}</span>
              </div>
              <div className="summary-row grand-total">
                <span className="label">Grand Total</span>
                <span className="value">{formatCurrency(pricingData.summary.grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="action-panel">
            <button className="proceed-button" onClick={proceedToResults}>
              Complete & View Final Response →
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default PricingAgent
