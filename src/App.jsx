import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ExperienceProvider } from './contexts/ExperienceContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const Dashboard = lazy(() => import('./components/Dashboard'))
const Campaigns = lazy(() => import('./components/Campaigns'))
const Calls = lazy(() => import('./components/Calls'))
const Agentes = lazy(() => import('./components/Agentes'))
const Insights = lazy(() => import('./components/Insights'))
const BusinessProfilePage = lazy(() => import('./pages/BusinessProfilePage'))
const WebsiteIntakePage = lazy(() => import('./pages/WebsiteIntakePage'))
const Configuracion = lazy(() => import('./components/Configuracion'))
const AgentDetailPage = lazy(() => import('./pages/AgentDetailPage'))
const VoiceCabinPage = lazy(() => import('./pages/VoiceCabinPage'))
const LeadDetailPage = lazy(() => import('./pages/LeadDetailPage'))
const CampaignDetailPage = lazy(() => import('./pages/CampaignDetailPage'))
const CallDetailPage = lazy(() => import('./pages/CallDetailPage'))
const MeetingDetailPage = lazy(() => import('./pages/MeetingDetailPage'))
const AutomacionDetailPage = lazy(() => import('./pages/AutomacionDetailPage'))
const ArticleDetailPage = lazy(() => import('./pages/ArticleDetailPage'))
const PlaybookDetailPage = lazy(() => import('./pages/PlaybookDetailPage'))
const OpportunityDetailPage = lazy(() => import('./pages/OpportunityDetailPage'))
const GrowthPlanPage = lazy(() => import('./pages/GrowthPlanPage'))
const ProspectFinderPage = lazy(() => import('./pages/ProspectFinderPage'))
// Growth se fundió en dos páginas (2026-08): «Orgánico y social» (centro de
// mando orgánico + redes) y «Web y SEO» (landings + SEO). Las rutas viejas
// redirigen conservando la query para enlaces guardados, correos y microapps.
const OrganicSocialPage = lazy(() => import('./pages/organico/OrganicSocialPage'))
const WebSeoPage = lazy(() => import('./pages/web/WebSeoPage'))
// Y después las seis etapas del recorrido pasaron a vivir bajo una sola
// sección, /captacion: barra de etapas fija y cada etapa como ruta anidada.
const CaptacionPage = lazy(() => import('./pages/captacion/CaptacionPage'))
const CaptacionOverview = lazy(() => import('./pages/captacion/CaptacionOverview'))
const PublicSeoAuditPage = lazy(() => import('./pages/PublicSeoAuditPage'))
const PublicSeoReportPage = lazy(() => import('./pages/PublicSeoReportPage'))
const PublicBlogIndexPage = lazy(() => import('./pages/PublicBlogPage').then(module => ({ default: module.PublicBlogIndexPage })))
const PublicBlogPostPage = lazy(() => import('./pages/PublicBlogPage').then(module => ({ default: module.PublicBlogPostPage })))
const PublicLandingPage = lazy(() => import('./pages/PublicLandingPage'))
const PublicCampaignSharePage = lazy(() => import('./pages/PublicCampaignSharePage'))
const PublicContentApprovalPage = lazy(() => import('./pages/PublicContentApprovalPage'))
const PublicStudioReviewPage = lazy(() => import('./pages/PublicStudioReviewPage'))
const MetaAccountPage = lazy(() => import('./pages/MetaAccountPage'))
const EmailMarketingPage = lazy(() => import('./pages/EmailMarketingPage'))
const AdPlaybooksAdminPage = lazy(() => import('./pages/AdPlaybooksAdminPage'))
const AdsWizardPage = lazy(() => import('./pages/AdsWizardPage'))
const AdsPage = lazy(() => import('./pages/ads/AdsPage'))
const FunnelsPage = lazy(() => import('./pages/FunnelsPage'))
const GrowthHubPage = lazy(() => import('./pages/GrowthHubPage'))
import NotFoundPage from './pages/NotFoundPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import AdminRoute from './components/AdminRoute'
import PageLoadingState from './components/ui/PageLoadingState'
const GrowthOperationsPage = lazy(() => import('./pages/GrowthOperationsPage'))
const AssetsLibraryPage = lazy(() => import('./pages/AssetsLibraryPage'))
const MicroappsCatalogPage = lazy(() => import('./pages/MicroappsCatalogPage'))
const MicroappRunnerPage = lazy(() => import('./pages/MicroappRunnerPage'))
const WebsiteConnectionsPage = lazy(() => import('./pages/WebsiteConnectionsPage'))
const StudioPage = lazy(() => import('./pages/StudioPage'))
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'))
import SongStudioPage from './pages/SongStudioPage'
const AccountsPage = lazy(() => import('./pages/AccountsPage'))
const SalesHubPage = lazy(() => import('./pages/SalesHubPage'))
const SalesResourcesPage = lazy(() => import('./pages/SalesResourcesPage'))
const SalesCalendarPage = lazy(() => import('./pages/SalesCalendarPage'))
const SalesRecordDetailPage = lazy(() => import('./pages/SalesRecordDetailPage'))
const LearnCenterPage = lazy(() => import('./pages/LearnCenterPage'))
const MoreIntegrationsPage = lazy(() => import('./pages/MoreIntegrationsPage'))
const AdministrationCenterPage = lazy(() => import('./pages/AdministrationCenterPage'))
import AppErrorBoundary from './components/AppErrorBoundary'
import { I18nProvider } from './i18n'
import { LegacyDomTranslation } from './i18n/legacyDomTranslation'

