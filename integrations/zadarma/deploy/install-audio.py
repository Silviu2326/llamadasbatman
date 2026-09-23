"""Install the isolated recording context, without enabling sales calls."""
import datetime
import os
from pathlib import Path
import pwd
import shutil
import subprocess

main = Path('/etc/asterisk/extensions.conf')
source = Path('/opt/vendrava/staging/extensions.conf.example')
target = Path('/etc/asterisk/vendrava-extensions.conf')
before = main.read_text()
assert 'vendrava-extensions.conf' not in before and not target.exists()
backup = Path('/opt/vendrava/backups') / ('audio-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(parents=True, mode=0o700)
shutil.copy2(main, backup / main.name)
os.chmod(backup / main.name, 0o600)
shutil.copyfile(source, target)
asterisk = pwd.getpwnam('asterisk')
account = pwd.getpwnam('vendrava')
os.chown(target, 0, asterisk.pw_gid)
os.chmod(target, 0o640)
recordings = Path('/var/spool/asterisk/monitor/vendrava')
recordings.mkdir(parents=True, exist_ok=True)
os.chown(recordings, asterisk.pw_uid, account.pw_gid)
os.chmod(recordings, 0o2770)
main.write_text(before + '\n#include "vendrava-extensions.conf"\n')
subprocess.run(['asterisk', '-rx', 'dialplan reload'], check=True, stdout=subprocess.DEVNULL)
print('Private audio and full recording context installed. Backup:', backup)
