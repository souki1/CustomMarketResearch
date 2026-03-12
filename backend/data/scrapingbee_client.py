"""ScrapingBee web scraping API client."""

import logging

import httpx

SCRAPINGBEE_API_URL = "https://app.scrapingbee.com/api/v1"
logger = logging.getLogger(__name__)

# Wait 4 seconds for page to load before AI extraction (JS, dynamic content)
PAGE_WAIT_MS = 4000


async def scrape_url_with_ai_extraction(
    api_key: str,
    url: str,
    ai_query: str,
    *,
    premium_proxy: bool = True,
) -> dict | None:
    """
    Scrape a URL and extract structured data using ScrapingBee AI query.
    Uses premium proxy and wait time for better success on difficult sites.
    ai_query: natural language description of what to extract.
    Returns extracted data as dict (partial OK), or None on failure.
    """
    if not api_key:
        raise ValueError("SCRAPINGBEE_API_KEY is required")
    if not ai_query or not ai_query.strip():
        return None
    params: dict = {
        "api_key": api_key,
        "url": url,
        "ai_query": ai_query.strip(),
        "premium_proxy": "true" if premium_proxy else "false",
        "wait": str(PAGE_WAIT_MS),
        "wait_browser": "load",
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.get(SCRAPINGBEE_API_URL, params=params)
            resp.raise_for_status()
            text = resp.text
            if not text or not text.strip().startswith("{"):
                return None
            data = resp.json()
            if isinstance(data, dict) and data:
                return data
            return None
    except Exception as e:
        msg = str(e)
        if "401" in msg or "UNAUTHORIZED" in msg:
            msg = "401 UNAUTHORIZED – check SCRAPINGBEE_API_KEY is valid at https://app.scrapingbee.com/"
        elif "api_key=" in msg:
            msg = "API error (key redacted)"
        logger.warning("ScrapingBee scrape failed for %s: %s", url[:80], msg)
        return None
