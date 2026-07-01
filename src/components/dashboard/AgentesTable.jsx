import React from 'react'
import { useNavigate } from 'react-router-dom'
import { RiArrowRightLine } from 'react-icons/ri'
import { card, AGENT_BG } from './dashboardData'

export default function AgentesTable({ agents: agentsProp }) {
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
      <h3 style={{ margin:'0 0 14px', fontSize:15, fontWeight:700, color:'#ffffff', textShadow:'0 0 20px rgba(255,255,255,0.15)' }}>
        Top agentes por rendimiento
      </h3>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 64px 100px', gap:8, paddingBottom:10, borderBottom:'1px solid #1a2235' }}>
        {['Agente','Llamadas','Conversión'].map(h => (
          <span key={h} style={{ fontSize:10.5, color:'#6b7280', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{h}</span>
        ))}
      </div>
      {!displayAgents || displayAgents.length === 0
        ? <p style={{ margin:'12px 0', fontSize:12, color:'#4b5563', textAlign:'center' }}>Sin datos de llamadas por agente</p>
        : displayAgents.map((a, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 64px 100px', gap:8, alignItems:'center', padding:'10px 0', borderBottom: i<displayAgents.length-1 ? '1px solid #111827' : 'none' }}>
            <div style={{ display:'flex', alignItems:'center', gap:9 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:a.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10.5, fontWeight:700, color:'white', flexShrink:0, boxShadow:`0 0 10px ${a.bg}80` }}>
                {a.initials}
              </div>
              <span style={{ fontSize:12.5, color:'#ffffff', fontWeight:500 }}>{a.name}</span>
            </div>
            <span style={{ fontSize:13, color:'#e2e8f0', textAlign:'center', fontWeight:600 }}>{a.mtgs}</span>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <div style={{ flex:1, height:5, borderRadius:99, background:'#1a2235' }}>
                <div style={{ width:`${a.bar*100}%`, height:'100%', borderRadius:99,
                  background:'linear-gradient(90deg,#10b981,#34d399)',
                  boxShadow:'0 0 8px #10b98180' }} />
              </div>
              {a.conv != null && <span style={{ fontSize:11.5, color:'#4ade80', width:34, flexShrink:0, fontWeight:600 }}>{a.conv}%</span>}
            </div>
          </div>
        ))
      }
      <div style={{ borderTop:'1px solid #1a2235', marginTop:'auto', paddingTop:10 }}>
        <button onClick={() => navigate('/agentes')} style={{ display:'flex', width:'100%', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', color:'#818cf8', cursor:'pointer', fontSize:12.5, fontWeight:600, padding:0, textShadow:'0 0 8px #818cf880' }}>
          <span>Ver todos los agentes</span>
          <RiArrowRightLine style={{ width:15, height:15 }} />
        </button>
      </div>
    </div>
  )
}
