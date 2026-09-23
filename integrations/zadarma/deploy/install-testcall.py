#!/usr/bin/env python3
"""Instala en el VPS la ruta de llamadas de prueba (agentes en borrador).

Aditivo y reversible. Todo lo que sobrescribe queda copiado antes en
/opt/vendrava/backups/testcall-<marca de tiempo>/, y cualquier fallo antes de
reiniciar deshace lo escrito desde esa copia.

No toca Asterisk, nginx ni sprintmarkt-crm. Reinicia únicamente la pasarela y el
worker de llamadas, y solo con cero llamadas activas.

No imprime nunca el contenido de /etc/vendrava/zadarma.env: las comprobaciones
que necesitan el token se hacen lanzando Node con --env-file.

Uso:  python3 install-testcall.py /ruta/testcall-bundle.local.tar.gz
"""

import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

GATEWAY = Path('/opt/vendrava/gateway')
DIST = GATEWAY / 'dist'
NODE = Path('/opt/vendrava/node-v22.23.2-linux-x64/bin/node')
ENV_FILE = Path('/etc/vendrava/zadarma.env')
BACKUPS = Path('/opt/vendrava/backups')
SERVICES = ('vendrava-zadarma', 'vendrava-call-worker')
UNTOUCHED = ('asterisk', 'nginx', 'sprintmarkt-crm')


def run(args, **kw):
    return subprocess.run(args, check=True, capture_output=True, text=True, **kw)


def node_eval(script, env_file=False):
    args = [str(NODE)]
    if env_file:
        args.append(f'--env-file={ENV_FILE}')
    args += ['-e', script]
    return run(args, cwd=str(GATEWAY)).stdout.strip()


def preflight():
    if os.geteuid() != 0:
        sys.exit('Hay que ejecutarlo como root.')
    for path in (GATEWAY, DIST, NODE, ENV_FILE):
        if not path.exists():
            sys.exit(f'No existe {path}: este VPS no tiene la instalación esperada.')
    free = shutil.disk_usage('/').free // (1024 * 1024)
    if free < 200:
        sys.exit(f'Solo quedan {free} MiB libres; no se instala nada.')
    print(f'Node: {run([str(NODE), "--version"]).stdout.strip()} | libres: {free} MiB')
    for service in SERVICES + UNTOUCHED:
        state = subprocess.run(['systemctl', 'is-active', service], capture_output=True, text=True).stdout.strip()
        print(f'  {service}: {state}')


def active_calls():
    """Llamadas en curso según la propia pasarela. Con el bearer privado."""
    script = (
        "const t=process.env.ZADARMA_GATEWAY_TOKEN;"
        "fetch('http://127.0.0.1:9093/health',{headers:{Authorization:'Bearer '+t},"
        "signal:AbortSignal.timeout(5000)})"
        ".then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})"
        ".then(d=>console.log(JSON.stringify({active:d.activeCalls,status:d.status})))"
        ".catch(e=>{console.log(JSON.stringify({error:e.message}));process.exitCode=1})"
    )
    try:
        return json.loads(node_eval(script, env_file=True))
    except subprocess.CalledProcessError as error:
        return {'error': error.stdout.strip() or 'health check failed'}


def extract(bundle):
    stage = Path(tempfile.mkdtemp(prefix='vendrava-testcall-'))
    with tarfile.open(bundle) as tar:
        for member in tar.getmembers():
            name = Path(member.name)
            if not (member.isfile() or member.isdir()) or name.is_absolute() or '..' in name.parts:
                sys.exit(f'Entrada peligrosa en el paquete: {member.name}')
        tar.extractall(stage)
    manifest = stage / 'MANIFEST.sha256'
    if not manifest.exists():
        sys.exit('El paquete no trae MANIFEST.sha256.')
    for line in manifest.read_text().splitlines():
        # sha256sum usa « *» en Git Bash (binario) y «  » en Linux.
        if len(line) < 67 or line[64] != ' ' or line[65] not in (' ', '*'):
            sys.exit('Formato de MANIFEST.sha256 no válido.')
        digest, relative = line[:64], line[66:]
        relative_path = Path(relative)
        if relative_path.is_absolute() or '..' in relative_path.parts:
            sys.exit(f'Ruta peligrosa en el manifiesto: {relative}')
        target = stage / relative_path
        if not target.is_file():
            sys.exit(f'Falta {relative} declarado en el manifiesto.')
        if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
            sys.exit(f'Checksum distinto en {relative}: el paquete llegó corrupto.')
    print(f'Manifiesto verificado: {len(manifest.read_text().splitlines())} ficheros.')
    return stage


