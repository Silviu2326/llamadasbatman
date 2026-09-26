type LogoProps = { inverted?: boolean; large?: boolean };

/** Marca Pleneva: la P con la cinta naranja y los clientes + el nombre. */
export function Logo({ inverted = false, large = false }: LogoProps) {
  const src = inverted ? "/brand/pleneva-logo-inverted.png" : "/brand/pleneva-logo.png";
  return (
    <span className={large ? "logo logo-lg" : "logo"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Pleneva" width={480} height={159} />
    </span>
  );
}
