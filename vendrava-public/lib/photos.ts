import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Build-time check: is there an optimized real photo for this slot?
 * Lets pages upgrade from the branded banner to a real photo automatically as
 * WebP files land in public/{dir}/photo-{id}.webp — no code change per photo.
 * Server-only (used in server components rendered at build).
 */
export function photoSrc(dir: string, id: string): string | null {
  const file = `photo-${id}.webp`;
  return existsSync(join(process.cwd(), "public", dir, file)) ? `/${dir}/${file}` : null;
}
