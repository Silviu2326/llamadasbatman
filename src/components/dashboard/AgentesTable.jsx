import React from 'react'
import { useNavigate } from 'react-router-dom'
import { RiArrowRightLine } from 'react-icons/ri'
import { card, AGENT_BG } from './dashboardData'
import { useI18n } from '../../i18n'

export default function AgentesTable({ agents: agentsProp }) {
  const { locale } = useI18n()
  const navigate = useNavigate()
  const displayAgents = agentsProp
    ? agentsProp.map((a, i) => ({
        name: a.name,
        initials: a.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
        mtgs: a.calls,
        conv: null,
        bar: agentsProp[0]?.calls > 0 ? a.calls / agentsProp[0].calls : 0,
        bg: AGENT_BG[i % AGENT_BG.length],
      }))
    : null
  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', height:'100%' }}>
      <h3 style={{ margin:'0 0 14px', fontSize:15, fontWeight:700, color:'var(--text-strong)' }}>
        {locale === 'en' ? 'Top agents by performance' : 'Top agentes por rendimiento'}
      </h3>
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 56px minmax(60px,90px)', gap:8, paddingBottom:10, borderBottom:'1px solid var(--line)' }}>
        {[locale === 'en' ? 'Agent' : 'Agente', locale === 'en' ? 'Calls' : 'Llamadas', locale === 'en' ? 'Conversion' : 'Conversión'].map(h => (
          <span key={h} style={{ fontSize:10.5, color:'var(--dim)', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{h}</span>
        ))}
      </div>
      {!displayAgents || displayAgents.length === 0
        ? <p style={{ margin:'12px 0', fontSize:12, color: 'var(--dim)', textAlign:'center' }}>{locale === 'en' ? 'No call data by agent' : 'Sin datos de llamadas por agente'}</p>
        : displayAgents.map((a, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 56px minmax(60px,90px)', gap:8, alignItems:'center', padding:'10px 0', borderBottom: i<displayAgents.length-1 ? '1px solid var(--surface-2)' : 'none' }}>
            <div style={{ display:'flex', alignItems:'center', gap:9 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:a.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10.5, fontWeight:700, color:'white', flexShrink:0, boxShadow:`0 0 10px color-mix(in srgb, ${a.bg} 50%, transparent)` }}>
                {a.initials}
              </div>
              <span style={{ fontSize:12.5, color:'var(--text)', fontWeight:500, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.name}</span>
            </div>
            <span style={{ fontSize:13, color:'var(--text)', textAlign:'center', fontWeight:600 }}>{a.mtgs}</span>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <div style={{ flex:1, height:5, borderRadius:99, background:'var(--surface-hover)' }}>
                <div style={{ width:`${a.bar*100}%`, height:'100%', borderRadius:99,
                  background:'linear-gradient(90deg,var(--success),var(--success))',
                  boxShadow:'0 0 8px #10b98180' }} />
              </div>
              {a.conv != null && <span style={{ fontSize:11.5, color:'var(--success-soft)', width:34, flexShrink:0, fontWeight:600 }}>{a.conv}%</span>}
            </div>
          </div>
        ))
      }
      <div style={{ borderTop:'1px solid var(--line)', marginTop:'auto', paddingTop:10 }}>
        <button onClick={() => navigate('/agentes')} style={{ display:'flex', width:'100%', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', color:'var(--accent-soft)', cursor:'pointer', fontSize:12.5, fontWeight:600, padding:0, textShadow:'0 0 8px color-mix(in srgb, var(--accent-soft) 50%, transparent)' }}>
          <span>{locale === 'en' ? 'View all agents' : 'Ver todos los agentes'}</span>
          <RiArrowRightLine style={{ width:15, height:15 }} />
        </button>
      </div>
    </div>
  )
}
