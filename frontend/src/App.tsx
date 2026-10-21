import { SeloStatus } from '@/components/SeloStatus'

function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">NIT</h1>
      <p className="text-xl">
        Backend: <SeloStatus />
      </p>
    </main>
  )
}

export default App
