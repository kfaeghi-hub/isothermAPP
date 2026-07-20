// Dashboard — the app's home (§6B internal half). Widgets land in the next build
// step; this placeholder exists so the router can make / the home route first.

export function DashboardPage() {
  return (
    <div className="p-8">
      <div className="max-w-2xl rounded-lg border-2 border-dashed border-gray-200 bg-white p-12 text-center">
        <p className="text-3xl mb-4">📊</p>
        <h3 className="text-base font-semibold text-gray-700 mb-2">Dashboard</h3>
        <p className="text-sm text-gray-400">
          The firm dashboard is being built — widgets arrive in the next step of this build.
        </p>
      </div>
    </div>
  )
}
