"""Groq client for structured-data cleanup and in-app assistant chat."""

import json
import logging

from groq import AsyncGroq

from config import RETIRED_GROQ_MODELS

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "openai/gpt-oss-120b"
_FALLBACK_MODELS = ("openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b")


def _resolve_model(name: str) -> str:
    n = (name or "").strip()
    return RETIRED_GROQ_MODELS.get(n, n)


def _chat_model_candidates(requested: str) -> list[str]:
    out: list[str] = []
    for name in (_resolve_model(requested), *_FALLBACK_MODELS):
        n = (name or "").strip()
        if n and n not in out:
            out.append(n)
    return out


def _is_missing_model_error(exc: BaseException) -> bool:
    text = str(exc).lower()
    return (
        "model_not_found" in text
        or "does not exist" in text
        or "do not have access" in text
    )

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
    Send raw scraped data to Groq and return cleaned JSON.
    Free tier: 1,000 requests/day, 12,000 tokens/minute.
    Returns None on failure.
    """
    if not api_key or not raw_data:
        return None
    client = AsyncGroq(api_key=api_key)
    data_str = json.dumps(raw_data, default=str) if isinstance(raw_data, dict) else str(raw_data)
    last_error: Exception | None = None
    for candidate in _chat_model_candidates(model):
        try:
            collected: list[str] = []
            stream = await client.chat.completions.create(
                model=candidate,
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
            break
        except Exception as e:
            last_error = e
            if _is_missing_model_error(e):
                logger.warning("Groq model %s unavailable, trying next: %s", candidate, e)
                continue
            logger.warning("Groq clean failed: %s", e)
            return None
    else:
        logger.warning("Groq clean failed: %s", last_error)
        return None

    try:
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
        logger.warning("Groq clean parse failed: %s", e)
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
    client = AsyncGroq(api_key=api_key)
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for role, content in history[-24:]:
        if role not in ("user", "assistant") or not content.strip():
            continue
        messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_message.strip()})
    last_error: Exception | None = None
    for candidate in _chat_model_candidates(model):
        try:
            collected: list[str] = []
            stream = await client.chat.completions.create(
                model=candidate,
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
            last_error = e
            if _is_missing_model_error(e):
                logger.warning("Groq model %s unavailable, trying next: %s", candidate, e)
                continue
            logger.warning("Groq assistant chat failed: %s", e)
            return None
    logger.warning("Groq assistant chat failed: %s", last_error)
    return None
