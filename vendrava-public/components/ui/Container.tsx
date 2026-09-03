import type { ReactNode } from "react";

const MAX_WIDTHS = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
};

export function Container({
  children,
  size = "lg",
  className = "",
  id,
}: {
  children: ReactNode;
  size?: keyof typeof MAX_WIDTHS;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={`mx-auto w-full px-6 ${MAX_WIDTHS[size]} ${className}`}>
      {children}
    </div>
  );
}
