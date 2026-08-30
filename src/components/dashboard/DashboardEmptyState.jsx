import React from 'react'

export default function DashboardEmptyState({ Icon, title, description, tone = 'violet', centered = false }) {
  return (
    <div className={`dashboard-empty-state dashboard-empty-state-${tone}${centered ? ' dashboard-empty-state-centered' : ''}`}>
      <div className="dashboard-empty-state-mark" aria-hidden="true">
        <span className="dashboard-empty-state-orbit" />
        <Icon />
      </div>
      <div className="dashboard-empty-state-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
    </div>
  )
}
