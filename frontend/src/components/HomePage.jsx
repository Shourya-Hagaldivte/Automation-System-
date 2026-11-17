import ProductScene3D from './ProductScene3D'
import './AgenticPages.css'

const userTypes = [
  'Construction companies',
  'Schools and colleges',
  'Hospitals',
  'Offices',
  'Parks and public facilities',
  'Government departments',
  'Facility management teams',
]

const capabilities = [
  ['Requirement intelligence', 'Understands bulk purchase needs, technical specifications, delivery constraints, budget, and compliance terms.'],
  ['Automated discovery', 'Finds supplier and tender options for every product line using source-linked catalog, marketplace, and procurement opportunity data.'],
  ['Quote comparison', 'Builds item-wise BOQ pricing, company-wise quote totals, technical scores, commercial scores, and recommendations.'],
]

function HomePage({ onStart }) {
  return (
    <main className="home-page agentic-page">
      <section className="home-hero agentic-hero-card">
        <div className="home-hero-copy">
          <p className="page-eyebrow">Agentic AI Procurement Automation</p>
          <h1>Automated supplier discovery, tender matching, quote comparison, and final approval.</h1>
          <p className="hero-lead">
            Our AI agents automatically analyze requirements, discover suppliers, match tenders, compare quotes, and recommend the best option. The final decision remains with the business user.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-action" onClick={onStart}>Create Purchase Requirement</button>
            <span className="automation-badge">AI-assisted supplier and tender matching</span>
          </div>
          <div className="user-type-grid">
            {userTypes.map((type) => <span key={type}>{type}</span>)}
          </div>
        </div>
        <ProductScene3D products={[{ imageType: 'wire', category: 'Electrical' }, { imageType: 'projector', category: 'AV' }, { imageType: 'furniture', category: 'Furniture' }, { imageType: 'bulb', category: 'Lighting' }]} />
      </section>

      <section className="capability-grid">
        {capabilities.map(([title, text], index) => (
          <article className="agentic-card capability-card" key={title}>
            <div className="card-index">0{index + 1}</div>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
    </main>
  )
}

export default HomePage
