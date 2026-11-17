import { requirementMissingInfo } from './procurementDisplay'
import './AgenticPages.css'

const agentBlueprint = [
  {
    name: 'Requirement Understanding Agent',
    input: 'Organization type, products, budget, delivery location, technical and commercial terms',
    processing: 'Normalizes bulk purchase requirements and flags missing fields.',
    output: 'Structured procurement brief and BOQ inputs',
  },
  {
    name: 'Product Identification Agent',
    input: 'Product names, categories, specifications, preferred brands, quantity and unit',
    processing: 'Maps each requested line item to product categories, aliases, specifications and compatible SKUs.',
    output: 'Item-wise product identity and matching keywords',
  },
  {
    name: 'Supplier Discovery Agent',
    input: 'Product identities, buyer sector, location and compliance requirements',
    processing: 'Searches verified supplier catalogs, OEM pages, B2B marketplaces and procurement opportunity sources.',
    output: 'Supplier options for every product line',
  },
  {
    name: 'Tender Search Agent',
    input: 'Supplier options, procurement portals, product categories and buyer constraints',
    processing: 'Creates tender/source links and groups products into complete quote options.',
    output: 'Multiple tender or supplier-source opportunities',
  },
  {
    name: 'Market Price Analysis Agent',
    input: 'Matched products, source links, quantity, unit and pack-size rules',
    processing: 'Calculates unit rates, converted rates, line totals, freight, testing, insurance and GST.',
    output: 'Market price sheet and company-wise quote totals',
  },
  {
    name: 'Technical Evaluation Agent',
    input: 'Required specifications, matched product specifications, warranty, installation and compliance terms',
    processing: 'Calculates technical fit based on product match, specification match, warranty and compliance coverage.',
    output: 'Technical score and deviations',
  },
  {
    name: 'Commercial Evaluation Agent',
    input: 'Budget, price competitiveness, delivery terms, commercial terms and GST-inclusive totals',
    processing: 'Calculates commercial score separately from technical score.',
    output: 'Commercial score and cost-risk summary',
  },
  {
    name: 'Risk and Compliance Agent',
    input: 'Supplier source, product category, certification requirements and missing information',
    processing: 'Checks compliance notes, source quality, delivery risk and final approval needs.',
    output: 'Risk tags and approval checklist',
  },
  {
    name: 'Quote Comparison Agent',
    input: 'All supplier/tender quotes and score breakdowns',
    processing: 'Ranks tenders by product coverage, price competitiveness, supplier reliability and timeline fit.',
    output: 'Comparable tender scorecard',
  },
  {
    name: 'Recommendation Agent',
    input: 'Quote comparison, risk summary and buyer constraints',
    processing: 'Recommends the best option and explains why it is preferred.',
    output: 'Recommended supplier/tender',
  },
  {
    name: 'Final Approval Agent',
    input: 'Recommended tender, RFP document and business approval workflow',
    processing: 'Presents the final decision to the business user for approval.',
    output: 'Approved, revise, or reject decision',
  },
]

function agentStatus(index, hasTenderAnalysis, hasSelectedTender) {
  if (index <= 1) return 'Completed'
  if (!hasTenderAnalysis && index <= 4) return index === 2 ? 'Ready to run' : 'Queued'
  if (hasTenderAnalysis && index <= 8) return 'Completed'
  if (hasSelectedTender && index <= 10) return index === 10 ? 'Awaiting approval' : 'Completed'
  return 'Queued'
}

function confidenceFor(index, hasTenderAnalysis, hasSelectedTender, missingCount) {
  const base = [94, 90, 88, 86, 87, 84, 83, 82, 86, 85, 80][index] || 80
  const missingPenalty = Math.min(12, missingCount * 2)
  const progressBoost = hasSelectedTender ? 4 : hasTenderAnalysis ? 2 : 0
  return Math.max(62, Math.min(98, base + progressBoost - missingPenalty))
}

function AgentWorkflowPage({ requirementsData, tenderAnalysis, selectedTender, onRunMatching, onContinue }) {
  const missing = requirementMissingInfo(requirementsData || {})
  const hasTenderAnalysis = Boolean(tenderAnalysis?.tenders?.length)
  const hasSelectedTender = Boolean(selectedTender)

  return (
    <main className="agentic-page workflow-page">
      <section className="agentic-hero-card compact-hero">
        <div>
          <p className="page-eyebrow">Agentic Procurement Workflow</p>
          <h1>AI-assisted supplier and tender matching</h1>
          <p className="hero-lead">The system is not a static tender display. Each agent receives inputs, performs a defined task, produces output, and passes structured data to the next procurement step.</p>
        </div>
        <div className="workflow-summary-card">
          <strong>{agentBlueprint.length}</strong>
          <span>AI agents</span>
          <strong>{requirementsData?.items?.length || 0}</strong>
          <span>requested products</span>
        </div>
      </section>

      {missing.length > 0 && (
        <section className="agentic-card info-note-card">
          <h2>Missing information detected</h2>
          <p>The AI will still run, but accuracy improves if you add: {missing.slice(0, 6).join(', ')}{missing.length > 6 ? '...' : ''}.</p>
        </section>
      )}

      <section className="agent-grid">
        {agentBlueprint.map((agent, index) => {
          const status = agentStatus(index, hasTenderAnalysis, hasSelectedTender)
          const confidence = confidenceFor(index, hasTenderAnalysis, hasSelectedTender, missing.length)
          return (
            <article className="agentic-card agent-card" key={agent.name}>
              <div className="agent-card-top">
                <span className={`status-pill status-${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>
                <span className="confidence-pill">{confidence}% confidence</span>
              </div>
              <h2>{agent.name}</h2>
              <dl>
                <dt>Input</dt>
                <dd>{agent.input}</dd>
                <dt>Processing</dt>
                <dd>{agent.processing}</dd>
                <dt>Output</dt>
                <dd>{agent.output}</dd>
                <dt>Missing info</dt>
                <dd>{missing.length ? missing.slice(0, 3).join(', ') : 'No critical missing information'}</dd>
              </dl>
            </article>
          )
        })}
      </section>

      <section className="agentic-card action-panel-3d">
        <div>
          <h2>{hasTenderAnalysis ? 'Tender analysis is ready' : 'Run automated tender matching'}</h2>
          <p>Our AI agents automatically analyze requirements, discover suppliers, match tenders, compare quotes, and recommend the best option. The final decision remains with the business user.</p>
        </div>
        {hasTenderAnalysis ? (
          <button type="button" className="primary-action" onClick={onContinue}>View Tender Results</button>
        ) : (
          <button type="button" className="primary-action" onClick={onRunMatching}>Start Tender Discovery</button>
        )}
      </section>
    </main>
  )
}

export default AgentWorkflowPage
