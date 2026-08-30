import { Navigate, useParams } from 'react-router-dom'
import LeadDetailPage from './LeadDetailPage'
import AccountsPage from './AccountsPage'
import OpportunityDetailPage from './OpportunityDetailPage'

export default function SalesRecordDetailPage() {
  const { entity } = useParams()
  if (entity === 'lead') return <LeadDetailPage />
  if (entity === 'account') return <AccountsPage />
  if (entity === 'opportunity') return <OpportunityDetailPage />
  return <Navigate to="/ventas" replace />
}
