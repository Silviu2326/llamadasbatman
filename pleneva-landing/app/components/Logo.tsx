type LogoProps = { inverted?: boolean };

/** Marca Pleneva: un vaso colmado hasta el borde + el nombre en minúsculas. */
export function Logo({ inverted = false }: LogoProps) {
  const ink = inverted ? "#F6F1E7" : "#141414";
  return (
    <span className="logo" aria-label="Pleneva">
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M14 8h36v38a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10z" fill="none" stroke={ink} strokeWidth="5" />
        <path d="M17 13h30v33a7 7 0 0 1-7 7H24a7 7 0 0 1-7-7z" fill="#FF5A1F" />
      </svg>
      <span className="logo-word" style={{ color: ink }}>
        pleneva
      </span>
    </span>
  );
}
