"""Add isolated Vendrava configuration; keep a private rollback copy first.

Run after building /opt/vendrava/gateway; staging is root-only.
Never prints secrets. Does not restart Asterisk or alter existing SIP objects.
"""
import datetime
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess

stage = Path('/opt/vendrava/staging')
backup = Path('/opt/vendrava/backups') / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup.mkdir(parents=True, mode=0o700)
os.chmod(backup.parent, 0o700)
nginx = Path('/etc/nginx/sites-available/crm.sprintmarkt.com')
targets = [Path('/etc/asterisk') / f for f in ['pjsip.conf', 'extensions.conf', 'manager.conf']] + [nginx]
for f in targets:
    shutil.copy2(f, backup / f.name)
    os.chmod(backup / f.name, 0o600)

env = dict((k, json.loads(v)) for k, v in (line.split('=', 1) for line in (stage / 'gateway-env.local').read_text().splitlines()))
manager = targets[2]
text = manager.read_text()
assert re.search(r'^enabled\s*=\s*no\s*$', text, re.M), 'AMI state changed; review required'
text = re.sub(r'^enabled\s*=\s*no\s*$', 'enabled = yes', text, count=1, flags=re.M)
text = re.sub(r'^bindaddr\s*=\s*0\.0\.0\.0\s*$', 'bindaddr = 127.0.0.1', text, count=1, flags=re.M)
assert re.search(r'^bindaddr\s*=\s*127\.0\.0\.1\s*$', text, re.M)
assert '[vendrava-ai]' not in text
text += '\n[vendrava-ai]\nsecret = ' + env['ZADARMA_AMI_SECRET'] + '\ndeny = 0.0.0.0/0.0.0.0\npermit = 127.0.0.1/255.255.255.255\nread = none\nwrite = originate\n'

account = pwd.getpwnam('vendrava')
asterisk = pwd.getpwnam('asterisk')
config = Path('/etc/vendrava')
config.mkdir(mode=0o750, exist_ok=True)
os.chown(config, 0, account.pw_gid)
shutil.copyfile(stage / 'gateway-env.local', config / 'zadarma.env')
os.chown(config / 'zadarma.env', 0, account.pw_gid)
os.chmod(config / 'zadarma.env', 0o640)
recordings = Path(env['ZADARMA_RECORDING_DIR'])
recordings.mkdir(parents=True, exist_ok=True)
os.chown(recordings, asterisk.pw_uid, account.pw_gid)
os.chmod(recordings, 0o2770)

for main, source, new in [(targets[0], 'pjsip-existing.conf.local', 'vendrava-pjsip.conf'), (targets[1], 'extensions.conf.example', 'vendrava-extensions.conf')]:
    before = main.read_text()
    destination = main.parent / new
    if new in before:
        assert destination.read_bytes() == (stage / source).read_bytes(), 'Existing include differs; review required'
        continue
    assert not destination.exists(), 'Unexpected config collision'
    shutil.copyfile(stage / source, destination)
    os.chown(destination, 0, asterisk.pw_gid)
    os.chmod(destination, 0o640)
    main.write_text(before + '\n#include "' + new + '"\n')
manager.write_text(text)

# The upstream itself stays loopback-only and authenticates every route.
before = nginx.read_text()
assert 'vendrava-voice-gateway' not in before
needle = 'server_name crm.sprintmarkt.com;'
assert needle in before
location = '''
    location ^~ /vendrava-voice-gateway/ {
        client_max_body_size 4k;
        proxy_pass http://127.0.0.1:9093/;
        proxy_read_timeout 65s;
        proxy_connect_timeout 5s;
        proxy_buffering off;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-store" always;
    }
'''
nginx.write_text(before.replace(needle, needle + location, 1))
check = subprocess.run(['nginx', '-t'], capture_output=True)
if check.returncode:
    shutil.copy2(backup / nginx.name, nginx)
    raise RuntimeError('nginx config validation failed; original restored')
shutil.copyfile(stage / 'vendrava-zadarma.service', '/etc/systemd/system/vendrava-zadarma.service')
print('Configuration staged; backup:', backup)
