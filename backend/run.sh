#!/bin/sh
# Run backend without __pycache__ (PYTHONDONTWRITEBYTECODE=1)
# Run from backend folder: ./run.sh
export PYTHONDONTWRITEBYTECODE=1
export PYTHONUNBUFFERED=1
python -B -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
