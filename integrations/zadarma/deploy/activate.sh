#!/bin/sh
# Run ONLY after install-config.py and the explicitly authorized env upload.
set -eu
test -s /etc/vendrava/zadarma.env
test -f /etc/systemd/system/vendrava-zadarma.service
nginx -t
asterisk -rx 'manager reload'
asterisk -rx 'dialplan reload'
systemctl daemon-reload
systemctl enable --now vendrava-zadarma.service
# Give startup imports time to finish, then check with the private bearer.
/opt/vendrava/node-v22.23.2-linux-x64/bin/node --env-file=/etc/vendrava/zadarma.env - <<'JS'
const {setTimeout: delay} = require('node:timers/promises');
(async () => {
  for (let i=0; i<20; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9093/health', {headers:{Authorization:'Bearer '+process.env.ZADARMA_GATEWAY_TOKEN}, signal:AbortSignal.timeout(2000)});
      if(r.ok) { console.log(await r.text()); return; }
    } catch {}
    await delay(500);
  }
  throw new Error('Gateway health check failed; nginx was not reloaded');
})().catch(e=>{console.error(e.message);process.exitCode=1});
JS
systemctl reload nginx
systemctl is-active asterisk sprintmarkt-crm nginx vendrava-zadarma
asterisk -rx 'pjsip show registrations'
