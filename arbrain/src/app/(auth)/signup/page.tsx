import Link from 'next/link'
import { SignupForm } from '@/features/auth/components'

export default function SignupPage() {
  return (
    <div className="w-full max-w-xs sm:max-w-sm">
      <div className="titanium-bezel w-full">
        <div className="titanium-screen p-6 sm:p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Create account</h1>
            <p className="mt-2 text-sm text-muted">Get started for free</p>
          </div>
          <SignupForm />
        </div>
      </div>

      <p className="text-center text-sm text-muted/80 mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-foreground/70 hover:text-foreground transition-colors duration-200">
          Sign in
        </Link>
      </p>
    </div>
  )
}
