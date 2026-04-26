#!/usr/bin/env bash

# ORBIT-X 6.3 - Global Environment Startup (macOS / Linux)

echo "==================================================="
echo "[SYSTEM] BOOTING ORBIT-X HYBRID EDGE CONSOLE..."
echo "[SYSTEM] CHECKING GLOBAL ENVIRONMENT DEPENDENCIES..."
echo "==================================================="

# Ensure node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[SYSTEM] First boot detected. Installing Node dependencies..."
    npm install
fi

# Find Python 3 robustly
PY_CMD=""

if command -v python3 &> /dev/null && python3 -c 'import sys; exit(0 if sys.version_info.major==3 else 1)' &> /dev/null; then
    PY_CMD="python3"
elif command -v python &> /dev/null && python -c 'import sys; exit(0 if sys.version_info.major==3 else 1)' &> /dev/null; then
    PY_CMD="python"
fi

if [ -z "$PY_CMD" ]; then
    echo "[SYSTEM] WARNING: Python 3 not detected safely. Falling back to default python..."
    PY_CMD="python" # Fallback
fi

echo "[SYSTEM] Ensuring AI dependencies are installed using: $PY_CMD"
$PY_CMD -m pip install -r ai_service/requirements.txt -q

echo "==================================================="
echo "[SYSTEM] INITIALIZING UI AND AI DAEMON..."
echo "==================================================="

npm start

echo ""
echo "[SYSTEM] Application closed or crashed."
read -p "Press any key to continue..."
