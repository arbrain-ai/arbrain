import Link from 'next/link'
import { ForgotPasswordForm } from '@/features/auth/components'

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-xs sm:max-w-sm">
      <div className="titanium-bezel w-full">
        <div className="titanium-screen p-6 sm:p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Reset password</h1>
            <p className="mt-2 text-sm text-muted">Enter your email to receive a reset link</p>
          </div>
          <ForgotPasswordForm />
        </div>
      </div>

      <p className="text-center text-sm text-muted/80 mt-6">
        <Link href="/login" className="text-foreground/70 hover:text-foreground transition-colors duration-200">
          Back to login
        </Link>
      </p>
    </div>
  )
}
