import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import WaveSurfer from 'wavesurfer.js'
import { apiFetch } from '../lib/api'
import {
  RiArrowLeftLine, RiPhoneLine, RiTimeLine, RiBarChartHorizontalLine,
  RiDownload2Line, RiEdit2Line, RiStarLine, RiPlayLine, RiPauseLine,
  RiSkipForwardLine,
} from 'react-icons/ri'
import { HiChevronDown } from 'react-icons/hi'
import {
  ResponsiveContainer, AreaChart, Area, XAxis,
} from 'recharts'
import '../dashboard.css'

// â”€â”€â”€ Audio Player â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

function fmt(s) {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function AudioPlayer({ url, fallbackDuration }) {
  const containerRef = useRef(null)
  const wsRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [ready, setReady] = useState(false)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    if (!containerRef.current || !url) return
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#1e2433',
      progressColor: '#6366f1',
      cursorColor: '#818cf8',
      height: 36,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      normalize: true,
      interact: true,
    })
    ws.load(url)
    ws.on('ready', () => { setDuration(ws.getDuration()); setReady(true) })
    ws.on('audioprocess', () => setCurrentTime(ws.getCurrentTime()))
    ws.on('seeking', () => setCurrentTime(ws.getCurrentTime()))
    ws.on('play', () => setPlaying(true))
    ws.on('pause', () => setPlaying(false))
    ws.on('finish', () => { setPlaying(false); setCurrentTime(0) })
    wsRef.current = ws
    return () => ws.destroy()
  }, [url])

  const togglePlay = () => wsRef.current?.playPause()
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(next)
    wsRef.current?.setPlaybackRate(next)
  }

  return (
    <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
      <button
        onClick={url ? togglePlay : undefined}
        style={{
          width:34, height:34, borderRadius:'50%', border:'none', flexShrink:0,
          background: url && ready ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : '#1a1f2e',
          color:'#fff', cursor: url && ready ? 'pointer' : 'default',
          display:'flex', alignItems:'center', justifyContent:'center',
          opacity: !url ? 0.4 : ready ? 1 : 0.6,
          transition: 'opacity .2s',
        }}
      >
        {playing ? <RiPauseLine style={{ width:16, height:16 }} /> : <RiPlayLine style={{ width:16, height:16 }} />}
      </button>

      <span style={{ fontSize:11, color:'#4b5563', flexShrink:0, minWidth:30, textAlign:'right' }}>
        {fmt(currentTime)}
      </span>

      {url ? (
        <div ref={containerRef} style={{ flex:1 }} />
      ) : (
        /* ponytail: static bars shown when no recording URL */
        <div style={{ flex:1, height:36, display:'flex', alignItems:'center', gap:1.5 }}>
          {[3,6,9,14,8,16,11,7,15,10,13,8,17,12,9,6,11,15,8,10,14,7,12,16,9,11,6,15,10,8,14,17,11,9,7,13,15,10,8,14].map((h, i) => (
            <div key={i} style={{ flex:1, borderRadius:2, minHeight:2, height:`${(h/17)*100}%`, background:`hsl(${220+i*2},40%,10%)` }} />
          ))}
        </div>
      )}

      <span style={{ fontSize:11, color:'#4b5563', flexShrink:0, minWidth:30 }}>
        {duration ? fmt(duration) : fallbackDuration}
      </span>

      <button
        onClick={url && ready ? cycleSpeed : undefined}
        style={{
          background:'none', border:'none', color: url ? '#6b7280' : '#2d3347',
          cursor: url && ready ? 'pointer' : 'default',
          display:'flex', alignItems:'center', gap:3, fontSize:11.5, padding:'0 4px', flexShrink:0,
        }}
      >
        <RiSkipForwardLine style={{ width:13, height:13 }} /> {speed}x <HiChevronDown style={{ width:10, height:10 }} />
      </button>
      <RiDownload2Line
        onClick={url ? () => window.open(url) : undefined}
        style={{ width:15, height:15, color: url ? '#4b5563' : '#2d3347', cursor: url ? 'pointer' : 'default', flexShrink:0 }}
      />
    </div>
  )
}

