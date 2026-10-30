import { UpdatePasswordForm } from '@/features/auth/components'

export default function UpdatePasswordPage() {
  return (
    <div className="w-full max-w-xs sm:max-w-sm">
      <div className="titanium-bezel w-full">
        <div className="titanium-screen p-6 sm:p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Set new password</h1>
            <p className="mt-2 text-sm text-muted">Enter your new password below</p>
          </div>
          <UpdatePasswordForm />
        </div>
      </div>
    </div>
  )
}
