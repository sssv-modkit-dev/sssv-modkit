#!/bin/sh
# POSIX entry point; Python owns argument parsing and rendering.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
for python_command in python3 python; do
    if command -v "$python_command" >/dev/null 2>&1; then
        exec "$python_command" "$script_dir/make_release_banner.py" "$@"
    fi
done
printf '%s\n' 'Python 3.8+ is required; install Python and retry.' >&2
exit 127
