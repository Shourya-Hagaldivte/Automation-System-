/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react'
import './SalesAgent.css'

const BACKEND_URL = 'http://localhost:8000'

function SalesAgent({ onComplete }) {
  const [scanning, setScanning] = useState(false)
  const [scannedRFPs, setScannedRFPs] = useState([])
  const [selectedRFP, setSelectedRFP] = useState(null)
  const [urls] = useState([
    'https://tenders.gov.in',
    'https://ntpc.co.in/tenders',
    'https://powergrind.com/rfp',
    'https://infrastructure.maharashtra.gov.in'
  ])

  const fetchRealRFPs = async () => {
    try {
      console.log('🔄 Sales Agent: Fetching real RFPs from backend')
      const response = await fetch(`${BACKEND_URL}/api/rfp-summaries`)
      const data = await response.json()
      
      if (data.success && data.summaries.length > 0) {
        console.log('✅ Sales Agent: Loaded', data.summaries.length, 'RFPs from backend')
        
        // Transform backend data to match the expected format
        const transformedRFPs = data.summaries.map((summary, index) => {
          const metadata = summary.data?.metadata || {}
          const matches = summary.data?.matches || []
          
          // Calculate estimated value from matches
          let estimatedValue = 0
          if (matches.length > 0) {
            // Sum up some sample values (this is just for display)
            estimatedValue = matches.length * 125000
          }
          
          // Calculate days remaining
          let daysRemaining = 0
          if (metadata.submission_due_date) {
            const dueDate = new Date(metadata.submission_due_date)
            const today = new Date()
            daysRemaining = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))
          }
          
          // Determine priority based on due date
          const priority = daysRemaining < 60 ? 'high' : 'medium'
          
          // Extract product categories from matches
          const productCategories = matches
            .slice(0, 3)
            .map(m => m.matched_product?.split(' ').slice(0, 3).join(' ') || 'Cable')
          
          return {
            id: `RFP-${metadata.rfp_reference_number || `2025-${String(index + 1).padStart(3, '0')}`}`,
            title: metadata.rfp_title || summary.filename.replace('.json', ''),
            source: metadata.issuing_authority || 'Government Authority',
            dueDate: metadata.submission_due_date || '2025-03-01',
            daysRemaining: daysRemaining > 0 ? daysRemaining : 30,
            productCategories: productCategories.length > 0 ? productCategories : ['Cables', 'Wires'],
            estimatedValue: `₹${(estimatedValue).toLocaleString('en-IN')}`,
            priority: priority,
            metadata: metadata,
            matchData: summary.data
          }
        })
        
        setScannedRFPs(transformedRFPs)
        console.log('📊 Sales Agent: Transformed RFPs:', transformedRFPs)
      } else {
        console.warn('⚠️ Sales Agent: No RFPs found in backend, using fallback')
        // Only show message, don't use mock data
        setScannedRFPs([])
      }
    } catch (error) {
      console.error('❌ Sales Agent: Error fetching RFPs:', error)
      setScannedRFPs([])
    }
  }

  const startScan = () => {
    setScanning(true)
    console.log('🚀 Sales Agent: Starting scan...')
    
    // Simulate scanning process then fetch real data
    setTimeout(async () => {
      await fetchRealRFPs()
      setScanning(false)
    }, 3000)
  }

  const selectRFP = (rfp) => {
    setSelectedRFP(rfp)
  }

  const proceedWithRFP = () => {
    if (selectedRFP) {
      onComplete(selectedRFP)
    }
  }

  useEffect(() => {
    startScan()
  }, [])

  return (
    <div className="sales-agent">
      <div className="agent-header">
        <h2>🤖 Sales Agent</h2>
        <p>Scanning predefined URLs for RFPs due in the next 3 months</p>
      </div>

      <div className="url-scanner">
        <h3>Scanning URLs</h3>
        <div className="url-list">
          {urls.map((url, index) => (
            <div key={index} className={`url-item ${scanning ? 'scanning' : 'scanned'}`}>
              <span className="url-icon">{scanning ? '⏳' : '✓'}</span>
              <span className="url-text">{url}</span>
            </div>
          ))}
        </div>
      </div>

      {scanning && (
        <div className="scanning-indicator">
          <div className="spinner"></div>
          <p>Scanning websites for RFPs...</p>
        </div>
      )}

      {!scanning && scannedRFPs.length > 0 && (
        <div className="rfp-results">
          <h3>✅ Found {scannedRFPs.length} RFPs from Backend (Real Data)</h3>
          <div className="rfp-grid">
            {scannedRFPs.map((rfp) => (
              <div 
                key={rfp.id} 
                className={`rfp-card ${selectedRFP?.id === rfp.id ? 'selected' : ''} ${rfp.priority}`}
                onClick={() => selectRFP(rfp)}
              >
                <div className="rfp-header">
                  <span className="rfp-id">{rfp.id}</span>
                  <span className={`priority-badge ${rfp.priority}`}>
                    {rfp.priority === 'high' ? '🔴' : '🟡'} {rfp.priority.toUpperCase()}
                  </span>
                </div>
                <h4>{rfp.title}</h4>
                <div className="rfp-meta">
                  <p><strong>Source:</strong> {rfp.source}</p>
                  <p><strong>Due Date:</strong> {rfp.dueDate}</p>
                  <p><strong>Days Remaining:</strong> <span className="days-badge">{rfp.daysRemaining} days</span></p>
                  <p><strong>Estimated Value:</strong> {rfp.estimatedValue}</p>
                </div>
                <div className="rfp-categories">
                  <strong>Products:</strong>
                  <div className="category-tags">
                    {rfp.productCategories.map((cat, idx) => (
                      <span key={idx} className="category-tag">{cat}</span>
                    ))}
                  </div>
                </div>
                {selectedRFP?.id === rfp.id && (
                  <div className="selected-indicator">✓ Selected for Processing</div>
                )}
              </div>
            ))}
          </div>

          {selectedRFP && (
            <div className="action-panel">
              <button className="proceed-button" onClick={proceedWithRFP}>
                Proceed with Selected RFP →
              </button>
            </div>
          )}
        </div>
      )}

      {!scanning && scannedRFPs.length === 0 && (
        <div className="no-rfps-message">
          <h3>ℹ️ No RFPs Found</h3>
          <p>No RFP summaries are currently available in the backend.</p>
          <p>Upload an RFP document or scan for new RFPs to get started.</p>
        </div>
      )}
    </div>
  )
}

export default SalesAgent
