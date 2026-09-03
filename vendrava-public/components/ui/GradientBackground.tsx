export function GradientBackground() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed -left-40 -top-64 z-0 h-[620px] w-[620px] animate-drift rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.20), transparent 62%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -right-60 top-[38%] z-0 h-[560px] w-[560px] rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(139,92,246,0.16), transparent 62%)",
          animation: "drift 28s ease-in-out infinite reverse",
        }}
      />
    </>
  );
}
