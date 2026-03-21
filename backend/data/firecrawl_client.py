"""Firecrawl web scraping API client."""

import asyncio
import logging

import httpx

FIRECRAWL_EXTRACT_URL = "https://api.firecrawl.dev/v2/extract"
logger = logging.getLogger(__name__)

POLL_INTERVAL = 2.0
POLL_TIMEOUT = 120.0


async def scrape_url_with_ai_extraction(
    api_key: str,
    url: str,
    ai_query: str,
) -> dict | None:
    """
    Scrape a URL and extract structured data using Firecrawl extract API.
    Extract is async: we start the job, then poll until completed.
    ai_query: natural language description of what to extract.
    Returns extracted data as dict (partial OK), or None on failure.
    """
    if not api_key:
        raise ValueError("FIRECRAWL_API_KEY is required")
    if not ai_query or not ai_query.strip():
        return None
    payload = {
        "urls": [url],
        "prompt": ai_query.strip(),
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                FIRECRAWL_EXTRACT_URL, json=payload, headers=headers
            )
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, dict) or not data.get("success"):
                return None
            job_id = data.get("id")
            if not job_id:
                return None

            # Poll for completion
            status_url = f"https://api.firecrawl.dev/v2/extract/{job_id}"
            elapsed = 0.0
            while elapsed < POLL_TIMEOUT:
                status_resp = await client.get(status_url, headers=headers)
                status_resp.raise_for_status()
                status_data = status_resp.json()
                if not isinstance(status_data, dict):
                    return None
                status = status_data.get("status")
                if status == "completed":
                    extracted = status_data.get("data")
                    if isinstance(extracted, dict) and extracted:
                        return extracted
                    if (
                        isinstance(extracted, list)
                        and extracted
                        and isinstance(extracted[0], dict)
                    ):
                        return extracted[0]
                    return None
                if status in ("failed", "cancelled"):
                    return None
                await asyncio.sleep(POLL_INTERVAL)
                elapsed += POLL_INTERVAL
    except Exception as e:
        msg = str(e)
        if "401" in msg or "UNAUTHORIZED" in msg:
            msg = "401 UNAUTHORIZED – check FIRECRAWL_API_KEY is valid at https://firecrawl.dev/"
        elif "api_key" in msg.lower() or "bearer" in msg.lower():
            msg = "API error (key redacted)"
        logger.warning("Firecrawl scrape failed for %s: %s", url[:80], msg)
        return None
