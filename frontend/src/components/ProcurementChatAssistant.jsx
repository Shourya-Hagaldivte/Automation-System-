import { useState } from 'react'
import { answerProcurementQuestion } from './enterpriseFeatures'
import './AgenticPages.css'

function ProcurementChatAssistant({ context }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Ask about cheapest supplier, recommendation reason, supplier risk, budget, email status, or order tracking.' },
  ])

  const ask = (event) => {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) return
    const answer = answerProcurementQuestion(trimmed, context)
    setMessages((current) => [...current, { role: 'user', text: trimmed }, { role: 'assistant', text: answer }])
    setQuestion('')
  }

  return (
    <aside className={`procurement-chat ${open ? 'is-open' : ''}`}>
      <button type="button" className="procurement-chat-toggle" onClick={() => setOpen((value) => !value)}>
        {open ? 'Close Assistant' : 'Procurement Assistant'}
      </button>
      {open && (
        <div className="procurement-chat-panel">
          <div className="procurement-chat-header">
            <strong>Procurement Assistant</strong>
            <span>Uses current request data only</span>
          </div>
          <div className="procurement-chat-messages">
            {messages.map((message, index) => (
              <div className={`chat-message chat-message--${message.role}`} key={`${message.role}-${index}`}>{message.text}</div>
            ))}
          </div>
          <form onSubmit={ask} className="procurement-chat-form">
            <input
              type="text"
              placeholder="e.g., Which supplier is cheapest?"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <button type="submit">Ask</button>
          </form>
        </div>
      )}
    </aside>
  )
}

export default ProcurementChatAssistant
