process.env.BACKGROUND_WORKERS_ENABLED = 'true'

Promise.all([
  import('./jobs/automationRunner'),
  import('./jobs/leadCallDispatch'),
  import('./jobs/adReviewPoll'),
  import('./jobs/adInsightsSync'),
  import('./jobs/outboxDispatcher'),
  import('./jobs/temporalEventScheduler'),
  import('./jobs/importJobRunner'),
])
  .then(() => console.log('[Vozia] Workers iniciados'))
  .catch((error) => {
    console.error('[Vozia] No se pudieron iniciar los workers:', error)
    process.exitCode = 1
  })
