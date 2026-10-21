import Link from 'next/link'

export default function CheckEmailPage() {
  return (
    <div className="w-full max-w-xs sm:max-w-sm">
      <div className="titanium-bezel w-full">
        <div className="titanium-screen p-6 sm:p-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Check your email</h1>
          <p className="mt-4 text-sm text-muted leading-relaxed">
            We&apos;ve sent you a confirmation link. Please check your email to complete your registration.
          </p>
          <Link
            href="/login"
            className="inline-block mt-6 text-sm text-muted hover:text-foreground/75 transition-colors duration-200"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
