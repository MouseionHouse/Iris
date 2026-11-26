#!/usr/bin/env bash
# A throwaway Synapse with MSC4140 (delayed events) switched on, for test/e2e-schedule/run.mjs.
#
#   test/e2e-schedule/synapse.sh up     # start it on http://localhost:8448, register alice and bob
#   test/e2e-schedule/synapse.sh down   # stop it and delete its data
#
# DATA (default ~/.cache/build/iris/e2e-schedule-synapse) holds its config and database.
set -euo pipefail

IMAGE=matrixdotorg/synapse:v1.165.0
NAME=iris-e2e-schedule-synapse
PORT=${PORT:-8448}
DATA=${DATA:-$HOME/.cache/build/iris/e2e-schedule-synapse}
SECRET=iris-e2e-schedule

case "${1:-}" in
up)
  mkdir -p "$DATA"
  if [ ! -f "$DATA/homeserver.yaml" ]; then
    docker run --rm -v "$DATA:/data" -e SYNAPSE_SERVER_NAME=localhost \
      -e SYNAPSE_REPORT_STATS=no -e UID="$(id -u)" -e GID="$(id -g)" "$IMAGE" generate
    cat >>"$DATA/homeserver.yaml" <<EOF

# test/e2e-schedule
registration_shared_secret: "$SECRET"
max_event_delay_duration: 7d
rc_message:
  per_second: 1000
  burst_count: 1000
rc_login:
  address: { per_second: 1000, burst_count: 1000 }
  account: { per_second: 1000, burst_count: 1000 }
  failed_attempts: { per_second: 1000, burst_count: 1000 }
rc_delayed_event_mgmt:
  per_second: 1000
  burst_count: 1000
# test/e2e-app/showcase-seed.mjs: an application service may send as any user, with a set
# timestamp (?user_id=…&ts=…), so the README pictures show the same times on every run
app_service_config_files: [/data/showcase-appservice.yaml]
EOF
    cat >"$DATA/showcase-appservice.yaml" <<EOF
id: iris-showcase
url: null
as_token: iris-showcase-as
hs_token: iris-showcase-hs
sender_localpart: showcase-seed
rate_limited: false
namespaces:
  users: [{ exclusive: false, regex: '@.*:localhost' }]
  aliases: [{ exclusive: false, regex: '#showcase-.*:localhost' }]
EOF
  fi
  docker run -d --name "$NAME" -v "$DATA:/data" -p "127.0.0.1:$PORT:8008" \
    -e UID="$(id -u)" -e GID="$(id -g)" "$IMAGE" >/dev/null
  for _ in $(seq 60); do
    curl -fs "http://localhost:$PORT/_matrix/client/versions" >/dev/null && break
    sleep 1
  done
  for user in alice bob; do
    docker exec "$NAME" register_new_matrix_user -u "$user" -p "$user-password" --no-admin \
      -k "$SECRET" http://localhost:8008 2>&1 | grep -v "already taken" || true
  done
  curl -fs "http://localhost:$PORT/_matrix/client/versions" |
    grep -o '"org.matrix.msc4140":[a-z]*'
  ;;
down)
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  # the files belong to this user (UID/GID above), so no root is needed
  rm -rf "$DATA"
  ;;
*)
  echo "usage: $0 up|down" >&2
  exit 2
  ;;
esac
