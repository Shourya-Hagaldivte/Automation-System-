import { useState, useEffect } from 'react'
import './TechnicalAgent.css'

function TechnicalAgent({ rfpData, onComplete }) {
  const [processing, setProcessing] = useState(true)
  const [currentStep, setCurrentStep] = useState(0)
  const [products, setProducts] = useState([])
  const [selectedProducts, setSelectedProducts] = useState({})

  const steps = [
    'Analyzing selected tender requirements',
    'Checking proposed SKUs and supplier line items',
    'Matching specifications and compliance notes',
    'Calculating match percentage',
    'Generating final product recommendations',
  ]

  useEffect(() => {
    let active = true
    const simulateProcessing = async () => {
      setProcessing(true)
      for (let i = 0; i < steps.length; i++) {
        if (!active) return
        setCurrentStep(i)
        await new Promise((resolve) => setTimeout(resolve, 550))
      }

      const lineItems = rfpData?.lineItems || []
      const dynamicProducts = lineItems.length > 0
        ? lineItems.map((item) => {
            const baseSpecifications = item.specifications && Object.keys(item.specifications).length > 0
              ? item.specifications
              : {
                  Requirement: item.requestedName || item.name,
                  Unit: item.unit || 'units',
                  Standards: item.standards || 'Vendor to confirm',
                }

            const alternatives = item.alternatives?.length
              ? item.alternatives.slice(0, 2).map((alt, altIndex) => ({
                  rank: altIndex + 2,
                  sku: alt.sku || `ALT-${altIndex + 1}`,
                  name: alt.name || item.name,
                  matchPercentage: Math.round(alt.matchPercentage || Math.max(75, item.matchPercentage - 5 - altIndex * 4)),
                  specifications: alt.specifications && Object.keys(alt.specifications).length > 0 ? alt.specifications : baseSpecifications,
                  differences: ['Alternative product; validate final availability and datasheet before award'],
                }))
              : [
                  {
                    rank: 2,
                    sku: `${item.sku || 'SKU'}-ALT`,
                    name: `${item.name || item.requestedName} - equivalent option`,
                    matchPercentage: Math.max(78, Math.round((item.matchPercentage || 88) - 6)),
                    specifications: baseSpecifications,
                    differences: ['Equivalent market option; supplier confirmation required'],
                  },
                ]

            return {
              rfpItem: item.requestedName || item.name,
              rfpSpec: item.catalogDescription || item.name || 'As per buyer requirement',
              recommendations: [
                {
                  rank: 1,
                  sku: item.sku || 'SELECTED-SKU',
                  name: item.name || item.requestedName,
                  matchPercentage: Math.round(item.matchPercentage || 92),
                  specifications: baseSpecifications,
                  differences: ['Recommended from selected company tender', `Price source: ${item.priceSource || 'Catalog / estimate'}`],
                },
                ...alternatives,
              ].slice(0, 3),
            }
          })
        : [
            {
              rfpItem: rfpData?.title || 'Procurement requirement',
              rfpSpec: 'As entered by buyer',
              recommendations: [
                {
                  rank: 1,
                  sku: 'REQ-MATCH-001',
                  name: rfpData?.title || 'Recommended product',
                  matchPercentage: 88,
                  specifications: { Requirement: rfpData?.title || 'Procurement requirement' },
                  differences: ['Supplier to confirm datasheet and compliance'],
                },
              ],
            },
          ]

      if (!active) return
      setProducts(dynamicProducts)
      const autoSelected = {}
      dynamicProducts.forEach((product, idx) => {
        autoSelected[idx] = 0
      })
      setSelectedProducts(autoSelected)
      setProcessing(false)
    }

    simulateProcessing()
    return () => {
      active = false
    }
  }, [rfpData])

  const selectRecommendation = (productIndex, recommendationIndex) => {
    setSelectedProducts({
      ...selectedProducts,
      [productIndex]: recommendationIndex,
    })
  }

  const proceedToNext = () => {
    const finalSelection = products.map((product, idx) => {
      const selected = product.recommendations[selectedProducts[idx] || 0]
      return {
        rfpItem: product.rfpItem,
        selectedSKU: selected.sku,
        selectedProduct: selected.name,
        matchPercentage: selected.matchPercentage,
        specifications: selected.specifications,
      }
    })

    onComplete({ technical: finalSelection })
  }

  return (
    <div className="technical-agent">
      <div className="agent-header">
        <h2>🔧 Technical Agent</h2>
        <p>Matching buyer requirements with the selected company tender SKUs</p>
      </div>

      {processing && (
        <div className="processing-steps">
          {steps.map((step, idx) => (
            <div key={idx} className={`step-item ${idx <= currentStep ? 'active' : ''} ${idx < currentStep ? 'completed' : ''}`}>
              <div className="step-indicator">
                {idx < currentStep ? '✓' : idx === currentStep ? '⏳' : idx + 1}
              </div>
              <span className="step-label">{step}</span>
            </div>
          ))}
        </div>
      )}

      {!processing && products.length > 0 && (
        <>
          <div className="products-section">
            <h3>Product Matching Results</h3>
            {products.map((product, productIdx) => (
              <div key={productIdx} className="product-match-card">
                <div className="product-header">
                  <div>
                    <h4>{product.rfpItem}</h4>
                    <p className="rfp-spec">RFP Specification: {product.rfpSpec}</p>
                  </div>
                </div>

                <div className="recommendations">
                  <h5>Top OEM Product Recommendations</h5>
                  <div className="recommendation-grid">
                    {product.recommendations.map((rec, recIdx) => (
                      <div 
                        key={recIdx}
                        className={`recommendation-card rank-${rec.rank} ${selectedProducts[productIdx] === recIdx ? 'selected' : ''}`}
                        onClick={() => selectRecommendation(productIdx, recIdx)}
                      >
                        <div className="rec-header">
                          <span className="rank-badge">Rank #{rec.rank}</span>
                          <span className={`match-badge match-${rec.matchPercentage >= 95 ? 'high' : rec.matchPercentage >= 85 ? 'medium' : 'low'}`}>
                            {rec.matchPercentage}% Match
                          </span>
                        </div>
                        <h6>{rec.name}</h6>
                        <p className="sku">SKU: {rec.sku}</p>

                        <div className="specs-table">
                          <table>
                            <thead>
                              <tr>
                                <th>Parameter</th>
                                <th>Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(rec.specifications || {}).map(([key, value]) => (
                                <tr key={key}>
                                  <td>{key}</td>
                                  <td>{String(value)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="differences">
                          <strong>Notes:</strong>
                          <ul>
                            {rec.differences.map((diff, idx) => (
                              <li key={idx}>{diff}</li>
                            ))}
                          </ul>
                        </div>

                        {selectedProducts[productIdx] === recIdx && (
                          <div className="selected-indicator">✓ Selected</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="final-selection">
            <h3>Final Product Selection Summary</h3>
            <table className="selection-table">
              <thead>
                <tr>
                  <th>RFP Item</th>
                  <th>Selected SKU</th>
                  <th>Product Name</th>
                  <th>Spec Match</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product, idx) => {
                  const selected = product.recommendations[selectedProducts[idx] || 0]
                  return (
                    <tr key={idx}>
                      <td>{product.rfpItem}</td>
                      <td><code>{selected.sku}</code></td>
                      <td>{selected.name}</td>
                      <td>
                        <span className={`match-badge match-${selected.matchPercentage >= 95 ? 'high' : selected.matchPercentage >= 85 ? 'medium' : 'low'}`}>
                          {selected.matchPercentage}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="action-panel">
            <button className="proceed-button" onClick={proceedToNext}>
              Send to Pricing Agent →
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default TechnicalAgent
