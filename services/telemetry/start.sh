#!/bin/sh
set -eu

umask 027
mkdir -p /var/data
chown 1000:1000 /var/data
chmod 0750 /var/data
exec su-exec 1000:1000 /otelcol-contrib "$@"
