import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import Campaigns from './components/Campaigns'
import Calls from './components/Calls'
import Leads from './components/Leads'
import Agentes from './components/Agentes'
import Pipeline from './components/Pipeline'
import Reuniones from './components/Reuniones'
import Playbooks from './components/Playbooks'
import Insights from './components/Insights'
import Automatizaciones from './components/Automatizaciones'
import KnowledgeBase from './components/KnowledgeBase'
import Configuracion from './components/Configuracion'

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', height: '100vh', background: '#080c14', overflow: 'hidden' }}>
        <Sidebar />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/campanas" element={<Campaigns />} />
          <Route path="/llamadas" element={<Calls />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/agentes" element={<Agentes />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/reuniones" element={<Reuniones />} />
          <Route path="/playbooks" element={<Playbooks />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/automatizaciones" element={<Automatizaciones />} />
          <Route path="/knowledge-base" element={<KnowledgeBase />} />
          <Route path="/configuracion" element={<Configuracion />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
