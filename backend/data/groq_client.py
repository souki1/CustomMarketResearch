"""Groq client for cleaning structured data using Llama 3.3 70B (1,000 req/day, 12k TPM free tier)."""

import json
import logging

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_MODEL = "llama-3.3-70b-versatile"


def _fix_protocol_relative_urls(obj: dict) -> dict:
    """Fix protocol-relative URLs (//host) to https://."""
    result = {}
    for k, v in obj.items():
        if isinstance(v, str) and v.startswith("//"):
            result[k] = "https:" + v
        else:
            result[k] = v
    return result


CLEAN_SYSTEM = """You clean and normalize product/parts data extracted from web pages.
Return ONLY a valid JSON object. No markdown, no explanation, no code blocks.

Rules:
1. Use snake_case keys: product_image, product_description, vendor_name, price, product_details, delivery, location, contact
2. product_image: if array, use the first valid https URL; if string, use as-is; fix protocol-relative URLs (//host -> https://host)
3. product_description: if array, join with " | "; trim whitespace
4. price: preserve exactly as shown including currency symbol ($, €, £, etc.); if array, use first price string; remove if empty
5. product_details: keep as object; use snake_case keys; remove empty values
6. delivery, location, contact: omit if null or empty
7. Omit any key with null, empty string, or empty array"""


async def clean_structured_data(
    api_key: str,
    raw_data: dict,
    *,
    model: str = DEFAULT_MODEL,
) -> dict | None:
    """
    Send raw scraped data to Llama 3.3 70B via Groq and return cleaned JSON.
    Free tier: 1,000 requests/day, 12,000 tokens/minute.
    Returns None on failure.
    """
    if not api_key or not raw_data:
        return None
    try:
        client = AsyncOpenAI(api_key=api_key, base_url=GROQ_BASE_URL)
        data_str = json.dumps(raw_data, default=str) if isinstance(raw_data, dict) else str(raw_data)
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": CLEAN_SYSTEM},
                {"role": "user", "content": f"Clean this data:\n{data_str}"},
            ],
        )
        choice = resp.choices[0] if resp.choices else None
        if not choice or not choice.message or not choice.message.content:
            return None
        text = choice.message.content.strip()
        # Remove markdown code blocks if present
        if "```" in text:
            start = text.find("```")
            if text[start:].startswith("```json"):
                start += 7
            elif text[start:].startswith("```"):
                start += 3
            end = text.rfind("```")
            text = text[start:end].strip() if end > start else text[start:].strip()
        # Try to extract JSON object
        cleaned = None
        try:
            cleaned = json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            if start >= 0:
                depth, end_i = 0, start
                for i, c in enumerate(text[start:], start):
                    if c == "{":
                        depth += 1
                    elif c == "}":
                        depth -= 1
                        if depth == 0:
                            end_i = i
                            break
                try:
                    cleaned = json.loads(text[start : end_i + 1])
                except json.JSONDecodeError:
                    pass
        if isinstance(cleaned, dict) and cleaned:
            return _fix_protocol_relative_urls(cleaned)
        return None
    except Exception as e:
        logger.warning("Groq/Llama clean failed: %s", e)
        return None
