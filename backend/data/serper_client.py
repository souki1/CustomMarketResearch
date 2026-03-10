"""Serper.dev Google Search API client."""

import httpx

SERPER_SEARCH_URL = "https://google.serper.dev/search"


async def search_serper(api_key: str, query: str, num: int = 10) -> dict:
    """
    Perform a Google search via Serper.dev API.
    Returns the raw API response with 'organic' results containing 'link' URLs.
    """
    if not api_key:
        raise ValueError("SERPER_API_KEY is required")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            SERPER_SEARCH_URL,
            headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
            json={"q": query, "num": num},
        )
        resp.raise_for_status()
        return resp.json()


def extract_organic_results_from_serper_response(data: dict) -> list[dict]:
    """
    Extract full organic results from Serper response.
    Each item has: title, link, snippet, position.
    """
    results: list[dict] = []
    organic = data.get("organic") or []
    for item in organic:
        link = item.get("link")
        if not link or not isinstance(link, str):
            continue
        results.append({
            "title": item.get("title") or "",
            "link": link,
            "snippet": item.get("snippet") or "",
            "position": item.get("position"),
        })
    return results
