export {}
// Website audits and explicitly requested Git proposals only.
process.env.BACKGROUND_WORKERS_ENABLED = 'false'
async function main() {
  const { startWebsiteSeoMonitor } = await import('./jobs/websiteSeoMonitor')
  const { dispatchPendingJobs } = await import('./jobs/jobDispatcher')
  const { WEBSITE_AUDIT_KIND } = await import('./services/websiteSeo.service')
  const { registerGitProposalExecutor, GIT_PROPOSAL_JOB_KIND } = await import('./services/gitConnector.service')
  registerGitProposalExecutor()
  await startWebsiteSeoMonitor()
  const tick = () => void dispatchPendingJobs([WEBSITE_AUDIT_KIND, GIT_PROPOSAL_JOB_KIND])
  const timer = setInterval(tick, 5000)
  tick()
  const stop = () => { clearInterval(timer); process.exitCode = 0 }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  console.log('[WebsiteSeo] dedicated website audit and proposal worker started')
}
main().catch(error => { console.error('[WebsiteSeo] startup failed', error instanceof Error ? error.message : 'UNKNOWN'); process.exitCode = 1 })
