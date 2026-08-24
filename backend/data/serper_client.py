"""Serper.dev Google Search API client."""

import httpx

SERPER_SEARCH_URL = "https://google.serper.dev/search"
SERPER_LOCATIONS_URL = "https://google.serper.dev/locations"

_LOCATION_TYPE_RANK = {
    "Postal Code": 0,
    "City": 1,
    "Municipality": 2,
    "County": 3,
    "State": 4,
    "Country": 5,
}


async def resolve_serper_location(query: str, api_key: str = "") -> tuple[str | None, str | None]:
    """
    Map a ZIP or address fragment to Serper's canonical location string.
    Returns (canonical_name, country_code) or (None, None) if lookup fails.
    """
    q = (query or "").strip()
    if not q:
        return None, None
    headers: dict[str, str] = {}
    if api_key:
        headers["X-API-KEY"] = api_key
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                SERPER_LOCATIONS_URL,
                params={"q": q, "limit": 8},
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return None, None
    if not isinstance(data, list):
        return None, None
    ranked: list[tuple[int, dict]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        target = str(item.get("targetType") or "")
        ranked.append((_LOCATION_TYPE_RANK.get(target, 9), item))
    if not ranked:
        return None, None
    ranked.sort(key=lambda row: row[0])
    best = ranked[0][1]
    canonical = best.get("canonicalName") or best.get("name")
    country = best.get("countryCode")
    canonical_s = str(canonical).strip() if canonical else ""
    country_s = str(country).strip().lower() if country else ""
    return (canonical_s or None, country_s or None)


async def search_serper(
    api_key: str,
    query: str,
    num: int = 10,
    *,
    location: str | None = None,
    gl: str | None = None,
) -> dict:
    """
    Perform a Google search via Serper.dev API.
    Returns the raw API response with 'organic' results containing 'link' URLs.
    """
    if not api_key:
        raise ValueError("SERPER_API_KEY is required")
    payload: dict[str, object] = {"q": query, "num": num}
    loc = (location or "").strip()
    if loc:
        payload["location"] = loc[:300]
    country = (gl or "").strip().lower()
    if country and len(country) == 2 and country.isalpha():
        payload["gl"] = country
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            SERPER_SEARCH_URL,
            headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
            json=payload,
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
