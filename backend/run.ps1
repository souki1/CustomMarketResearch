# Run backend (no Redis/Celery - uses asyncio for 5 concurrent scrapes)
# Run from backend folder: .\run.ps1

$env:PYTHONDONTWRITEBYTECODE = "1"
$env:PYTHONUNBUFFERED = "1"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Remove leftover bytecode caches (Python / IDE imports can recreate them)
Get-ChildItem -Path $ScriptDir -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Starting uvicorn backend..." -ForegroundColor Cyan
python -B -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
