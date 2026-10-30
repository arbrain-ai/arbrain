export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-dvh mission-shell overflow-hidden pt-[env(safe-area-inset-top)]">
      <div className="relative z-10 flex min-h-dvh items-center justify-center px-4">
        {children}
      </div>
    </div>
  )
}
