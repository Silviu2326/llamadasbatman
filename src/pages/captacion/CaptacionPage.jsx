import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import CaptureStages from './CaptureStages'
import PageLoadingState from '../../components/ui/PageLoadingState'
import { useI18n } from '../../i18n'
import './captacion.css'

/**
 * Captación — una sola sección para todo el recorrido de captación.
 *
 * Antes eran seis pantallas hermanas (Campañas, Ads, Orgánico y social,
 * Prospectos, Web y SEO, Funnels) unidas solo por una barra que cada una
 * pintaba debajo de su cabecera. Ahora la barra es la navegación de la
 * sección y va fija arriba; cada etapa es una ruta anidada que carga su módulo
 * de forma perezosa y hace su propio scroll. Para quien lo usa es una página
 * con cuatro etapas; para el código siguen siendo módulos independientes con
 * su URL, sus permisos y su chunk.
 *
 * `/captacion` a secas es la portada: el estado de las cuatro etapas de un
 * vistazo y la siguiente acción de cada una.
 */
export default function CaptacionPage() {
  const { t } = useI18n()
  return (
    <div className="captacion-shell">
      <CaptureStages />
      <div className="captacion-stage-view">
        {/* Suspense propio: el del router desmontaría la barra mientras carga
            el chunk de la etapa, y la sección parpadearía entera. */}
        <Suspense fallback={<PageLoadingState inline label={t('captacion.loadingStage')} />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}
