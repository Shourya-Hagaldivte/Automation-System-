import { useState } from 'react'
import { procurementTemplates, relatedProductSuggestions } from './enterpriseFeatures'
import './RequirementsPage.css'

let itemIdCounter = 0

const createItemId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  itemIdCounter += 1
  return `item-${Date.now()}-${itemIdCounter}`
}

const createBlankItem = (overrides = {}) => ({
  id: createItemId(),
  productCategory: '',
  name: '',
  quantity: '',
  unit: 'pieces',
  technicalSpecifications: '',
  preferredBrand: '',
  ...overrides,
})

const organizationTypes = [
  'Construction company',
  'School',
  'College',
  'Hospital',
  'Office',
  'Park / public facility',
  'Government department',
  'Facility management company',
  'Other organization',
]

const productCategories = [
  'Electrical',
  'Lighting',
  'Furniture',
  'IT / AV equipment',
  'Construction material',
  'Facility maintenance',
  'Hospital / institutional supplies',
  'Office supplies',
  'Custom / other',
]

function RequirementsPage({ onFindSuppliers }) {
  const [projectDetails, setProjectDetails] = useState({
    title: '',
    organization: '',
    companyEmail: '',
    organizationType: '',
    industry: '',
    productCategory: '',
    budget: '',
    deliveryLocation: '',
    deliveryDeadline: '',
    timeline: '',
    warrantyRequirement: '',
    installationRequirement: 'Not required',
    maintenanceRequirement: '',
    complianceRequirements: '',
    commercialTerms: '',
    specialNotes: '',
  })
  const [items, setItems] = useState(() => [createBlankItem()])
  const [emailError, setEmailError] = useState('')

  const updateProject = (field, value) => {
    if (field === 'companyEmail') setEmailError('')
    setProjectDetails((current) => ({ ...current, [field]: value }))
  }

  const updateItem = (id, field, value) => {
    setItems((current) => current.map((item) => (
      item.id === id ? { ...item, [field]: value } : item
    )))
  }

  const addItem = () => {
    setItems((current) => [...current, createBlankItem()])
  }

  const hasManualProductData = items.some((item) => item.name || item.quantity || item.productCategory || item.technicalSpecifications || item.preferredBrand)

  const applyTemplate = (template) => {
    if (hasManualProductData && !window.confirm('This will replace current product rows with the selected template. Continue?')) return
    setItems(template.items.map((item) => createBlankItem(item)))
    if (!projectDetails.productCategory && template.items[0]?.productCategory) {
      updateProject('productCategory', template.items[0].productCategory)
    }
  }

  const addSuggestedItem = (suggestion) => {
    setItems((current) => [
      ...current,
      createBlankItem({
        productCategory: suggestion.productCategory || 'Custom / other',
        name: suggestion.name,
        quantity: '',
        unit: suggestion.unit || 'pieces',
        technicalSpecifications: '',
        preferredBrand: '',
      }),
    ])
  }

  const removeItem = (id) => {
    setItems((current) => (current.length === 1 ? current : current.filter((item) => item.id !== id)))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const companyEmail = projectDetails.companyEmail.trim()
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(companyEmail)) {
      setEmailError('Enter a valid company email for order tracking communication.')
      return
    }
    const cleanedItems = items
      .filter((item) => item.name.trim())
      .map(({ id, ...item }) => ({
        ...item,
        category: item.productCategory || projectDetails.productCategory,
        quantity: Number(item.quantity),
      }))
    onFindSuppliers({ ...projectDetails, companyEmail, items: cleanedItems })
  }

  return (
    <main className="requirements-page procurement-inner-page">
      <form className="requirements-container" onSubmit={handleSubmit}>
        <header className="requirements-header procurement-page-heading">
          <div className="requirements-check">AI</div>
          <div>
            <p className="page-eyebrow">Requirement Understanding Agent</p>
            <h1>Procurement Requirements</h1>
            <p>Enter complete purchase details. AI agents will identify products, discover suppliers, match tender sources, compare prices, and prepare recommendations.</p>
          </div>
        </header>

        <section className="requirements-card project-card">
          <div className="section-title">
            <span className="section-icon blue">🏢</span>
            <h2>Buyer and Project Details</h2>
          </div>

          <div className="project-grid">
            <label>
              Project Title <span>*</span>
              <input
                type="text"
                placeholder="e.g., School classroom infrastructure procurement"
                value={projectDetails.title}
                onChange={(event) => updateProject('title', event.target.value)}
                required
              />
            </label>

            <label>
              Organization <span>*</span>
              <input
                type="text"
                placeholder="Your organization name"
                value={projectDetails.organization}
                onChange={(event) => updateProject('organization', event.target.value)}
                required
              />
            </label>

            <label>
              Company Email <span>*</span>
              <input
                type="email"
                placeholder="procurement@company.com"
                pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                value={projectDetails.companyEmail}
                onChange={(event) => updateProject('companyEmail', event.target.value)}
                onBlur={(event) => {
                  const value = event.target.value.trim()
                  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                    setEmailError('Enter a valid company email for order tracking communication.')
                  }
                }}
                required
              />
              {emailError && <small className="form-error-message">{emailError}</small>}
            </label>

            <label>
              Organization Type <span>*</span>
              <select
                value={projectDetails.organizationType}
                onChange={(event) => updateProject('organizationType', event.target.value)}
                required
              >
                <option value="">Select organization type</option>
                {organizationTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>

            <label>
              Business Sector <span>*</span>
              <select
                value={projectDetails.industry}
                onChange={(event) => updateProject('industry', event.target.value)}
                required
              >
                <option value="">Select sector</option>
                <option value="construction">Construction</option>
                <option value="education">Education</option>
                <option value="healthcare">Healthcare</option>
                <option value="office">Corporate / office</option>
                <option value="government">Government / public sector</option>
                <option value="infrastructure">Infrastructure</option>
                <option value="facility-management">Facility management</option>
              </select>
            </label>

            <label>
              Main Product Category <span>*</span>
              <select
                value={projectDetails.productCategory}
                onChange={(event) => updateProject('productCategory', event.target.value)}
                required
              >
                <option value="">Select category</option>
                {productCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>

            <label>
              Budget (₹) <span>*</span>
              <input
                type="number"
                min="0"
                placeholder="e.g., 250000"
                value={projectDetails.budget}
                onChange={(event) => updateProject('budget', event.target.value)}
                required
              />
            </label>

            <label>
              Delivery Location <span>*</span>
              <input
                type="text"
                placeholder="e.g., Pune, Maharashtra"
                value={projectDetails.deliveryLocation}
                onChange={(event) => updateProject('deliveryLocation', event.target.value)}
                required
              />
            </label>

            <label>
              Required Delivery Deadline <span>*</span>
              <input
                type="date"
                value={projectDetails.deliveryDeadline}
                onChange={(event) => updateProject('deliveryDeadline', event.target.value)}
                required
              />
            </label>

            <label className="wide-field">
              Delivery Timeline <span>*</span>
              <select
                value={projectDetails.timeline}
                onChange={(event) => updateProject('timeline', event.target.value)}
                required
              >
                <option value="">Select timeline</option>
                <option value="urgent">Urgent, within 2 weeks</option>
                <option value="30-days">Within 30 days</option>
                <option value="60-days">Within 60 days</option>
                <option value="90-days">Within 90 days</option>
              </select>
            </label>
          </div>
        </section>

        <section className="requirements-card procurement-template-card">
          <div className="section-title">
            <span className="section-icon purple">🧩</span>
            <h2>Saved Procurement Templates</h2>
          </div>
          <p className="template-helper-text">Select a common procurement package to auto-fill products. Auto-filled products remain editable, and existing manual rows are not replaced unless you confirm.</p>
          <div className="template-grid">
            {procurementTemplates.map((template) => (
              <button type="button" className="template-card-button" key={template.id} onClick={() => applyTemplate(template)}>
                <strong>{template.name}</strong>
                <span>{template.description}</span>
                <small>{template.items.length} products</small>
              </button>
            ))}
          </div>
        </section>

        <section className="requirements-card items-card">
          <div className="section-title">
            <span className="section-icon purple">📦</span>
            <h2>Required Products</h2>
          </div>

          <div className="items-list">
            {items.map((item, index) => (
              <div className="item-row detailed-item-row" key={item.id}>
                <div className="item-row-header">
                  <strong>Product #{index + 1}</strong>
                  {items.length > 1 && <button type="button" className="remove-item-button" onClick={() => removeItem(item.id)}>Remove</button>}
                </div>

                <label>
                  PRODUCT CATEGORY <span>*</span>
                  <select
                    value={item.productCategory}
                    onChange={(event) => updateItem(item.id, 'productCategory', event.target.value)}
                    required
                  >
                    <option value="">Select category</option>
                    {productCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>

                <label>
                  PRODUCT NAME <span>*</span>
                  <input
                    type="text"
                    placeholder="e.g., Copper wire, classroom bench, projector, LED bulb"
                    value={item.name}
                    onChange={(event) => updateItem(item.id, 'name', event.target.value)}
                    required
                  />
                </label>

                <label>
                  QUANTITY <span>*</span>
                  <input
                    type="number"
                    min="1"
                    name={`quantity-${item.id}`}
                    autoComplete="off"
                    placeholder="e.g., 100"
                    value={item.quantity}
                    onChange={(event) => updateItem(item.id, 'quantity', event.target.value)}
                    required
                  />
                </label>

                <label>
                  UNIT
                  <select
                    value={item.unit}
                    onChange={(event) => updateItem(item.id, 'unit', event.target.value)}
                  >
                    <option value="pieces">pieces</option>
                    <option value="sets">sets</option>
                    <option value="meters">meters</option>
                    <option value="coils">coils</option>
                    <option value="packs">packs</option>
                    <option value="bags">bags</option>
                    <option value="kg">kg</option>
                    <option value="tons">tons</option>
                  </select>
                </label>

                <label className="wide-field">
                  Technical Specifications
                  <textarea
                    placeholder="e.g., IS 694 compliant, 2.5 sq.mm FR copper wire, 3300 lumens projector, 2-seater classroom desk"
                    value={item.technicalSpecifications}
                    onChange={(event) => updateItem(item.id, 'technicalSpecifications', event.target.value)}
                  />
                </label>

                <label className="wide-field">
                  Preferred Brands, if any
                  <input
                    type="text"
                    placeholder="e.g., Havells, Polycab, Godrej, Epson, BenQ"
                    value={item.preferredBrand}
                    onChange={(event) => updateItem(item.id, 'preferredBrand', event.target.value)}
                  />
                </label>
              </div>
            ))}
          </div>

          <button type="button" className="add-item-button" onClick={addItem}>＋ ADD PRODUCT</button>

          {relatedProductSuggestions(items).length > 0 && (
            <div className="smart-suggestion-card">
              <div>
                <p className="page-eyebrow">Smart Product Recommendation</p>
                <h3>Related items you may need</h3>
                <p>Suggestions are not added automatically. Add only what is relevant to your purchase request.</p>
              </div>
              <div className="suggestion-chip-grid">
                {relatedProductSuggestions(items).map((suggestion) => (
                  <button type="button" key={suggestion.name} onClick={() => addSuggestedItem(suggestion)}>
                    <strong>{suggestion.name}</strong>
                    <span>{suggestion.reason}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="requirements-card project-card terms-card">
          <div className="section-title">
            <span className="section-icon blue">🧾</span>
            <h2>Terms, Compliance and Notes</h2>
          </div>

          <div className="project-grid">
            <label>
              Warranty Requirement
              <input
                type="text"
                placeholder="e.g., Minimum 1 year OEM warranty"
                value={projectDetails.warrantyRequirement}
                onChange={(event) => updateProject('warrantyRequirement', event.target.value)}
              />
            </label>

            <label>
              Installation Requirement
              <select
                value={projectDetails.installationRequirement}
                onChange={(event) => updateProject('installationRequirement', event.target.value)}
              >
                <option value="Not required">Not required</option>
                <option value="Required">Required</option>
                <option value="Required with testing and handover">Required with testing and handover</option>
              </select>
            </label>

            <label>
              Maintenance / Service Requirement
              <input
                type="text"
                placeholder="e.g., 2 preventive maintenance visits per year"
                value={projectDetails.maintenanceRequirement}
                onChange={(event) => updateProject('maintenanceRequirement', event.target.value)}
              />
            </label>

            <label>
              Certification / Compliance Requirements
              <input
                type="text"
                placeholder="e.g., BIS, IS, IEC, RoHS, GST invoice, GeM compliant"
                value={projectDetails.complianceRequirements}
                onChange={(event) => updateProject('complianceRequirements', event.target.value)}
              />
            </label>

            <label className="wide-field">
              Commercial Terms
              <textarea
                placeholder="e.g., Delivery included, 30-day quote validity, payment after delivery and inspection"
                value={projectDetails.commercialTerms}
                onChange={(event) => updateProject('commercialTerms', event.target.value)}
              />
            </label>

            <label className="wide-field">
              Special Notes
              <textarea
                placeholder="Add site constraints, packaging needs, approval hierarchy, preferred delivery slots, or other instructions"
                value={projectDetails.specialNotes}
                onChange={(event) => updateProject('specialNotes', event.target.value)}
              />
            </label>
          </div>
        </section>

        <button type="submit" className="find-suppliers-button">Run AI Procurement Agents <span>›</span></button>
      </form>
    </main>
  )
}

export default RequirementsPage
