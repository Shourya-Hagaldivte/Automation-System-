import { useState } from 'react'
import './LoginPage.css'

function LoginPage({ onLogin }) {
  const [formData, setFormData] = useState({ email: '', password: '' })

  const handleSubmit = (event) => {
    event.preventDefault()
    onLogin(formData)
  }

  return (
    <main className="login-page">
      <section className="login-container">
        <header className="login-header">
          <div className="login-check">✓</div>
          <div>
            <h1>RFP Agent Login</h1>
            <p>Sign in to enter procurement requirements and find matching company tenders</p>
          </div>
        </header>

        <section className="login-card" aria-label="Login form">
          <div className="login-card-title">
            <span className="login-icon">🔐</span>
            <div>
              <h2>Login</h2>
              <p>Enter your account details to continue</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <label>
              Email address <span>*</span>
              <input
                type="email"
                placeholder="you@company.com"
                value={formData.email}
                onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                required
              />
            </label>

            <label>
              Password <span>*</span>
              <input
                type="password"
                placeholder="Enter password"
                value={formData.password}
                onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                required
              />
            </label>

            <button type="submit" className="login-button">Login <span>›</span></button>
          </form>
        </section>
      </section>
    </main>
  )
}

export default LoginPage
