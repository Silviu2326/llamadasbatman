import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ExperienceProvider } from './contexts/ExperienceContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
const Dashboard = lazy(() => import('./components/Dashboard'))
const Campaigns = lazy(() => import('./components/Campaigns'))
const Calls = lazy(() => import('./components/Calls'))
const Leads = lazy(() => import('./components/Leads'))
const Agentes = lazy(() => import('./components/Agentes'))
const Pipeline = lazy(() => import('./components/Pipeline'))
const Reuniones = lazy(() => import('./components/Reuniones'))
const Playbooks = lazy(() => import('./components/Playbooks'))
const Insights = lazy(() => import('./components/Insights'))
const Automatizaciones = lazy(() => import('./components/Automatizaciones'))
const KnowledgeBase = lazy(() => import('./components/KnowledgeBase'))
const Configuracion = lazy(() => import('./components/Configuracion'))
const AgentDetailPage = lazy(() => import('./pages/AgentDetailPage'))
const LeadDetailPage = lazy(() => import('./pages/LeadDetailPage'))
const CampaignDetailPage = lazy(() => import('./pages/CampaignDetailPage'))
const CallDetailPage = lazy(() => import('./pages/CallDetailPage'))
const MeetingDetailPage = lazy(() => import('./pages/MeetingDetailPage'))
const AutomacionDetailPage = lazy(() => import('./pages/AutomacionDetailPage'))
const ArticleDetailPage = lazy(() => import('./pages/ArticleDetailPage'))
const PlaybookDetailPage = lazy(() => import('./pages/PlaybookDetailPage'))
const OpportunityDetailPage = lazy(() => import('./pages/OpportunityDetailPage'))
const VoiceTestPage = lazy(() => import('./pages/VoiceTestPage'))
const ProspectFinderPage = lazy(() => import('./pages/ProspectFinderPage'))
const PublicLandingPage = lazy(() => import('./pages/PublicLandingPage'))
const PublicCampaignSharePage = lazy(() => import('./pages/PublicCampaignSharePage'))
const LandingsPage = lazy(() => import('./pages/LandingsPage'))
const MetaAccountPage = lazy(() => import('./pages/MetaAccountPage'))
const ConectarRedesPage = lazy(() => import('./pages/ConectarRedesPage'))
const EmailMarketingPage = lazy(() => import('./pages/EmailMarketingPage'))
const AdPlaybooksAdminPage = lazy(() => import('./pages/AdPlaybooksAdminPage'))
const AdsWizardPage = lazy(() => import('./pages/AdsWizardPage'))
const AdsPage = lazy(() => import('./pages/AdsPage'))
const FunnelsPage = lazy(() => import('./pages/FunnelsPage'))
const ConversationsInboxPage = lazy(() => import('./pages/ConversationsInboxPage'))
const GrowthHubPage = lazy(() => import('./pages/GrowthHubPage'))
const RevenueIntelligencePage = lazy(() => import('./pages/RevenueIntelligencePage'))
const EnterpriseGovernancePage = lazy(() => import('./pages/EnterpriseGovernancePage'))
const AccessControlPage = lazy(() => import('./pages/AccessControlPage'))
import NotFoundPage from './pages/NotFoundPage'
const OrganicLeadsPage = lazy(() => import('./lib/organicPage').then(module => ({ default: module.OrganicLeadsPage })))
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import AdminRoute from './components/AdminRoute'
const OrchestrationPage = lazy(() => import('./pages/OrchestrationPage'))
import AppErrorBoundary from './components/AppErrorBoundary'
import { I18nProvider } from './i18n'
import { LegacyDomTranslation } from './i18n/legacyDomTranslation'

export default function App() {
  return (
    <AppErrorBoundary>
      <I18nProvider>
        <LegacyDomTranslation />
        <AuthProvider>
          <ExperienceProvider>
            <BrowserRouter>
            <Suspense fallback={<div className="app-route-loading" role="status">Cargando…</div>}>
            <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/l/:slug" element={<PublicLandingPage />} />
          <Route path="/campanas/compartir/:token" element={<PublicCampaignSharePage />} />
          <Route path="/privacidad" element={<PrivacyPage />} />
          <Route path="/terminos" element={<TermsPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/orquestador" element={<OrchestrationPage />} />
            <Route path="/campanas" element={<Campaigns />} />
            <Route path="/landings" element={<LandingsPage />} />
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
            <Route path="/organic" element={OrganicLeadsPage ? <OrganicLeadsPage /> : <NotFoundPage />} />
            <Route path="/captacion/conectar" element={<MetaAccountPage />} />
            <Route path="/redes-sociales" element={<ConectarRedesPage />} />
            <Route path="/email-marketing" element={<EmailMarketingPage />} />
            <Route path="/captacion/nueva" element={<AdsWizardPage />} />
            <Route path="/ads" element={<AdsPage />} />
            <Route path="/funnels" element={<FunnelsPage />} />
            <Route path="/conversacion/inbox" element={<ConversationsInboxPage />} />
            <Route path="/growth" element={<GrowthHubPage />} />
            <Route path="/inteligencia-comercial" element={<RevenueIntelligencePage />} />
            <Route path="/gobierno-empresarial" element={<AdminRoute permission="governance.read"><EnterpriseGovernancePage /></AdminRoute>} />
            <Route path="/access-control" element={<AdminRoute permission="access_control.read"><AccessControlPage /></AdminRoute>} />
            <Route path="/admin/ad-playbooks" element={<AdminRoute><AdPlaybooksAdminPage /></AdminRoute>} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </Suspense>
            </BrowserRouter>
          </ExperienceProvider>
        </AuthProvider>
      </I18nProvider>
    </AppErrorBoundary>
  )
}
