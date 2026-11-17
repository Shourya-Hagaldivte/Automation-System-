/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react'
import './MainAgent.css'

function MainAgent({ rfpData, onDistribute }) {
  const [processing, setProcessing] = useState(true)
  const [technicalSummary, setTechnicalSummary] = useState(null)
  const [pricingSummary, setPricingSummary] = useState(null)

  useEffect(() => {
    setProcessing(true)
    const timer = setTimeout(() => {
      const lineItems = rfpData?.lineItems || []
      const scopeOfSupply = lineItems.length > 0
        ? lineItems.map((item) => ({
            item: item.requestedName || item.name,
            specification: item.catalogDescription || item.name || 'As per buyer requirement',
            quantity: item.quantityLabel || `${item.quantity || ''} ${item.unit || ''}`,
            standards: String(item.standards || 'Vendor to confirm').split(',').map((value) => value.trim()).filter(Boolean),
          }))
        : [
            {
              item: rfpData?.title || 'Procurement requirement',
              specification: 'As entered by buyer',
              quantity: 'As per BoQ',
              standards: ['Vendor to confirm'],
            },
          ]

      const technical = {
        scopeOfSupply,
        technicalRequirements: [
          'Submit OEM datasheets and technical compliance matrix for every item',
          'Confirm make, model, SKU, applicable IS / IEC standards and warranty terms',
          'Clearly mark any deviation from the buyer requirement',
          'Provide inspection, testing and acceptance documentation before dispatch',
        ],
      }

      const pricing = {
        testRequirements: rfpData?.pricing?.tests?.map((test) => `${test.testName} - ${test.duration}`) || [
          'Incoming material verification',
          'Routine quality tests / compliance check',
          'Final inspection and documentation',
        ],
        additionalRequirements: [
          `Selected company tender: ${rfpData?.companyName || rfpData?.source || 'Not selected'}`,
          `Price source: ${rfpData?.priceSource || 'Catalog / estimate'}`,
          `Delivery commitment: ${rfpData?.estimatedDelivery || 'As per selected tender'}`,
          `Payment terms: ${rfpData?.paymentTerms || 'To be finalized'}`,
        ],
      }

      setTechnicalSummary(technical)
      setPricingSummary(pricing)
      setProcessing(false)
    }, 900)

    return () => clearTimeout(timer)
  }, [rfpData])

  return (
    <div className="main-agent">
      <div className="agent-header">
        <h2>🎯 Main Agent (Orchestrator)</h2>
        <p>Processing the selected company tender and preparing summaries for the Technical and Pricing Agents</p>
      </div>

      {processing && (
        <div className="processing-indicator">
          <div className="spinner"></div>
          <p>Analyzing selected tender and preparing contextual summaries...</p>
        </div>
      )}

      {!processing && (
        <>
          <div className="rfp-overview">
            <h3>Selected Tender Overview</h3>
            <div className="overview-card">
              <div className="overview-header">
                <h4>{rfpData?.title || 'Selected Tender'}</h4>
                <span className="rfp-badge">{rfpData?.id || 'TENDER'}</span>
              </div>
              <div className="overview-details">
                <div className="detail-row">
                  <span className="label">Company:</span>
                  <span className="value">{rfpData?.companyName || rfpData?.source || 'Not available'}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Due Date:</span>
                  <span className="value">{rfpData?.dueDate || 'Not available'}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Estimated Value:</span>
                  <span className="value">{rfpData?.estimatedValue || 'Not available'}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Match Score:</span>
                  <span className="value">{rfpData?.matchScore ? `${rfpData.matchScore}%` : 'Not available'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="summaries-container">
            <div className="summary-panel technical-summary">
              <div className="summary-header">
                <h3>📋 Summary for Technical Agent</h3>
                <span className="agent-badge">Technical Team</span>
              </div>
              
              <div className="summary-section">
                <h4>Scope of Supply</h4>
                <div className="supply-list">
                  {technicalSummary.scopeOfSupply.map((item, idx) => (
                    <div key={idx} className="supply-item">
                      <div className="item-header">
                        <span className="item-number">{idx + 1}</span>
                        <strong>{item.item}</strong>
                      </div>
                      <p><strong>Specification:</strong> {item.specification}</p>
                      <p><strong>Quantity:</strong> {item.quantity}</p>
                      <p><strong>Standards:</strong> {item.standards.join(', ')}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="summary-section">
                <h4>Technical Requirements</h4>
                <ul className="requirements-list">
                  {technicalSummary.technicalRequirements.map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="summary-panel pricing-summary">
              <div className="summary-header">
                <h3>💰 Summary for Pricing Agent</h3>
                <span className="agent-badge">Pricing Team</span>
              </div>
              
              <div className="summary-section">
                <h4>Testing Requirements</h4>
                <ul className="requirements-list">
                  {pricingSummary.testRequirements.map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              </div>

              <div className="summary-section">
                <h4>Commercial Requirements</h4>
                <ul className="requirements-list">
                  {pricingSummary.additionalRequirements.map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="action-panel">
            <button className="distribute-button" onClick={onDistribute}>
              Distribute to Technical & Pricing Agents →
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default MainAgent