def check_syntax(stage):
    for path in sorted(stage.rglob('*.js')):
        run([str(NODE), '--check', str(path)])
    print('node --check: correcto en todos los .js del paquete.')


def plan_files(stage):
    """(origen, destino) de cada fichero compilado que se sustituye."""
    pairs = []
    for source in sorted((stage / 'dist').rglob('*.js')):
        pairs.append((source, DIST / source.relative_to(stage / 'dist')))
    pairs.append((stage / 'prisma' / 'schema.prisma', GATEWAY / 'prisma' / 'schema.prisma'))
    return pairs


def backup(pairs, client_dir):
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    destination = BACKUPS / f'testcall-{stamp}'
    destination.mkdir(mode=0o700, parents=True)
    saved = []
    for index, (_, target) in enumerate(pairs):
        if target.exists():
            copy = destination / f'{index:02d}-{target.name}'
            shutil.copy2(target, copy)
            saved.append((copy, target))
    if client_dir.exists():
        for name in ('index.js', 'edge.js', 'default.js', 'wasm.js', 'index-browser.js', 'package.json', 'schema.prisma'):
            source = client_dir / name
            if source.exists():
                copy = destination / f'client-{name}'
                shutil.copy2(source, copy)
                saved.append((copy, source))
    print(f'Copia de seguridad: {destination} ({len(saved)} ficheros)')
    return destination, saved


def restore(saved, created):
    for copy, target in saved:
        shutil.copy2(copy, target)
    # Los ficheros que antes no existían (servicios nuevos) se retiran: dejarlos
    # sueltos no rompe nada, pero el VPS debe quedar como estaba.
    for path in created:
        path.unlink(missing_ok=True)
    print(f'Restaurado el estado anterior: {len(saved)} ficheros repuestos, {len(created)} nuevos retirados.')


def install_prisma_client(stage, client_dir):
    """El runtime nuevo consulta `prisma.voiceTestNumber`, un modelo que el
    cliente instalado todavía no conoce. Se prefiere regenerar con la CLI; si no
    está, se sustituyen los ficheros generados —JavaScript independiente de
    plataforma— conservando el motor de consultas Linux que ya hay."""
    cli = GATEWAY / 'node_modules' / 'prisma' / 'build' / 'index.js'
    if cli.exists():
        run([str(NODE), str(cli), 'generate', f'--schema={GATEWAY / "prisma" / "schema.prisma"}'],
            cwd=str(GATEWAY), env={**os.environ, 'PRISMA_HIDE_UPDATE_MESSAGE': '1'})
        print('Cliente Prisma regenerado con la CLI del propio VPS.')
        return
    bundled = json.loads((stage / 'BUNDLE.json').read_text())['prismaClientVersion']
    installed = json.loads((GATEWAY / 'node_modules' / '@prisma' / 'client' / 'package.json').read_text())['version']
    if installed != bundled:
        raise RuntimeError(f'Sin CLI de Prisma y las versiones no coinciden (VPS {installed}, paquete {bundled}). '
                           'No se sustituye el cliente a ciegas.')
    for source in sorted((stage / 'prisma-client').iterdir()):
        shutil.copy2(source, client_dir / source.name)
    print(f'Cliente Prisma sustituido fichero a fichero (v{installed}); el motor de consultas no se toca.')


def verify_model():
    script = (
        "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();"
        "if(!p.voiceTestNumber){console.log('SIN_MODELO');process.exit(1);}"
        "Promise.all([p.voiceTestNumber.count(),p.call.count({where:{isTest:true}})])"
        ".then(([n,t])=>console.log(JSON.stringify({voiceTestNumbers:n,testCalls:t})))"
        ".catch(e=>{console.log('ERROR '+(e.code||e.message));process.exitCode=1})"
        ".finally(()=>p.$disconnect())"
    )
    return node_eval(script, env_file=True)


def verify_units():
    for service in SERVICES:
        unit = Path(f'/etc/systemd/system/{service}.service')
        if unit.exists():
            run(['systemd-analyze', 'verify', str(unit)])
    print('systemd-analyze verify: unidades correctas.')


