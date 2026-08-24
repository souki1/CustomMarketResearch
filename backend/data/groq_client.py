"""Groq client for cleaning structured data using Llama models via the official Groq SDK."""

import json
import logging

from groq import AsyncGroq

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "llama-3.3-70b-versatile"

_AI_MODE_SYSTEM: dict[str, tuple[str, float]] = {
    "chat": (
        "You are a helpful AI assistant inside InteligentResearch. You help with research, "
        "procurement context, summarizing findings, and clear explanations. Be concise unless "
        "the user asks for detail. Do not invent facts; say when you are uncertain.",
        0.7,
    ),
    "summarize": (
        "Summarize the user's text clearly and concisely. Use short paragraphs or bullet "
        "points when helpful. Capture the main ideas without adding new claims.",
        0.3,
    ),
    "rewrite": (
        "Rewrite the user's text to be clearer and more professional while preserving meaning. "
        "Fix grammar and flow. Return only the rewritten text unless they ask for alternatives.",
        0.4,
    ),
    "brainstorm": (
        "Generate practical, creative ideas based on the user's topic. Use bullet points. "
        "Be specific and actionable; avoid generic filler.",
        0.9,
    ),
    "report": (
        "Generate professional, factual reports from provided procurement/research context. "
        "Use only provided data, clearly separate facts from assumptions, and avoid unverifiable claims. "
        "Structure output so it is easy to parse into sections.",
        0.3,
    ),
}


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
        client = AsyncGroq(api_key=api_key)
        data_str = json.dumps(raw_data, default=str) if isinstance(raw_data, dict) else str(raw_data)
        collected: list[str] = []
        stream = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": CLEAN_SYSTEM},
                {"role": "user", "content": f"Clean this data:\n{data_str}"},
            ],
            temperature=1,
            max_completion_tokens=1024,
            top_p=1,
            stream=True,
            stop=None,
        )
        async for chunk in stream:
            collected.append(chunk.choices[0].delta.content or "")
        text = "".join(collected).strip()
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


_MAX_CONTEXT_CHARS = 14_000


async def groq_assistant_chat(
    api_key: str,
    *,
    mode: str,
    user_message: str,
    history: list[tuple[str, str]],
    model: str = DEFAULT_MODEL,
    max_completion_tokens: int = 2048,
    context: str | None = None,
) -> str | None:
    """
    General-purpose chat / tools via Groq (streaming aggregated to a single string).
    `history` is (role, content) pairs with role in user|assistant.
    Optional `context` is appended to the system prompt (truncated) for grounded replies.
    """
    if not api_key or not user_message.strip():
        return None
    spec = _AI_MODE_SYSTEM.get(mode)
    if not spec:
        return None
    system_prompt, temperature = spec
    ctx = (context or "").strip()
    if ctx:
        if len(ctx) > _MAX_CONTEXT_CHARS:
            ctx = ctx[: _MAX_CONTEXT_CHARS - 1] + "…"
        system_prompt = (
            f"{system_prompt}\n\n--- Structured research data (JSON; use when relevant; "
            "do not invent fields not present) ---\n"
            f"{ctx}"
        )
    try:
        client = AsyncGroq(api_key=api_key)
        messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
        for role, content in history[-24:]:
            if role not in ("user", "assistant") or not content.strip():
                continue
            messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_message.strip()})
        collected: list[str] = []
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_completion_tokens=max_completion_tokens,
            top_p=1,
            stream=True,
            stop=None,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            collected.append(chunk.choices[0].delta.content or "")
        return "".join(collected).strip() or None
    except Exception as e:
        logger.warning("Groq assistant chat failed: %s", e)
        return None
