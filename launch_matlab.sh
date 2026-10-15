#!/usr/bin/env bash
# Quick launcher for Uzhavan AI in MATLAB Desktop

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
MATLAB_BIN="/usr/local/MATLAB/R2026b/bin/matlab"

# Ensure Backend (Port 8000) is running
if ! curl -s http://localhost:8000/docs >/dev/null 2>&1; then
    echo "🌾 Starting Uzhavan AI Backend (port 8000)..."
    (cd "$DIR/backend" && python3 -m uvicorn main:app --port 8000 --host 0.0.0.0 >/dev/null 2>&1 &)
    sleep 1
fi

# Ensure Frontend (Port 3000) is running
if ! curl -s http://localhost:3000/ >/dev/null 2>&1; then
    echo "🌾 Starting Uzhavan AI Frontend (port 3000)..."
    (cd "$DIR" && npx vite --port 3000 --host 0.0.0.0 >/dev/null 2>&1 &)
    sleep 2
fi

echo "🌾 Launching Uzhavan AI inside MATLAB Desktop..."
if [ -f "$MATLAB_BIN" ]; then
    "$MATLAB_BIN" -desktop -r "cd('$DIR'); start_uzhavan_ai"
else
    matlab -desktop -r "cd('$DIR'); start_uzhavan_ai"
fi
