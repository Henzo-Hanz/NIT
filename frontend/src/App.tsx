import { MapView } from '@/components/MapView'
import { HeaderBar } from '@/components/HeaderBar'
import { CamadasPanel } from '@/components/CamadasPanel'
import { FooterBar } from '@/components/FooterBar'

function App() {
  return (
    <div className="relative h-screen w-full overflow-hidden">
      <MapView />
      <HeaderBar />
      <CamadasPanel />
      <FooterBar />
    </div>
  )
}

export default App
