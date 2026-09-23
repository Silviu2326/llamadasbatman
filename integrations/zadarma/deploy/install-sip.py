"""Register only the confirmed-free SIP 922118, preserving the CRM trunk."""
import datetime
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess

main = Path('/etc/asterisk/pjsip.conf')
source = Path('/opt/vendrava/staging/pjsip-existing.conf.local')
target = Path('/etc/asterisk/vendrava-pjsip.conf')
before = main.read_text()
assert 'vendrava-pjsip.conf' not in before and not target.exists()
assert re.search(r'^username\s*=\s*922118\s*$', source.read_text(), re.M)
backup = Path('/opt/vendrava/backups') / ('sip-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(parents=True, mode=0o700)
os.chmod(backup.parent, 0o700)
shutil.copy2(main, backup / main.name)
os.chmod(backup / main.name, 0o600)
shutil.copyfile(source, target)
os.chown(target, 0, pwd.getpwnam('asterisk').pw_gid)
os.chmod(target, 0o640)
main.write_text(before + '\n#include "vendrava-pjsip.conf"\n')
subprocess.run(['asterisk', '-rx', 'pjsip reload'], check=True, stdout=subprocess.DEVNULL)
print('SIP 922118 added separately. Backup:', backup)
