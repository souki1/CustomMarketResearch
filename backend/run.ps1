# Run backend (no Redis/Celery - uses asyncio for 5 concurrent scrapes)
# Run from backend folder: .\run.ps1

$env:PYTHONDONTWRITEBYTECODE = "1"
$env:PYTHONUNBUFFERED = "1"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Starting uvicorn backend..." -ForegroundColor Cyan
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
