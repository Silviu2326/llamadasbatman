"""Remove only this deployment's temporary key and uploaded secret duplicates."""
from pathlib import Path

authorized = Path('/root/.ssh/authorized_keys')
key = 'AAAAC3NzaC1lZDI1NTE5AAAAIL+DV078yn8E0BNlCbah8T8WHQHU8Uf8UUDPh9kuGsHN'
lines = authorized.read_text().splitlines(keepends=True)
kept = [line for line in lines if not (key in line.split() and 'vendrava-temporary-deploy' in line.split())]
removed = len(lines) - len(kept)
assert removed <= 1, 'Unexpected duplicate key; review before removal'
authorized.write_text(''.join(kept))
for name in ('gateway-env.local', 'pjsip-existing.conf.local'):
    path = Path('/opt/vendrava/staging') / name
    if path.exists():
        assert path.is_file() and not path.is_symlink()
        path.unlink()
print('Temporary SSH key removed:', removed)
print('Staging credential copies removed; active private service configuration retained.')