const TRANSCRIPT = [
  { isAgent:true,  time:'00:00', text:'Â¡Hola! Soy SofÃ­a de VozIA. Vi que vuestro equipo estÃ¡ creciendo rÃ¡pido. Â¿Tienes 2 minutos para ver cÃ³mo ayudamos a automatizar el proceso comercial?' },
  { isAgent:false, time:'00:18', text:'Hola SofÃ­a, sÃ­, cuÃ©ntame brevemente.' },
  { isAgent:true,  time:'00:21', text:'Perfecto. Trabajamos con empresas para aumentar las reuniones cualificadas. En promedio, conseguimos un 35% mÃ¡s de demos agendadas en los primeros 60 dÃ­as.' },
  { isAgent:false, time:'00:38', text:'Interesante. Â¿Y cÃ³mo lo conseguÃ­s?' },
  { isAgent:true,  time:'00:42', text:'Usamos agentes IA que se llaman como humanos, entienden el contexto y conectan con los leads en el momento justo.' },
  { isAgent:false, time:'00:59', text:'Â¿TenÃ©is casos de uso en el sector tecnolÃ³gico?' },
  { isAgent:true,  time:'01:02', text:'SÃ­, precisamente. Tenemos clientes SaaS con equipos similares al vuestro. Â¿Agendamos 20 minutos para mostrarte la plataforma?' },
]

const MOMENTS = [
  { time:'02:15', color:'#10b981', label:'Dolor', text:'MencionÃ³ dolor: "falta de seguimiento"' },
  { time:'03:42', color:'#f59e0b', label:'ObjeciÃ³n', text:'ObjeciÃ³n: "No tenemos presupuesto ahora"' },
  { time:'05:10', color:'#3b82f6', label:'InterÃ©s', text:'InterÃ©s alto: "Â¿Y quÃ© resultados reales tenÃ©is?"' },
  { time:'07:33', color:'#8b5cf6', label:'SeÃ±al', text:'SeÃ±al de compra: "Agendemos una demo"' },
]

const SENT_DATA = [
  {t:'0:00',v:0.08},{t:'1:00',v:0.35},{t:'2:00',v:0.45},{t:'3:00',v:-0.15},
  {t:'4:00',v:0.20},{t:'5:00',v:0.58},{t:'6:00',v:0.72},{t:'7:00',v:0.68},{t:'8:24',v:0.82},
]

const STATUS_MAP = {
  'ReuniÃ³n agendada':  { color:'#10b981', bg:'#10b98115' },
  'Interesado':        { color:'#f59e0b', bg:'#f59e0b15' },
  'Seguimiento':       { color:'#3b82f6', bg:'#3b82f615' },
  'No interesado':     { color:'#ef4444', bg:'#ef444415' },
  'Propuesta enviada': { color:'#8b5cf6', bg:'#8b5cf615' },
}

const TABS = ['TranscripciÃ³n', 'AnÃ¡lisis', 'Momentos clave']

