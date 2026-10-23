import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { MapView } from '@/components/MapView'
import { HeaderBar } from '@/components/HeaderBar'
import { CamadasPanel } from '@/components/CamadasPanel'
import { FooterBar } from '@/components/FooterBar'
import { EspecieModal } from '@/components/EspecieModal'
import { EspeciesPage } from '@/pages/EspeciesPage'
import type { TipoGeometria } from '@/lib/api'

const CAMADAS_INICIAIS: Record<TipoGeometria, boolean> = {
  ponto: true,
  linha: true,
  poligono: true,
}

function HomeMapa() {
  const [camadasAtivas, setCamadasAtivas] = useState(CAMADAS_INICIAIS)
  const [especieAberta, setEspecieAberta] = useState<string | null>(null)

  const aoAlternar = (tipo: TipoGeometria) => {
    setCamadasAtivas((atual) => ({ ...atual, [tipo]: !atual[tipo] }))
  }

  return (
    <>
      <MapView
        camadasAtivas={camadasAtivas}
        onAbrirEspecie={setEspecieAberta}
        modalAberto={especieAberta !== null}
      />
      <CamadasPanel camadasAtivas={camadasAtivas} aoAlternar={aoAlternar} />
      {especieAberta && (
        <EspecieModal slug={especieAberta} onFechar={() => setEspecieAberta(null)} />
      )}
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <div className="relative h-screen w-full overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/inicio" replace />} />
          <Route path="/inicio" element={<HomeMapa />} />
          <Route path="/especies" element={<EspeciesPage />} />
        </Routes>
        <HeaderBar />
        <FooterBar />
      </div>
    </BrowserRouter>
  )
}

export default App
