#!/usr/bin/env bash
# Pull and restart compose services, then remove the images they replaced.
# Copied from mouseion/common at da24f1a (v1.0.0); see action.yml.
# Env: INPUT_SERVICE (names split on space, comma, newline), INPUT_COMPOSE_FILE,
# INPUT_PULL ('false' skips the pull), INPUT_REPLACED_TAGS ('untagged' or 'same-repository'),
# INPUT_UP_ARGS (extra flags for `up -d`, split on whitespace).
set -euo pipefail

compose_file=${INPUT_COMPOSE_FILE:?compose-file is required}
read -r -a services <<< "$(tr ',\n' '  ' <<< "${INPUT_SERVICE:?service is required}")"
[[ ${#services[@]} -gt 0 ]] || { echo "service is empty" >&2; exit 1; }

replaced_tags=${INPUT_REPLACED_TAGS:-untagged}
case "$replaced_tags" in untagged | same-repository) ;; *) echo "replaced-tags: '$replaced_tags' is not untagged or same-repository" >&2; exit 1 ;; esac

# The repository part of an image reference: no digest, no tag.
repo_of() { local r=${1%%@*}; [[ "${r##*/}" == *:* ]] && r=${r%:*}; echo "$r"; }

read -r -a up_args <<< "${INPUT_UP_ARGS:-}"

compose() { docker compose -f "$compose_file" "$@"; }

# The image IDs the services' containers run now, running or stopped.
declare -A before=()
for svc in "${services[@]}"; do
  for cid in $(compose ps -aq "$svc"); do
    before[$(docker inspect -f '{{.Image}}' "$cid")]=1
  done
done

if [[ "${INPUT_PULL:-true}" != "false" ]]; then
  compose pull "${services[@]}"
fi
compose up -d "${up_args[@]}" "${services[@]}"

# The repositories the services' images now come from (for same-repository).
declare -A repos=()
for svc in "${services[@]}"; do
  for cid in $(compose ps -aq "$svc"); do
    repos[$(repo_of "$(docker inspect -f '{{.Config.Image}}' "$cid")")]=1
  done
done

# Image IDs still held by any container on the host.
declare -A used=()
for cid in $(docker ps -aq --no-trunc); do
  used[$(docker inspect -f '{{.Image}}' "$cid")]=1
done

# Remove only a replaced image that nothing uses and that carries no tag (with
# same-repository, no tag from outside the services' own repositories).
# A failure of `docker rmi` (a child image, a race) is reported and tolerated.
removed=0
for id in "${!before[@]}"; do
  if [[ -n "${used[$id]:-}" ]]; then
    echo "kept $id: still used by a container"
    continue
  fi
  tags=$(docker image inspect -f '{{join .RepoTags " "}}' "$id" 2>/dev/null) || { echo "gone $id"; continue; }
  foreign=
  for t in $tags; do
    if [[ "$replaced_tags" == untagged || -z "${repos[$(repo_of "$t")]:-}" ]]; then foreign=$foreign${foreign:+ }$t; fi
  done
  if [[ -n "$foreign" ]]; then
    echo "kept $id: tagged $foreign"
    continue
  fi
  # shellcheck disable=SC2086  # tags hold no spaces
  if docker rmi $tags "$id" > /dev/null 2>&1 || ! docker image inspect "$id" > /dev/null 2>&1; then
    echo "removed $id"
    removed=$((removed + 1))
  else
    echo "could not remove $id (left in place)"
  fi
done
echo "compose-deploy: ${#services[@]} service(s) up, $removed replaced image(s) removed"
