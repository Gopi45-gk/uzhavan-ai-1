#!/usr/bin/env bash
# Quick launcher for Uzhavan AI in MATLAB Desktop

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
MATLAB_BIN="/usr/local/MATLAB/R2026b/bin/matlab"

if [ -f "$MATLAB_BIN" ]; then
    echo "🌾 Launching Uzhavan AI inside MATLAB Desktop..."
    "$MATLAB_BIN" -desktop -r "cd('$DIR'); start_uzhavan_ai"
else
    echo "🌾 Launching using system matlab..."
    matlab -desktop -r "cd('$DIR'); start_uzhavan_ai"
fi
