import { useEffect, useRef, useState } from 'react'
import { MAPS, PERKS } from './game/content'
import { UmbraRuntime } from './game/runtime'
import { loadProfile, saveProfile } from './game/storage'

const EMPTY_HUD = {
  phase: 'loading', round: 1, roundTimer: 0, hp: 150, maxHp: 150, armor: 75, maxArmor: 100,
  playerX: 50, playerY: 75,
  credits: 900, scrap: 0, score: 0, kills: 0, ammo: 12, reserve: 96,
  weapon: 'Pistola de servicio', weaponLevel: 0, reloading: false, perks: [], prompt: null,
  message: '', objective: '', questProgress: '', questStage: 1, questTotal: 5, enemies: 0, pending: 0,
  secondaryWeapon: 'Hueco vacío', secondaryAmmo: null, secondaryReserve: null, activeWeapon: 1, powerOnline: false, gatesOpen: 0, gatesTotal: 3, roundEvent: '', trapActive: false,
  weaponSlots: [{ name: 'Pistola de servicio', ammo: 12, reserve: 96, level: 0, reloading: false }, null],
  extractionActive: false, extractionTimer: 0, endReason: null,
}

function MapCard({ map, index, selected, best, egg, onSelect }) {
  return <button className={`map-card${selected ? ' is-selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
    <span className={`map-card__art map-card__art--${index}`} aria-hidden="true" />
    <span className="map-card__shade" />
    <span className="map-card__copy">
      <strong>{map.name}</strong><small>{map.subtitle}</small>
      <span><b>Récord {best || '—'}</b><b>{egg ? 'Misterio resuelto' : 'Misterio oculto'}</b></span>
    </span>
  </button>
}

function MainMenu({ profile, selected, setSelected, onStart }) {
  const map = MAPS[selected]
  return <main className="menu-shell">
    <div className="menu-atmosphere" aria-hidden="true" />
    <header className="menu-header">
      <div className="brand-lockup"><span className="brand-sigil" aria-hidden="true">U</span><div><strong>UMBRA</strong><small>PROTOCOL</small></div></div>
      <span className="mode-label">MODO ZOMBIS · INDIVIDUAL</span>
    </header>
    <section className="menu-intro">
      <div className="menu-copy">
        <h1>La ciudad olvidó<br />cómo morir.</h1>
        <p>Abre sectores, restaura la energía y convierte cada ronda en una decisión: armamento, destilados, trampas o Contrabando Inestable. Cada brecha esconde su propio custodio.</p>
        <button className="primary-action" onClick={onStart}><span>ENTRAR EN {map.name.toUpperCase()}</span><kbd>↵</kbd></button>
        <div className="control-strip"><span><kbd>WASD</kbd> Mover</span><span><kbd>RATÓN</kbd> Apuntar</span><span><kbd>CLIC</kbd> Disparar</span><span><kbd>E</kbd> Usar</span><span><kbd>Q</kbd> Cambiar arma</span><span><kbd>R</kbd> Recargar</span></div>
      </div>
      <aside className="mode-manifest">
        <span>PROTOCOLO DE CAMPO</span>
        <ol><li>Abre tres sectores y reactiva la red.</li><li>Equipa dos armas y apuesta al Contrabando.</li><li>Convierte componentes en trampas y mejoras.</li><li>Supera el evento, descifra el misterio y derrota al custodio.</li></ol>
        <div><strong>2</strong><span>ARMAS<br />EQUIPADAS</span><strong>5</strong><span>FASES DE<br />MISTERIO</span></div>
      </aside>
    </section>
    <section className="map-select" aria-labelledby="map-select-title">
      <div className="map-select__head"><div><h2 id="map-select-title">Elige una brecha</h2><p>Tres mapas originales, tres reglas ambientales y tres cadenas secretas.</p></div><span>{selected + 1} / {MAPS.length}</span></div>
      <div className="map-grid">{MAPS.map((item, index) => <MapCard key={item.id} map={item} index={index} selected={selected === index} best={profile.bestByMap[item.id]} egg={profile.eggs[item.id]} onSelect={() => setSelected(index)} />)}</div>
    </section>
    <footer className="menu-footer"><span>Partida local · sin conexión · guardado de récords en este dispositivo</span><span>ARTE Y UNIVERSO ORIGINALES</span></footer>
  </main>
}

function PerkIcon({ id }) {
  const perk = PERKS[id]
  return <div className="perk-token" style={{ '--perk-color': perk.color }} title={`${perk.name}: ${perk.description}`}>
    <span className={`perk-sprite perk-sprite--${perk.sprite}`} /><small>{perk.short}</small>
  </div>
}

function GameHud({ hud }) {
  const health = `${Math.max(0, hud.hp) / hud.maxHp * 100}%`
  const armor = `${Math.max(0, hud.armor) / hud.maxArmor * 100}%`
  return <div className="game-hud">
    <section className="hud-mission">
      <span>UMBRA PROTOCOL · {hud.mapName}</span><h1>RONDA {hud.round}</h1>
      <p><i />{hud.objective} {hud.questProgress && <b>{hud.questProgress}</b>}</p>
      <small>ANOMALÍA {Math.min(hud.questStage, hud.questTotal)} / {hud.questTotal}</small>
      <div className={`hud-system${hud.powerOnline ? ' is-online' : ''}`}><b>{hud.powerOnline ? 'RED ACTIVA' : 'RED INACTIVA'}</b><span>SECTORES {hud.gatesOpen}/{hud.gatesTotal}</span></div>
    </section>
    <section className="hud-perks" aria-label="Destilados activos">{hud.perks.map(id => <PerkIcon key={id} id={id} />)}</section>
    <section className="mini-map" aria-label={`Mapa táctico de ${hud.mapName}`}><span>{hud.mapName}</span><div className="mini-map__grid"><i className="mini-map__player" style={{ left: `${hud.playerX}%`, top: `${hud.playerY}%` }} />{[0, 1, 2].map(index => <b key={index} className={index < hud.gatesOpen ? 'is-open' : ''} />)}</div></section>
    <section className="hud-vitals">
      <div className="portrait">U</div><div className="vital-bars"><div className="health"><i style={{ width: health }} /><strong>{hud.hp} / {hud.maxHp}</strong></div><div className="armor"><i style={{ width: armor }} /><strong>{hud.armor} / {hud.maxArmor}</strong></div></div>
    </section>
    <section className="hud-weapon">
      {hud.weaponSlots.map((slot, index) => <div key={index} className={`weapon-slot${hud.activeWeapon === index + 1 ? ' is-active' : ''}${slot ? '' : ' is-empty'}`}><span>{index + 1} · {slot?.name || 'Hueco vacío'}{slot?.level ? ` · NIVEL ${slot.level}` : ''}</span><strong>{slot?.reloading ? 'RECARGANDO' : slot?.ammo ?? '—'}<small>{slot ? ` / ${slot.reserve}` : ''}</small></strong></div>)}
      <em>Q · ALTERNAR</em>
    </section>
    <section className="hud-economy"><strong>{hud.credits.toLocaleString('es-ES')}</strong><span>RESIDUOS</span><b>{hud.scrap} COMPONENTES</b></section>
    <section className="hud-threat"><span>{hud.enemies} EN CAMPO</span><span>{hud.pending} ENTRANDO</span></section>
    {hud.double ? <div className="power-banner">DOBLE RESIDUO</div> : null}
    {hud.roundEvent ? <div className="round-event"><span>EVENTO DE RONDA</span><strong>{hud.roundEvent}</strong></div> : null}
    {hud.trapActive ? <div className="trap-banner">TRAMPA ACTIVA</div> : null}
    {hud.extractionActive ? <div className="extraction-banner">EXTRACCIÓN · {hud.extractionTimer} S</div> : null}
    {hud.combo >= 3 ? <div className="combo-banner">RACHA × {hud.combo}</div> : null}
    {hud.prompt ? <div className="interaction-prompt"><kbd>E</kbd><span>{hud.prompt.replace(/^E · /, '')}</span></div> : null}
    {hud.message ? <div className="event-message" role="status" aria-live="polite">{hud.message}</div> : null}
    {hud.phase === 'intermission' ? <div className="round-banner"><span>PRÓXIMA OLEADA</span><strong>{hud.roundTimer}</strong></div> : null}
  </div>
}

function TouchControls({ runtime }) {
  const bind = action => ({
    onPointerDown: event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); runtime?.setVirtual(action, true) },
    onPointerUp: event => { event.preventDefault(); runtime?.setVirtual(action, false) },
    onPointerCancel: () => runtime?.setVirtual(action, false),
  })
  return <div className="touch-controls" aria-label="Controles táctiles">
    <div className="touch-dpad"><button {...bind('up')} aria-label="Mover arriba">▲</button><button {...bind('left')} aria-label="Mover izquierda">◀</button><button {...bind('down')} aria-label="Mover abajo">▼</button><button {...bind('right')} aria-label="Mover derecha">▶</button></div>
    <div className="touch-actions"><button className="touch-use" onClick={() => runtime?.interact()}>USAR</button><button className="touch-fire" {...bind('fire')}>FUEGO</button><button onClick={() => runtime?.switchWeapon()}>Q</button><button onClick={() => runtime?.reload()}>R</button></div>
  </div>
}

function Overlay({ hud, runtime, onRestart, onMenu }) {
  if (hud.phase !== 'paused' && hud.phase !== 'gameover') return null
  const over = hud.phase === 'gameover'
  const extracted = hud.endReason === 'extracted'
  return <div className="pause-overlay" role="dialog" aria-modal="true" aria-label={over ? 'Fin de la partida' : 'Partida en pausa'}>
    <div className="pause-panel">
      <span>{extracted ? 'EXTRACCIÓN COMPLETADA' : over ? 'SEÑAL INTERRUMPIDA' : 'PROTOCOLO SUSPENDIDO'}</span>
      <h2>{extracted ? 'PROTOCOLO CERRADO' : over ? `RONDA ${hud.round}` : 'PAUSA'}</h2>
      <div className="result-stats"><div><strong>{hud.score.toLocaleString('es-ES')}</strong><small>PUNTUACIÓN</small></div><div><strong>{hud.kills}</strong><small>BAJAS</small></div><div><strong>{hud.questComplete ? 'SÍ' : `${hud.questStage}/${hud.questTotal}`}</strong><small>MISTERIO</small></div></div>
      {!over && <button className="primary-action" onClick={() => runtime?.pause(false)}>CONTINUAR</button>}
      <button onClick={onRestart}>REINICIAR MAPA</button><button onClick={onMenu}>SELECCIÓN DE MAPA</button>
    </div>
  </div>
}

export default function ZombiesGame() {
  const [screen, setScreen] = useState('menu')
  const [selected, setSelected] = useState(0)
  const [profile, setProfile] = useState(loadProfile)
  const [hud, setHud] = useState(EMPTY_HUD)
  const [runKey, setRunKey] = useState(0)
  const canvasRef = useRef(null)
  const runtimeRef = useRef(null)

  useEffect(() => {
    if (screen !== 'playing' || !canvasRef.current) return undefined
    const runtime = new UmbraRuntime(canvasRef.current, {
      mapId: MAPS[selected].id,
      onSnapshot: setHud,
      onGameOver: result => updateRecords(result),
    })
    runtimeRef.current = runtime
    canvasRef.current.focus()
    return () => { runtime.destroy(); runtimeRef.current = null }
  }, [screen, selected, runKey])

  function updateRecords(result) {
    setProfile(current => {
      const mapId = MAPS[selected].id
      const next = {
        ...current,
        bestByMap: { ...current.bestByMap, [mapId]: Math.max(current.bestByMap[mapId] || 0, result.round) },
        eggs: result.questComplete ? { ...current.eggs, [mapId]: true } : current.eggs,
      }
      saveProfile(next)
      return next
    })
  }

  const start = () => { setHud({ ...EMPTY_HUD, mapName: MAPS[selected].name, objective: MAPS[selected].objective }); setScreen('playing') }
  const restart = () => { setHud(EMPTY_HUD); setRunKey(value => value + 1) }
  const menu = () => { updateRecords(hud); setScreen('menu') }

  if (screen === 'menu') return <MainMenu profile={profile} selected={selected} setSelected={setSelected} onStart={start} />

  return <main className="game-shell">
    <canvas ref={canvasRef} className="game-canvas" tabIndex={0} aria-label={`Arena de supervivencia ${MAPS[selected].name}`} />
    <GameHud hud={hud} />
    <button className="pause-button" onClick={() => runtimeRef.current?.togglePause()} aria-label="Pausar partida">Ⅱ</button>
    <TouchControls runtime={runtimeRef.current} />
    <Overlay hud={hud} runtime={runtimeRef.current} onRestart={restart} onMenu={menu} />
  </main>
}
