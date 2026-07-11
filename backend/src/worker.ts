// Proceso separado para los workers de BullMQ — correr con `npm run worker`.
// Cada job se auto-arranca al importarse (ver el try/catch de cada archivo).
import './jobs/automationRunner'
import './jobs/leadCallDispatch'
import './jobs/adReviewPoll'
import './jobs/adInsightsSync'

console.log('[Vozia] Workers iniciados (automation-runner, lead-call-dispatch, ad-review-poll, ad-insights-sync)')