def postflight():
    for attempt in range(10):
        health = active_calls()
        if health.get('status') == 'listening' and isinstance(health.get('active'), int):
            break
        time.sleep(1)
    else:
        raise RuntimeError('La pasarela no volvió a responder tras el reinicio.')
    print(f'Pasarela tras reiniciar: {health}')
    for service in SERVICES + UNTOUCHED:
        state = subprocess.run(['systemctl', 'is-active', service], capture_output=True, text=True).stdout.strip()
        print(f'  {service}: {state}')
        if service in SERVICES and state != 'active':
            raise RuntimeError(f'{service} no está activo tras el despliegue.')
        if service in UNTOUCHED and state != 'active':
            print(f'  AVISO: {service} no está activo y este despliegue no debía afectarle.')
    registrations = subprocess.run(['asterisk', '-rx', 'pjsip show registrations'], capture_output=True, text=True)
    print(registrations.stdout.strip() or 'No se pudo consultar PJSIP.')
    errors = subprocess.run(
        ['journalctl', '-u', 'vendrava-zadarma', '-u', 'vendrava-call-worker', '--since', '-2min', '-p', 'err', '--no-pager'],
        capture_output=True, text=True).stdout.strip()
    print('journalctl (errores, 2 min): ' + (errors or 'ninguno'))


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    bundle = Path(sys.argv[1])
    if not bundle.is_file():
        sys.exit(f'No existe el paquete {bundle}')

    preflight()
    health = active_calls()
    if health.get('status') != 'listening' or health.get('active') != 0:
        sys.exit(f'No se ha confirmado una pasarela disponible con cero llamadas: {health}')
    print('Pasarela viva y con cero llamadas activas.')

    stage = extract(bundle)
    check_syntax(stage)
    pairs = plan_files(stage)
    client_dir = GATEWAY / 'node_modules' / '.prisma' / 'client'
    destination, saved = backup(pairs, client_dir)
    # Prisma generate puede modificar más ficheros que el listado habitual.
    # Preservar todo el cliente permite revertir también ese caso.
    full_client_backup = destination / 'prisma-client-complete'
    shutil.copytree(client_dir, full_client_backup)

    created = [target for _, target in pairs if not target.exists()]
    stopped = False
    gateway_stopped = False
    try:
        # Evitar que procesos en ejecución carguen módulos parcialmente actualizados.
        run(['systemctl', 'stop', 'vendrava-call-worker'])
        stopped = True
        health = active_calls()
        if health.get('status') != 'listening' or health.get('active') != 0:
            raise RuntimeError(f'Hay actividad o no se puede comprobar: {health}')
        run(['systemctl', 'stop', 'vendrava-zadarma'])
        gateway_stopped = True
        for source, target in pairs:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            os.chmod(target, 0o644)
        print(f'Instalados {len(pairs)} ficheros ({len(created)} nuevos).')
        install_prisma_client(stage, client_dir)
        for source, target in pairs:
            if target.suffix == '.js':
                run([str(NODE), '--check', str(target)])
        model = verify_model()
        if 'SIN_MODELO' in model or model.startswith('ERROR'):
            raise RuntimeError(f'El cliente Prisma sigue sin servir: {model}')
        print(f'Cliente Prisma correcto: {model}')
        verify_units()
        run(['systemctl', 'daemon-reload'])
        for service in SERVICES:
            run(['systemctl', 'start', service])
            print(f'{service} arrancado.')
        postflight()
    except Exception as error:                                  # noqa: BLE001
        # Si abortamos antes de parar la pasarela, no interrumpir una llamada
        # que haya comenzado durante el preflight.
        if gateway_stopped:
            for service in SERVICES:
                subprocess.run(['systemctl', 'stop', service], check=False)
            restore(saved, created)
            client_dir.rename(destination / 'prisma-client-failed')
            shutil.copytree(full_client_backup, client_dir)
        if stopped:
            for service in SERVICES:
                subprocess.run(['systemctl', 'start', service], check=False)
        sys.exit(f'FALLO: archivos anteriores restaurados; comprobar servicios. {error}')
    print(f'TESTCALL_INSTALADO backup={destination}')
    print('Asterisk, nginx y sprintmarkt-crm no se han reiniciado.')


if __name__ == '__main__':
    main()
