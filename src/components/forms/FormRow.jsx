// El número de columnas viaja como custom property para que la media query de
// `.form-row-grid` (style.css) pueda colapsar la fila a una sola columna en
// móvil: un estilo en línea siempre ganaría a la hoja de estilos.
export default function FormRow({ children, columns = 2, gap = 14 }) {
  return (
    <div
      className="form-row-grid"
      style={{
        '--form-row-columns': String(columns),
        gap,
      }}
    >
      {children}
    </div>
  )
}