export default function CallDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [call, setCall] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('TranscripciÃ³n')
  const [starred, setStarred] = useState(false)

  useEffect(() => {
    apiFetch(`/api/calls/${id}`).then(r => r.ok ? r.json() : null).then(data => {
      if (data) {
        const dur = data.durationSeconds ?? 0
        const durStr = `${Math.floor(dur/60)}m ${dur%60}s`
        const outMap = { meeting_scheduled: 'ReuniÃ³n agendada', interested: 'Interesado', callback: 'Callback', not_interested: 'No interÃ©s', no_answer: 'Sin respuesta' }
        setCall({
          ...data,
          lead: data.lead ?? { name: 'Desconocido' },
          dur: durStr,
          status: data.outcome ? (outMap[data.outcome] ?? data.outcome) : (data.status === 'completed' ? 'Ã‰xito' : data.status),
          score: data.sentimentScore ?? 0,
          transcript: data.transcriptWords || (data.transcript ? [{ time: '0:00', speaker: 'Agente', text: data.transcript }] : []),
          sentiment: data.sentimentScore ?? 0,
        })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:16 }}>
      Cargandoâ€¦
    </div>
  )

  if (!call) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:16 }}>
      Llamada no encontrada
    </div>
  )

  const s = STATUS_MAP[call.status] || { color:'#6b7280', bg:'#6b728015' }
  const pos = call.score >= 0

  return (
    <div className="dark-scroll" style={{ flex:1, overflowY:'auto', background:'#080c14', display:'flex', flexDirection:'column' }}>

      {/* Back */}
      <div style={{ padding:'20px 28px 0', flexShrink:0 }}>
        <button onClick={() => navigate('/llamadas')} style={{
          display:'flex', alignItems:'center', gap:6,
          background:'none', border:'none', color:'#6b7280', fontSize:13, cursor:'pointer', padding:0,
        }}>
          <RiArrowLeftLine style={{ width:15, height:15 }} />
          Volver a Llamadas
        </button>
      </div>

      {/* Header card */}
      <div style={{ padding:'20px 28px', flexShrink:0 }}>
        <div style={{
          background:'linear-gradient(135deg, #0d1117, #111827)',
          border:'1px solid #1e2433', borderRadius:16, padding:'22px 24px',
          display:'flex', gap:20, alignItems:'flex-start',
        }}>
          <div style={{
            width:56, height:56, borderRadius:15, flexShrink:0,
            background:`linear-gradient(135deg, ${call.bg}, ${call.bg}bb)`,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:20, fontWeight:700, color:'#fff',
            boxShadow:`0 0 24px ${call.bg}55`,
          }}>{call.initials}</div>

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'#f1f5f9' }}>{call.name}</h1>
              <span style={{ fontSize:12, background:s.bg, color:s.color, border:`1px solid ${s.color}40`, borderRadius:99, padding:'2px 10px', fontWeight:600 }}>{call.status}</span>
            </div>
            <p style={{ margin:'0 0 10px', fontSize:13, color:'#6b7280' }}>{call.company} Â· {call.role}</p>
            <div style={{ display:'flex', gap:18 }}>
              {[
                { icon:RiPhoneLine, label:call.agent, sub:'Agente' },
                { icon:RiTimeLine, label:call.dur, sub:'DuraciÃ³n' },
                { icon:RiBarChartHorizontalLine, label:call.time, sub:'Hora' },
              ].map(({ icon:Icon, label, sub }) => (
                <div key={sub} style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <Icon style={{ width:13, height:13, color:'#4b5563' }} />
                  <div>
                    <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#e2e8f0' }}>{label}</p>
                    <p style={{ margin:0, fontSize:10.5, color:'#4b5563' }}>{sub}</p>
                  </div>
                </div>
              ))}
              <div style={{ marginLeft:'auto', textAlign:'center' }}>
                <p style={{ margin:'0 0 2px', fontSize:28, fontWeight:800, lineHeight:1, color:pos?'#4ade80':'#f87171', textShadow:`0 0 20px ${pos?'#4ade80':'#f87171'}55` }}>
                  {pos?'+':''}{call.score.toFixed(2)}
                </p>
                <p style={{ margin:0, fontSize:10.5, color:'#4b5563' }}>Sentimiento</p>
              </div>
            </div>
          </div>

          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            {[
              { Icon: starred ? RiStarLine : RiStarLine, label: starred ? 'Destacado' : 'Destacar', action: () => setStarred(v => !v), active: starred },
              { Icon:RiEdit2Line,    label:'Editar',   action: () => navigate('/llamadas') },
              { Icon:RiDownload2Line,label:'Exportar', action: () => {
                const text = `TRANSCRIPCIÃ“N â€” ${call.name}\n${call.time} Â· ${call.dur}\n\n` + TRANSCRIPT.map(m => `[${m.time}] ${m.isAgent ? 'Agente' : call.name}: ${m.text}`).join('\n')
                const blob = new Blob([text], { type:'text/plain' })
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `llamada_${call.name.replace(/ /g,'_')}.txt`; a.click()
              }},
            ].map(({ Icon, label, action, active }) => (
              <button key={label} onClick={action} style={{
                display:'flex', alignItems:'center', gap:5, background: active ? '#fbbf2415' : '#111827',
                border:'1px solid ' + (active ? '#fbbf2430' : '#1e2433'), borderRadius:9, padding:'7px 12px',
                color: active ? '#fbbf24' : '#94a3b8', fontSize:12, cursor:'pointer',
              }}>
                <Icon style={{ width:13, height:13 }} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Player */}
      <div style={{ padding:'0 28px 16px', flexShrink:0 }}>
        <AudioPlayer url={call.recordingUrl ?? null} fallbackDuration={call.dur} />
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', gap:14, padding:'0 28px 28px', minHeight:0 }}>

        {/* Left */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:14 }}>
          {/* Tabs */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid #1e2433' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background:'none', border:'none', padding:'8px 16px', fontSize:13,
                color: tab===t ? '#f1f5f9' : '#4b5563',
                borderBottom:`2px solid ${tab===t ? '#6366f1' : 'transparent'}`,
                cursor:'pointer', fontWeight: tab===t ? 700 : 400, transition:'all .15s', marginBottom:-1,
              }}>{t}</button>
            ))}
          </div>

          {tab === 'TranscripciÃ³n' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {TRANSCRIPT.map((m, i) => (
                <div key={i} style={{ display:'flex', gap:10, justifyContent: m.isAgent ? 'flex-start' : 'flex-end' }}>
                  {m.isAgent && (
                    <div style={{ width:28, height:28, borderRadius:8, background:'linear-gradient(135deg,#4f46e5,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>IA</div>
                  )}
                  <div style={{ maxWidth:'72%' }}>
                    <div style={{
                      background: m.isAgent ? '#111827' : '#1a1a3a',
                      border:`1px solid ${m.isAgent ? '#1e2433' : '#2d2a5a'}`,
                      borderRadius: m.isAgent ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                      padding:'10px 14px',
                    }}>
                      <p style={{ margin:0, fontSize:12.5, color:'#e2e8f0', lineHeight:1.5 }}>{m.text}</p>
                    </div>
                    <p style={{ margin:'3px 0 0', fontSize:10.5, color:'#374151', textAlign: m.isAgent ? 'left' : 'right' }}>{m.time}</p>
                  </div>
                  {!m.isAgent && (
                    <div style={{ width:28, height:28, borderRadius:8, background:`linear-gradient(135deg, ${call.bg}, ${call.bg}bb)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>{call.initials[0]}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'AnÃ¡lisis' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>DistribuciÃ³n del sentimiento</p>
                {[{ label:'Positivo', pct:74, color:'#10b981' }, { label:'Neutral', pct:18, color:'#f59e0b' }, { label:'Negativo', pct:8, color:'#ef4444' }].map(d => (
                  <div key={d.label} style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                      <span style={{ fontSize:12, color:'#94a3b8' }}>{d.label}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:'#e2e8f0' }}>{d.pct}%</span>
                    </div>
                    <div style={{ height:6, borderRadius:99, background:'#111827' }}>
                      <div style={{ width:`${d.pct}%`, height:'100%', borderRadius:99, background:d.color, boxShadow:`0 0 6px ${d.color}60` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>EvoluciÃ³n del sentimiento</p>
                <div style={{ height:120 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={SENT_DATA} margin={{ top:4, right:4, left:-24, bottom:0 }}>
                      <defs>
                        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="t" tick={{ fill:'#374151', fontSize:9 }} axisLine={false} tickLine={false} />
                      <Area type="monotone" dataKey="v" stroke="#6366f1" strokeWidth={1.5} fill="url(#sg)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {tab === 'Momentos clave' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {MOMENTS.map((m, i) => (
                <div key={i} style={{ display:'flex', gap:12, background:'#0d1117', border:`1px solid ${m.color}30`, borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:m.color, flexShrink:0, marginTop:5, boxShadow:`0 0 6px ${m.color}80` }} />
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:m.color, background:`${m.color}15`, border:`1px solid ${m.color}30`, borderRadius:5, padding:'1px 7px' }}>{m.label}</span>
                      <span style={{ fontSize:11, color:'#4b5563' }}>{m.time}</span>
                    </div>
                    <p style={{ margin:0, fontSize:13, color:'#e2e8f0', lineHeight:1.5 }}>{m.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ width:240, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>
          {/* Score card */}
          <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
            <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'#e2e8f0' }}>MÃ©tricas de la llamada</p>
            {[
              { label:'Palabras/min', value:'142' },
              { label:'Silencios', value:'3' },
              { label:'Interrupciones', value:'1' },
              { label:'Score agente', value:'87/100' },
            ].map(m => (
              <div key={m.label} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #111827' }}>
                <span style={{ fontSize:11.5, color:'#4b5563' }}>{m.label}</span>
                <span style={{ fontSize:11.5, fontWeight:600, color:'#e2e8f0' }}>{m.value}</span>
              </div>
            ))}
          </div>

          {/* Next steps */}
          <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
            <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'#e2e8f0' }}>PrÃ³ximos pasos</p>
            {['Enviar correo de seguimiento', 'Agendar demo de producto', 'Compartir caso de Ã©xito'].map((s, i) => (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:8 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:'#6366f1', flexShrink:0, marginTop:5 }} />
                <p style={{ margin:0, fontSize:11.5, color:'#94a3b8', lineHeight:1.4 }}>{s}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

