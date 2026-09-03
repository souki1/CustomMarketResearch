"""Firecrawl web scraping API client."""

import asyncio
import logging
import random
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

from config import get_settings

FIRECRAWL_EXTRACT_URL = "https://api.firecrawl.dev/v2/extract"
logger = logging.getLogger(__name__)

POLL_FIRST_WAIT = 1.5
POLL_INTERVAL = 2.0
POLL_TIMEOUT = 120.0
MAX_START_ATTEMPTS = 3
MIN_START_INTERVAL = 0.55
MAX_START_INTERVAL = 2.0
RATE_LIMIT_WAIT_CAP = 8.0
RETRYABLE_STATUSES = {408, 429, 500, 502, 503, 504}

_extract_sema: asyncio.Semaphore | None = None
_start_lock = asyncio.Lock()
_last_start_monotonic = 0.0
_start_interval = MIN_START_INTERVAL
_cooldown_until = 0.0
_http_client: httpx.AsyncClient | None = None
_http_client_lock = asyncio.Lock()


def _max_concurrency() -> int:
    try:
        n = int(get_settings().firecrawl_max_concurrency)
    except Exception:
        n = 4
    return max(1, min(n, 8))


def _extract_semaphore() -> asyncio.Semaphore:
    global _extract_sema
    if _extract_sema is None:
        _extract_sema = asyncio.Semaphore(_max_concurrency())
    return _extract_sema


async def _shared_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        return _http_client
    async with _http_client_lock:
        if _http_client is None or _http_client.is_closed:
            _http_client = httpx.AsyncClient(timeout=30.0)
    return _http_client


def _retry_after_seconds(response: httpx.Response | None, *, cap: float) -> float:
    if response is not None:
        raw = response.headers.get("Retry-After")
        if raw:
            try:
                return min(max(float(raw), 0.4), cap)
            except ValueError:
                try:
                    when = parsedate_to_datetime(raw)
                    if when.tzinfo is None:
                        when = when.replace(tzinfo=timezone.utc)
                    delay = (when - datetime.now(timezone.utc)).total_seconds()
                    return min(max(delay, 0.4), cap)
                except (TypeError, ValueError, OverflowError):
                    pass
    return min(1.5 + random.random(), cap)


def _note_rate_limit(response: httpx.Response | None) -> float:
    """One shared cooldown so a 429 does not stall every in-flight URL separately."""
    global _cooldown_until, _start_interval
    delay = _retry_after_seconds(response, cap=RATE_LIMIT_WAIT_CAP)
    until = time.monotonic() + delay
    if until > _cooldown_until:
        _cooldown_until = until
    _start_interval = min(max(_start_interval * 1.25, MIN_START_INTERVAL), MAX_START_INTERVAL)
    return delay


def _note_start_success() -> None:
    global _start_interval
    _start_interval = max(MIN_START_INTERVAL, _start_interval * 0.94)


async def _wait_for_cooldown() -> None:
    while True:
        remaining = _cooldown_until - time.monotonic()
        if remaining <= 0:
            return
        await asyncio.sleep(min(remaining, 0.2))


async def _pace_extract_start() -> None:
    """Space out new extract jobs; also waits out a shared 429 cooldown."""
    global _last_start_monotonic
    await _wait_for_cooldown()
    async with _start_lock:
        await _wait_for_cooldown()
        wait = _start_interval - (time.monotonic() - _last_start_monotonic)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_start_monotonic = time.monotonic()


async def _post_extract_once(
    client: httpx.AsyncClient,
    payload: dict,
    headers: dict[str, str],
) -> httpx.Response:
    """Start one extract job. Releases the concurrency slot before any 429 wait."""
    async with _extract_semaphore():
        await _pace_extract_start()
        return await client.request("POST", FIRECRAWL_EXTRACT_URL, json=payload, headers=headers)


def _extracted_payload(status_data: dict) -> dict | None:
    extracted = status_data.get("data")
    if isinstance(extracted, dict) and extracted:
        return extracted
    if isinstance(extracted, list) and extracted and isinstance(extracted[0], dict):
        return extracted[0]
    return None


async def scrape_url_with_ai_extraction(
    api_key: str,
    url: str,
    ai_query: str,
) -> dict | None:
    """
    Scrape a URL and extract structured data using Firecrawl extract API.
    Extract is async: we start the job, then poll until completed.
    The start semaphore is released after POST so many jobs can poll in parallel.
    429s use a short shared cooldown so the next URL is not blocked for minutes.
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
        client = await _shared_http_client()
        job_id = None
        last_error: Exception | None = None
        for attempt in range(MAX_START_ATTEMPTS):
            try:
                resp = await _post_extract_once(client, payload, headers)
            except httpx.TransportError as exc:
                last_error = exc
                await asyncio.sleep(min(0.8 * (attempt + 1), 3.0))
                continue

            if resp.status_code == 429:
                delay = _note_rate_limit(resp)
                last_error = httpx.HTTPStatusError(
                    f"{resp.status_code} {resp.reason_phrase}",
                    request=resp.request,
                    response=resp,
                )
                logger.info(
                    "Firecrawl rate limited starting extract, cooling down %.1fs then continuing",
                    delay,
                )
                await _wait_for_cooldown()
                continue

            if resp.status_code in RETRYABLE_STATUSES:
                last_error = httpx.HTTPStatusError(
                    f"{resp.status_code} {resp.reason_phrase}",
                    request=resp.request,
                    response=resp,
                )
                await asyncio.sleep(min(1.0 * (attempt + 1), 4.0))
                continue

            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, dict) or not data.get("success"):
                return None
            job_id = data.get("id")
            if not job_id:
                return None
            _note_start_success()
            break

        if not job_id:
            if last_error is not None:
                raise last_error
            return None

        status_url = f"https://api.firecrawl.dev/v2/extract/{job_id}"
        elapsed = 0.0
        await asyncio.sleep(POLL_FIRST_WAIT)
        elapsed += POLL_FIRST_WAIT
        while elapsed <= POLL_TIMEOUT:
            try:
                status_resp = await client.request("GET", status_url, headers=headers)
            except httpx.TransportError:
                await asyncio.sleep(POLL_INTERVAL)
                elapsed += POLL_INTERVAL
                continue

            if status_resp.status_code == 429:
                delay = _note_rate_limit(status_resp)
                logger.info(
                    "Firecrawl rate limited while polling, cooling down %.1fs",
                    delay,
                )
                await _wait_for_cooldown()
                elapsed += delay
                continue

            if status_resp.status_code in RETRYABLE_STATUSES:
                await asyncio.sleep(POLL_INTERVAL)
                elapsed += POLL_INTERVAL
                continue

            status_resp.raise_for_status()
            status_data = status_resp.json()
            if not isinstance(status_data, dict):
                return None
            status = status_data.get("status")
            if status == "completed":
                return _extracted_payload(status_data)
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
    return None
