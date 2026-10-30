'use client'

import { useState } from 'react'
import { resetPassword } from '@/actions/auth'

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)

    const result = await resetPassword(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="bg-success/10 border border-success/20 rounded-xl px-6 py-5 text-center">
        <p className="text-sm text-success">Check your email for a reset link.</p>
      </div>
    )
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-muted tracking-wide pl-1">
          Email
        </label>
        <div className="relative">
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@company.com"
            className="input-field px-5 py-3.5 text-sm placeholder:text-muted/70"
          />
        </div>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/20 rounded-xl px-4 py-3">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full px-8 py-3.5 text-sm tracking-wide disabled:opacity-40 disabled:pointer-events-none"
      >
        {loading ? 'Sending...' : 'Send Reset Link'}
      </button>
    </form>
  )
}
