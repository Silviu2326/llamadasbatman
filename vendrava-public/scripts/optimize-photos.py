#!/usr/bin/env python
"""
Convert dropped .png photos into optimized .webp at the exact target size/aspect
for each slot, then move the source .png out of public/ so it never ships.

Drop PNGs named like the brief (photo-hero-call.png, photo-clinics.png, ...) into:
  public/home        -> home scenes
  public/industries  -> one per sector
  public/products    -> product context shots

Run:  python scripts/optimize-photos.py
"""
import sys
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SRC_BACKUP = ROOT / "_photo-src"  # outside public/, never deployed

# Per-file target sizes (aspect matters most; webp is resized+cropped to these).
HOME_SIZES = {
    "photo-hero-call": (1920, 1080),
    "photo-callcenter": (1920, 1080),
    "photo-team": (1600, 1067),
    "photo-advisor": (1600, 1067),
    "photo-whatsapp": (1400, 933),
}
FOLDER_DEFAULT = {
    "home": (1600, 1067),
    "industries": (1200, 800),
    "products": (1400, 933),
}
QUALITY = 90

def target_for(folder: str, stem: str):
    if folder == "home" and stem in HOME_SIZES:
        return HOME_SIZES[stem]
    return FOLDER_DEFAULT.get(folder, (1600, 1067))

def kb(path: Path) -> int:
    return round(path.stat().st_size / 1024)

def main():
    SRC_BACKUP.mkdir(exist_ok=True)
    done = 0
    for folder in ("home", "industries", "products"):
        d = PUBLIC / folder
        if not d.exists():
            continue
        # Dedupe: on Windows glob is case-insensitive, so *.png and *.PNG overlap.
        pngs = {p.resolve(): p for p in list(d.glob("*.png")) + list(d.glob("*.PNG"))}
        for png in sorted(pngs.values(), key=lambda p: p.name.lower()):
            if not png.exists():
                continue
            stem = png.stem.lower()
            if not stem.startswith("photo-"):
                continue
            tw, th = target_for(folder, stem)
            orig_kb = kb(png)
            with Image.open(png) as im:
                im = im.convert("RGB")
                ow, oh = im.size
                # Never upscale: if the source is smaller than the slot, shrink the
                # target box to fit within the source (keeping the slot's aspect).
                ftw, fth = tw, th
                if tw > ow or th > oh:
                    scale = min(ow / tw, oh / th)
                    ftw, fth = max(1, round(tw * scale)), max(1, round(th * scale))
                fitted = ImageOps.fit(im, (ftw, fth), method=Image.LANCZOS, centering=(0.5, 0.5))
                out = d / f"{stem}.webp"
                fitted.save(out, "WEBP", quality=QUALITY, method=6)
            # move the source png out of public/ (preserve, but don't deploy it)
            backup = SRC_BACKUP / folder
            backup.mkdir(parents=True, exist_ok=True)
            dest = backup / png.name
            if dest.exists():
                dest.unlink()
            png.rename(dest)
            print(f"  {folder}/{png.name}  {ow}x{oh} {orig_kb}KB  ->  {out.name}  {ftw}x{fth} {kb(out)}KB")
            done += 1
    if done == 0:
        print("No photo-*.png found in public/home, public/industries or public/products.")
        print("Drop your PNGs there (see scripts/optimize-photos.py header) and re-run.")
    else:
        print(f"\nOptimized {done} image(s). Sources moved to {SRC_BACKUP.relative_to(ROOT)}/")

if __name__ == "__main__":
    sys.exit(main())
