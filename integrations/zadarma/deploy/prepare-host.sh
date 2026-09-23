#!/bin/sh
# Install a private Node runtime. Does not replace any system runtime or CRM.
set -eu
NODE_VERSION=22.23.2
NODE_SHA=d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307
test "$(id -u)" = 0
install -d -m 755 /opt/vendrava
if ! test -x /opt/vendrava/node-v${NODE_VERSION}-linux-x64/bin/node; then
  archive=$(mktemp /opt/vendrava/node-download.XXXXXX)
  trap 'rm -f "$archive"' EXIT
  curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
    "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o "$archive"
  printf '%s  %s\n' "$NODE_SHA" "$archive" | sha256sum -c -
  tar -xJf "$archive" -C /opt/vendrava --no-same-owner
fi
id vendrava >/dev/null 2>&1 || useradd --system --home-dir /opt/vendrava --shell /usr/sbin/nologin vendrava
/opt/vendrava/node-v${NODE_VERSION}-linux-x64/bin/node --version