/** Ruta antigua → página fundida, conservando query y hash y fijando la pestaña si no viene. */
function LegacyRedirect({ to, tab, paramKey = 'tab' }) {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  if (tab && !params.has(paramKey)) params.set(paramKey, tab)
  const search = params.toString()
  return <Navigate to={`${to}${search ? `?${search}` : ''}${location.hash}`} replace />
}

export default function App() {
  return (
    <AppErrorBoundary>
      <I18nProvider>
        <LegacyDomTranslation />
        <AuthProvider>
          <ExperienceProvider>
            <BrowserRouter>
            <Suspense fallback={<PageLoadingState label="Cargando página" />}>
            <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/canciones" element={<SongStudioPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/l/:slug" element={<PublicLandingPage />} />
          <Route path="/audita/:slug" element={<PublicSeoAuditPage />} />
          <Route path="/seo-informe/:token" element={<PublicSeoReportPage />} />
          <Route path="/l/:slug/blog" element={<PublicBlogIndexPage />} />
          <Route path="/l/:slug/blog/:articleSlug" element={<PublicBlogPostPage />} />
          <Route path="/campanas/compartir/:token" element={<PublicCampaignSharePage />} />
          {/* Sala de aprobación para clientes de agencias (roadmap.md fase 3):
              pública a propósito, la autorización es el token. */}
          <Route path="/aprobar/:token" element={<PublicContentApprovalPage />} />
          <Route path="/revisar/studio/:token" element={<PublicStudioReviewPage />} />
          <Route path="/privacidad" element={<PrivacyPage />} />
          <Route path="/terminos" element={<TermsPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/orquestador" element={<LegacyRedirect to="/operaciones-growth" />} />
            <Route path="/captacion" element={<CaptacionPage />}>
              <Route index element={<CaptacionOverview />} />
              <Route path="planificar" element={<Campaigns />} />
              <Route path="atraer" element={<Navigate to="/captacion/atraer/ads" replace />} />
              <Route path="atraer/ads" element={<AdsPage />} />
              <Route path="atraer/organico" element={<OrganicSocialPage />} />
              <Route path="atraer/prospectos" element={<ProspectFinderPage />} />
              <Route path="convertir" element={<WebSeoPage />} />
              <Route path="cerrar" element={<FunnelsPage />} />
            </Route>
            <Route path="/campanas" element={<LegacyRedirect to="/captacion/planificar" />} />
            <Route path="/ads" element={<LegacyRedirect to="/captacion/atraer/ads" />} />
            <Route path="/prospectos" element={<LegacyRedirect to="/captacion/atraer/prospectos" />} />
            <Route path="/organico" element={<LegacyRedirect to="/captacion/atraer/organico" />} />
            <Route path="/organic" element={<LegacyRedirect to="/captacion/atraer/organico" />} />
            <Route path="/redes-sociales" element={<LegacyRedirect to="/captacion/atraer/organico" tab="contenido" />} />
            <Route path="/web" element={<LegacyRedirect to="/captacion/convertir" />} />
            <Route path="/landings" element={<LegacyRedirect to="/captacion/convertir" tab="landings" />} />
            <Route path="/seo" element={<LegacyRedirect to="/captacion/convertir" tab="seo" />} />
            <Route path="/funnels" element={<LegacyRedirect to="/captacion/cerrar" />} />
            <Route path="/llamadas" element={<Calls />} />
            <Route path="/ventas" element={<SalesHubPage />} />
            <Route path="/ventas/:entity/:id" element={<SalesRecordDetailPage />} />
            <Route path="/leads" element={<Navigate to="/ventas?vista=leads" replace />} />
            <Route path="/cuentas" element={<Navigate to="/ventas?vista=accounts" replace />} />
            <Route path="/cuentas/:id" element={<AccountsPage />} />
            <Route path="/agentes" element={<Agentes />} />
            <Route path="/pipeline" element={<Navigate to="/ventas?vista=pipeline" replace />} />
            <Route path="/calendario" element={<SalesCalendarPage />} />
            <Route path="/reuniones" element={<Navigate to="/calendario" replace />} />
            <Route path="/playbooks" element={<LegacyRedirect to="/recursos-ia" tab="playbooks" />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/automatizaciones" element={<LegacyRedirect to="/operaciones-growth" tab="automatizaciones" />} />
            <Route path="/knowledge-base" element={<LegacyRedirect to="/recursos-ia" />} />
            <Route path="/recursos-ia" element={<SalesResourcesPage />} />
            <Route path="/trabajos" element={<LegacyRedirect to="/operaciones-growth" tab="trabajos" />} />
            <Route path="/operaciones-growth" element={<GrowthOperationsPage />} />
            <Route path="/activos" element={<AssetsLibraryPage />} />
            <Route path="/microapps" element={<MicroappsCatalogPage />} />
            <Route path="/microapps/:id" element={<MicroappRunnerPage />} />
            <Route path="/conexiones/web" element={<WebsiteConnectionsPage />} />
            <Route path="/integraciones" element={<MoreIntegrationsPage />} />
            <Route path="/conexiones" element={<LegacyRedirect to="/integraciones" />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route path="/studio/:id" element={<StudioPage />} />
            <Route path="/marketplace" element={<LegacyRedirect to="/integraciones" tab="extensiones" />} />
            <Route path="/marketplace/:id" element={<MarketplacePage />} />
            <Route path="/capacidades" element={<LegacyRedirect to="/microapps" />} />
            <Route path="/aprender" element={<LearnCenterPage />} />
            <Route path="/tutoriales" element={<LegacyRedirect to="/aprender" />} />
            <Route path="/documentacion" element={<LegacyRedirect to="/aprender" tab="documentacion" />} />
            <Route path="/informacion-empresa" element={<BusinessProfilePage />} />
            <Route path="/rellenar-desde-web" element={<WebsiteIntakePage />} />
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
            <Route path="/voz/cabina" element={<VoiceCabinPage />} />
            <Route path="/plan" element={<GrowthPlanPage />} />
            <Route path="/captacion/conectar" element={<MetaAccountPage />} />
            <Route path="/email-marketing" element={<EmailMarketingPage />} />
            <Route path="/captacion/nueva" element={<AdsWizardPage />} />
            <Route path="/conversacion/inbox" element={<Navigate to="/llamadas" replace />} />
            <Route path="/growth" element={<GrowthHubPage />} />
            <Route path="/inteligencia-comercial" element={<LegacyRedirect to="/ventas" tab="inteligencia" paramKey="vista" />} />
            <Route path="/administracion" element={<AdministrationCenterPage />} />
            <Route path="/gobierno-empresarial" element={<LegacyRedirect to="/administracion" tab="gobierno" />} />
            <Route path="/access-control" element={<LegacyRedirect to="/administracion" tab="accesos" />} />
            <Route path="/agencia/clientes" element={<LegacyRedirect to="/administracion" tab="clientes" />} />
            <Route path="/desarrolladores" element={<LegacyRedirect to="/integraciones" tab="api" />} />
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
