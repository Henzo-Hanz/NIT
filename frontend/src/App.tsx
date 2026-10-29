import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router'
import { MapView } from '@/components/MapView'
import { HeaderBar } from '@/components/HeaderBar'
import { FooterBar } from '@/components/FooterBar'
import { EspecieModal } from '@/components/EspecieModal'
import { EspeciesPage } from '@/pages/EspeciesPage'

function HomeMapa() {
  const [especieAberta, setEspecieAberta] = useState<string | null>(null)
  const [pedidoLista, setPedidoLista] = useState(0)
  const navegar = useNavigate()

  const voltarParaLista = () => {
    setEspecieAberta(null)
    setPedidoLista((atual) => atual + 1)
  }

  return (
    <>
      <MapView
        onAbrirEspecie={setEspecieAberta}
        modalAberto={especieAberta !== null}
        abrirListagemEm={pedidoLista}
        onPesquisar={() => navegar('/especies')}
      />
      {especieAberta && (
        <EspecieModal
          slug={especieAberta}
          onFechar={() => setEspecieAberta(null)}
          onVoltarLista={voltarParaLista}
        />
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
