const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const SLOTS = ["9:00", "10:30", "12:00", "16:00", "17:30"];

// Qué ocupa cada hueco: se rellenan en este orden para simular la semana llenándose.
const EVENTS: Record<string, string> = {
  "0-0": "Cita · Marta R.",
  "1-2": "Cita · Taller Soto",
  "3-1": "Llamada pasada a ti",
  "2-3": "Cita · Clínica Vega",
  "4-0": "Cita · Luis P.",
  "0-3": "Cita · Ana G.",
  "1-4": "Cita · Gym Norte",
  "3-4": "Cita · Pablo M.",
  "2-1": "Cita · Elena S.",
  "4-2": "Cita · Dr. Ruiz",
  "0-1": "Cita · Jorge T.",
  "3-2": "Cita · Nuria F.",
  "4-4": "Cita · Carla D.",
  "1-0": "Cita · Rosa B.",
  "2-4": "Cita · Iván L.",
};

export function AgendaFill() {
  const order = Object.keys(EVENTS);
  const total = DAYS.length * SLOTS.length;

  return (
    <div className="agenda" role="img" aria-label="Una agenda semanal que se va llenando de citas">
      <div className="agenda-head">
        <span className="agenda-title">Tu semana</span>
        <span className="agenda-live">
          <span className="dot" /> Pleneva llamando
        </span>
      </div>
      <div className="agenda-grid">
        <span />
        {DAYS.map((d) => (
          <span key={d} className="agenda-day">
            {d}
          </span>
        ))}
        {SLOTS.map((slot, s) => (
          <div key={slot} className="agenda-row">
            <span className="agenda-time">{slot}</span>
            {DAYS.map((_, d) => {
              const key = `${d}-${s}`;
              const idx = order.indexOf(key);
              return (
                <span key={key} className="agenda-cell">
                  {idx >= 0 && (
                    <span
                      className={`agenda-event${EVENTS[key].startsWith("Llamada") ? " is-handoff" : ""}`}
                      style={{ animationDelay: `${0.4 + idx * 0.35}s` }}
                    >
                      {EVENTS[key]}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="agenda-meter">
        <div className="agenda-meter-label">
          <span>Agenda ocupada</span>
          <span className="agenda-meter-value">
            {order.length} de {total} huecos
          </span>
        </div>
        <div className="meter">
          <span className="meter-fill" style={{ width: `${Math.round((order.length / total) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
