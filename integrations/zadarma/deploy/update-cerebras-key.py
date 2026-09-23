"""Replace only Cerebras in the private gateway environment; never print keys.

Run as root, reading the user-authorized new key on stdin. Refuse during calls.
"""
from pathlib import Path
import json
import os
import re
import subprocess
import sys
import urllib.request

env_path = Path('/etc/vendrava/zadarma.env')
env_text = env_path.read_text()
env = dict((k, json.loads(v)) for k, v in
           (line.split('=', 1) for line in env_text.splitlines() if '=' in line and not line.startswith('#')))
request = urllib.request.Request('http://127.0.0.1:9093/health',
    headers={'Authorization': 'Bearer ' + env['ZADARMA_GATEWAY_TOKEN']})
with urllib.request.urlopen(request, timeout=5) as response:
    assert json.load(response)['activeCalls'] == 0, 'Wait for active calls before updating'
new_key = sys.stdin.read().strip()
assert re.fullmatch(r'csk-[A-Za-z0-9_-]{20,200}', new_key), 'Invalid key format'
lines = [line for line in env_text.splitlines() if line.split('=', 1)[0] != 'CEREBRAS_API_KEY']
lines.append('CEREBRAS_API_KEY=' + json.dumps(new_key))
tmp = env_path.with_suffix('.env.new')
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
try:
    with os.fdopen(fd, 'w') as out:
        out.write('\n'.join(lines) + '\n')
    stat = env_path.stat()
    os.chown(tmp, stat.st_uid, stat.st_gid)
    os.chmod(tmp, 0o640)
    os.replace(tmp, env_path)
finally:
    if tmp.exists(): tmp.unlink()
subprocess.run(['systemctl', 'restart', 'vendrava-zadarma'], check=True)
print('Cerebras key replaced; gateway restarted. No other credentials changed.')
