'use client'

import { useState } from 'react'
import { signup } from '@/actions/auth'

export function SignupForm() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)

    const result = await signup(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
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

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-muted tracking-wide pl-1">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            placeholder="Min. 6 characters"
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
        {loading ? 'Creating account...' : 'Create Account'}
      </button>
    </form>
  )
}
