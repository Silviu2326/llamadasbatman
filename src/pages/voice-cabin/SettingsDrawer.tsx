import { AudioLines, BrainCircuit, Check, Gauge, Settings2, Volume2, X } from "./icons";
import type { Dispatch, SetStateAction } from "react";
import type { HealthResponse, SessionSettings } from "./protocol";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: SessionSettings;
  setSettings: Dispatch<SetStateAction<SessionSettings>>;
  phoneAudio: boolean;
  setPhoneAudio: Dispatch<SetStateAction<boolean>>;
  health?: HealthResponse;
  locale?: string;
  runtime: { stt: string; llm: string; tts: string; models: { stt: string; llm: string; tts: string } };
}

function providerLabel(provider: string): string {
  return ({ deepgram: "Deepgram", cartesia: "Cartesia", cerebras: "Cerebras", groq: "Groq", deepseek: "DeepSeek", fish: "Fish Audio", minimax: "MiniMax" } as Record<string, string>)[provider] ?? provider;
}

export function SettingsDrawer({ open, onClose, settings, setSettings, phoneAudio, setPhoneAudio, health, runtime, locale = "es" }: SettingsDrawerProps) {
  const es = locale !== "en";
  if (!open) return null;
  return (
    <div className="drawer-layer">
      <button className="drawer-scrim" type="button" onClick={onClose} aria-label={es ? "Cerrar ajustes" : "Close settings"} />
      <aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header>
          <div><span className="eyebrow">{es ? "Siguiente sesión" : "Next session"}</span><h2 id="settings-title">{es ? "Ajustes de voz" : "Voice settings"}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={es ? "Cerrar ajustes" : "Close settings"}><X size={19} /></button>
        </header>

        <div className="settings-status">
          <Settings2 size={17} />
          <div><b>{es ? "Configuración del servidor" : "Server-side configuration"}</b><span>{health?.liveReady ? (es ? "Todos los proveedores están listos" : "All providers ready") : (es ? "Faltan claves para el modo en vivo" : "Provider keys are still required for live mode")}</span></div>
          <i className={health?.liveReady ? "ready" : ""}>{health?.liveReady ? <Check size={14} /> : "!"}</i>
        </div>

        <label className="drawer-toggle">
          <span><b>{es ? "Turno especulativo" : "Speculative turn"}</b><small>{es ? `Inicia ${providerLabel(runtime.llm)} al detectar el final; el audio se libera al confirmar.` : `Start ${providerLabel(runtime.llm)} on eager end; release audio only on final.`}</small></span>
          <input type="checkbox" checked={settings.speculative} onChange={(event) => setSettings((current) => ({ ...current, speculative: event.target.checked }))} />
          <i aria-hidden="true"><span /></i>
        </label>

        <label className="drawer-toggle">
          <span><b>{es ? "Audio telefónico" : "Phone-call audio"}</b><small>{es ? "Reproduce con banda estrecha de 300–3400 Hz. Se aplica al instante." : "Narrowband 300–3400 Hz on playback. Applies immediately."}</small></span>
          <input type="checkbox" checked={phoneAudio} onChange={(event) => setPhoneAudio(event.target.checked)} />
          <i aria-hidden="true"><span /></i>
        </label>

        <label className="drawer-field">
          <span><Volume2 size={14} /> {es ? `Modelo de ${providerLabel(runtime.tts)}` : `${providerLabel(runtime.tts)} model`}</span>
          <select value={settings.ttsModel} disabled>
            <option value="s2.1-pro">{runtime.models.tts} · {es ? "configurado para este agente" : "configured for this agent"}</option>
          </select>
        </label>

        <label className="drawer-field">
          <span><AudioLines size={14} /> {es ? "ID de voz" : "Voice ID"} <small>{es ? "del sistema o clonada" : "system or cloned"}</small></span>
          <input value={settings.voiceId} maxLength={128} onChange={(event) => setSettings((current) => ({ ...current, voiceId: event.target.value }))} />
        </label>

        <label className="drawer-range">
          <span><Gauge size={14} /> {es ? "Velocidad al hablar" : "Speaking speed"} <b>{settings.speed.toFixed(2)}×</b></span>
          <input type="range" min="0.8" max="1.2" step="0.01" value={settings.speed} onChange={(event) => setSettings((current) => ({ ...current, speed: Number(event.target.value) }))} />
          <div><span>0.80×</span><span>{es ? "Natural" : "Natural"}</span><span>1.20×</span></div>
        </label>

        <div className="model-route">
          <span className="eyebrow">{es ? "Ruta activa" : "Active route"}</span>
          <ol>
            <li><AudioLines size={15} /><span><b>{providerLabel(runtime.stt)} · {runtime.models.stt}</b><small>{es ? "Voz a texto" : "Speech to text"}</small></span></li>
            <li><BrainCircuit size={15} /><span><b>{providerLabel(runtime.llm)} · {runtime.models.llm}</b><small>{es ? "LLM en streaming" : "Streaming LLM"}</small></span></li>
            <li><Volume2 size={15} /><span><b>{providerLabel(runtime.tts)} · {runtime.models.tts}</b><small>PCM 24 kHz · {es ? "Español" : "English / Español"}</small></span></li>
          </ol>
        </div>

        <footer>
          <p>{es ? "Los cambios se aplican al iniciar la próxima sesión. Las claves nunca llegan al navegador." : "Changes apply when the next live session starts. API keys never enter the browser."}</p>
          <button type="button" onClick={onClose}>{es ? "Listo" : "Done"}</button>
        </footer>
      </aside>
    </div>
  );
}
