import { useState } from 'react'
import './Dashboard.css'

const BACKEND_URL = 'http://localhost:8000'

function Dashboard({ onStartProcess }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [scanStatus, setScanStatus] = useState('')
  

  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const file = files[0]
      handleFileUpload(file)
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const handleFileUpload = async (file) => {
    // Check if file is PDF or common document format
    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    
    if (!validTypes.includes(file.type)) {
      alert('Please upload a valid RFP document (PDF or Word format)')
      return
    }

    setUploadedFile(file)
    setIsUploading(true)
    setScanStatus('Uploading RFP document...')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${BACKEND_URL}/upload-rfp`, {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        setScanStatus(`✓ ${file.name} uploaded successfully!`)
        setTimeout(() => {
          onStartProcess(data)
        }, 1000)
      } else {
        alert(`Upload failed: ${data.error}`)
        setScanStatus('')
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert('Failed to upload RFP document. Please ensure the backend server is running.')
      setScanStatus('')
    } finally {
      setIsUploading(false)
    }
  }

  const handleScanWeb = async () => {
    setIsScanning(true)
    setScanStatus('Scanning websites for RFPs...')

    try {
      // List of RFP websites to scan
      const urls = [
        'https://eprocure.gov.in/eprocure/app',
        'https://gem.gov.in',
        // Add more RFP sources as needed
      ]

      const response = await fetch(`${BACKEND_URL}/identify-rfps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ urls })
      })

      const data = await response.json()

      if (data.success) {
        setScanStatus(`✓ Found ${data.total_found} RFPs. Processing best match...`)
        setTimeout(() => {
          onStartProcess(data.selected_rfp)
        }, 1000)
      } else {
        alert(`Scan failed: ${data.error}`)
        setScanStatus('')
      }
    } catch (error) {
      console.error('Scan error:', error)
      alert('Failed to scan for RFPs. Please ensure the backend server is running.')
      setScanStatus('')
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-hero">
        <h2>Welcome to the RFP Agent System</h2>
        <p>Automate your B2B RFP response process with AI-powered agents</p>
        
        {scanStatus && (
          <div className="scan-status">
            {scanStatus}
          </div>
        )}
        
        <div className="action-options">
          <button 
            className="cta-button" 
            onClick={handleScanWeb}
            disabled={isScanning || isUploading}
          >
            {isScanning ? '🔄 Scanning...' : '🚀 Scan new RFP'}
          </button>
          
          <div className="divider">
            <span>OR</span>
          </div>
          
          <div 
            className={`drop-zone ${isDragging ? 'dragging' : ''} ${isUploading ? 'uploading' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="rfp-file-input"
              accept=".pdf,.doc,.docx"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              disabled={isScanning || isUploading}
            />
            <label htmlFor="rfp-file-input" className="drop-zone-label">
              <div className="drop-zone-icon">
                {isUploading ? '⏳' : '📄'}
              </div>
              <div className="drop-zone-text">
                <strong>
                  {isUploading ? 'Uploading...' : 'Drop RFP document here'}
                </strong>
                <span>{isUploading ? 'Please wait' : 'or click to browse'}</span>
              </div>
              <div className="drop-zone-formats">PDF, DOC, DOCX</div>
            </label>
            {uploadedFile && (
              <div className="uploaded-file-info">
                ✓ {uploadedFile.name}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="recent-activity">
        <h3>Recent Activity</h3>
        <div className="activity-list">
          <div className="activity-item">
            <span className="activity-status completed">✓</span>
            <div className="activity-details">
              <strong>RFP #2024-156</strong>
              <span>Mumbai Metro Project - Completed 2 hours ago</span>
            </div>
          </div>
          <div className="activity-item">
            <span className="activity-status completed">✓</span>
            <div className="activity-details">
              <strong>RFP #2024-155</strong>
              <span>Delhi Infrastructure - Completed 5 hours ago</span>
            </div>
          </div>
          <div className="activity-item">
            <span className="activity-status pending">⏳</span>
            <div className="activity-details">
              <strong>RFP #2024-154</strong>
              <span>Bangalore Power Grid - In Progress</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
