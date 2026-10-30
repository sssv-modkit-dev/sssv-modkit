#!/bin/sh
# POSIX entry point; Python owns argument parsing and rendering.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if command -v python3 >/dev/null 2>&1; then
    exec python3 "$script_dir/make_release_banner.py" "$@"
fi
exec python "$script_dir/make_release_banner.py" "$@"
