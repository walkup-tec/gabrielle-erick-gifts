#!/bin/bash
# EasyPanel recreates Swarm services in VIP mode. On this VPS the VIP is
# unreachable from Traefik (502). DNSRR makes the service name resolve to
# the task IP. This loop restores DNSRR whenever EasyPanel resets it.
set -eu
SERVICE="${GABRIELLE_SWARM_SERVICE:-gabrielle_gabrielle}"

while true; do
  if docker service inspect "$SERVICE" >/dev/null 2>&1; then
    mode="$(docker service inspect "$SERVICE" --format '{{.Spec.EndpointSpec.Mode}}' 2>/dev/null || true)"
    if [ "$mode" != "dnsrr" ]; then
      echo "$(date -Is) ${SERVICE} mode=${mode:-unknown} -> dnsrr"
      docker service update --endpoint-mode dnsrr --detach=true "$SERVICE" >/dev/null
    fi
  fi
  sleep 8
done
