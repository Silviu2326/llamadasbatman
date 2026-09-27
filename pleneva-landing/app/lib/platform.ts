export function platformUrl() {
  const configured = process.env.NEXT_PUBLIC_PLATFORM_URL?.trim().replace(/\/$/, "");
  if (configured) {
    try {
      const url = new URL(configured);
      return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
    } catch {
      return "";
    }
  }
  return process.env.NODE_ENV === "development" ? "http://127.0.0.1:5173" : "";
}
