import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
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
import AgentDetailPage from './pages/AgentDetailPage'
import LeadDetailPage from './pages/LeadDetailPage'
import CampaignDetailPage from './pages/CampaignDetailPage'
import CallDetailPage from './pages/CallDetailPage'
import MeetingDetailPage from './pages/MeetingDetailPage'
import AutomacionDetailPage from './pages/AutomacionDetailPage'
import ArticleDetailPage from './pages/ArticleDetailPage'
import PlaybookDetailPage from './pages/PlaybookDetailPage'
import OpportunityDetailPage from './pages/OpportunityDetailPage'
import VoiceTestPage from './pages/VoiceTestPage'
import ProspectFinderPage from './pages/ProspectFinderPage'
import PublicLandingPage from './pages/PublicLandingPage'
import MetaAccountPage from './pages/MetaAccountPage'
import ConectarRedesPage from './pages/ConectarRedesPage'
import EmailMarketingPage from './pages/EmailMarketingPage'
import AdPlaybooksAdminPage from './pages/AdPlaybooksAdminPage'
import AdsWizardPage from './pages/AdsWizardPage'
import AdminRoute from './components/AdminRoute'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/l/:slug" element={<PublicLandingPage />} />
          <Route element={<ProtectedRoute />}>
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
            <Route path="/agentes/:id" element={<AgentDetailPage />} />
            <Route path="/leads/:id" element={<LeadDetailPage />} />
            <Route path="/campanas/:id" element={<CampaignDetailPage />} />
            <Route path="/llamadas/:id" element={<CallDetailPage />} />
            <Route path="/reuniones/:id" element={<MeetingDetailPage />} />
            <Route path="/automatizaciones/:id" element={<AutomacionDetailPage />} />
            <Route path="/knowledge-base/articulos/:id" element={<ArticleDetailPage />} />
            <Route path="/playbooks/:id" element={<PlaybookDetailPage />} />
            <Route path="/pipeline/:id" element={<OpportunityDetailPage />} />
            <Route path="/voz/test" element={<VoiceTestPage />} />
            <Route path="/prospectos" element={<ProspectFinderPage />} />
            <Route path="/captacion/conectar" element={<MetaAccountPage />} />
            <Route path="/redes-sociales" element={<ConectarRedesPage />} />
            <Route path="/email-marketing" element={<EmailMarketingPage />} />
            <Route path="/captacion/nueva" element={<AdsWizardPage />} />
            <Route path="/admin/ad-playbooks" element={<AdminRoute><AdPlaybooksAdminPage /></AdminRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
