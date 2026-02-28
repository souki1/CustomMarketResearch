"""FastAPI app - run with: uvicorn main:app --reload"""

from fastapi import FastAPI

app = FastAPI(title="InteligentResearch API")


@app.get("/")
def root():
    return {"message": "InteligentResearch API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
