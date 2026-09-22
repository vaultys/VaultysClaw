#!/usr/bin/env sh
# Retired entry point: the old agent-controller binary is no longer part of this project.
printf '%s\n' \
  'The legacy agent-controller installer has been retired.' \
  'For the control plane, clone https://github.com/vaultys/VaultysClaw and run ./quick-start.sh.' \
  'For the workload sensor, see vaultysclaw-sensor/ in that checkout.' >&2
exit 1
