"""Deep Agents Mobile - serverless backend.

POST /api/chat streams newline-delimited JSON events while a LangChain
Deep Agent (planning, virtual filesystem, sub-agents) works on the request.

The caller supplies its own model API key on every request. The server never
stores keys, chats or files: the phone keeps the conversation and the agent's
virtual filesystem, and sends them back with each turn.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from langchain.agents.middleware import TodoListMiddleware
from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, AIMessageChunk, ToolMessage
from langchain_core.tools import tool

from deepagents import create_deep_agent

APP_VERSION = "1.0.0"
TOOL_OUTPUT_LIMIT = 4000
FETCH_LIMIT = 20000

SYSTEM_PROMPT = """You are a Deep Agent running inside a mobile app on the user's phone.

How to work:
- For any task with more than two steps, plan it first with `write_todos` and keep the list updated as you go.
- Save substantial deliverables (reports, code, drafts, research notes) as files in the virtual filesystem, then tell the user the file name. The user can open every file from the Files panel.
- Delegate self-contained research or sub-problems to sub-agents with the `task` tool when that keeps your own context clean.
- Use `fetch_url` to read web pages{search_hint}.
- There is no shell in this app: do not call `execute`.

How to reply:
- The user reads on a small screen. Keep chat replies short and scannable: short paragraphs, bullet lists, no wide tables.
- Use Markdown.
"""

app = FastAPI(title="Deep Agents Mobile", version=APP_VERSION)


# --------------------------------------------------------------------------- tools


def _html_to_text(html: str) -> str:
    html = re.sub(r"(?is)<(script|style|noscript|svg|head)[^>]*>.*?</\1>", " ", html)
    html = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h[1-6]|tr|section|article)>", "\n", html)
    text = re.sub(r"<[^>]+>", " ", html)
    for ent, ch in (("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'")):
        text = text.replace(ent, ch)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()


@tool
def fetch_url(url: str) -> str:
    """Download a web page (http or https) and return its readable text, truncated to about 20,000 characters."""
    if not url.startswith(("http://", "https://")):
        return "Error: url must start with http:// or https://"
    try:
        resp = httpx.get(
            url,
            follow_redirects=True,
            timeout=20,
            headers={"User-Agent": "Mozilla/5.0 (compatible; DeepAgentsMobile/1.0)"},
        )
    except httpx.HTTPError as exc:
        return f"Error fetching {url}: {exc}"
    ctype = resp.headers.get("content-type", "")
    body = resp.text
    if "html" in ctype:
        body = _html_to_text(body)
    if len(body) > FETCH_LIMIT:
        body = body[:FETCH_LIMIT] + "\n\n[truncated]"
    return f"HTTP {resp.status_code} {url}\n\n{body}"


def _make_search_tool(tavily_key: str):
    @tool
    def web_search(query: str, max_results: int = 5) -> str:
        """Search the web. Returns titles, URLs and short content snippets for the top results."""
        try:
            resp = httpx.post(
                "https://api.tavily.com/search",
                json={"query": query, "max_results": max(1, min(max_results, 10))},
                headers={"Authorization": f"Bearer {tavily_key}"},
                timeout=30,
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            return f"Search failed: {exc}"
        results = resp.json().get("results", [])
        if not results:
            return "No results."
        return "\n\n".join(
            f"{i}. {r.get('title', '')}\n{r.get('url', '')}\n{(r.get('content') or '')[:600]}"
            for i, r in enumerate(results, 1)
        )

    return web_search


# --------------------------------------------------------------------------- agent


def build_model(provider: str, model: str, api_key: str):
    kwargs: dict[str, Any] = {"api_key": api_key}
    if provider == "anthropic":
        kwargs["max_tokens"] = 16000
    return init_chat_model(f"{provider}:{model}", **kwargs)


def build_agent(provider: str, model: str, api_key: str, tavily_key: str | None):
    tools = [fetch_url]
    if tavily_key:
        tools.append(_make_search_tool(tavily_key))
    middleware = [] if "codex" in model else [TodoListMiddleware()]
    prompt = SYSTEM_PROMPT.format(
        search_hint=" and `web_search` to find sources" if tavily_key else " (web search is off: no search key is set)"
    )
    return create_deep_agent(
        model=build_model(provider, model, api_key),
        tools=tools,
        system_prompt=prompt,
        middleware=middleware,
    )


# --------------------------------------------------------------------------- helpers


def _text_of(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
        return "".join(parts)
    return ""


def _jsonable(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))


def _event(kind: str, **data: Any) -> str:
    return json.dumps({"type": kind, **data}, default=str) + "\n"


def _clean_history(raw: Any) -> list[dict[str, str]]:
    out = []
    for m in raw if isinstance(raw, list) else []:
        role = m.get("role") if isinstance(m, dict) else None
        content = m.get("content") if isinstance(m, dict) else None
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            out.append({"role": role, "content": content})
    return out


def _clean_files(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    files = {}
    for path, data in raw.items():
        if not isinstance(path, str) or not isinstance(data, dict):
            continue
        content = data.get("content")
        if isinstance(content, list):
            content = "\n".join(str(x) for x in content)
        if not isinstance(content, str):
            continue
        files[path] = {
            "content": content,
            "encoding": data.get("encoding", "utf-8"),
            "created_at": data.get("created_at", ""),
            "modified_at": data.get("modified_at", ""),
        }
    return files


async def run_agent_stream(agent, messages, files, todos):
    """Yield NDJSON event lines for one agent turn."""
    state: dict[str, Any] = {"messages": messages, "files": files}
    if todos:
        state["todos"] = todos
    try:
        async for mode, chunk in agent.astream(
            state, stream_mode=["updates", "messages"], config={"recursion_limit": 250}
        ):
            if mode == "messages":
                msg, meta = chunk
                ns = meta.get("langgraph_checkpoint_ns", "") or ""
                # Only stream tokens from the main agent's own model calls.
                if isinstance(msg, AIMessageChunk) and meta.get("langgraph_node") == "model" and "|" not in ns:
                    text = _text_of(msg.content)
                    if text:
                        yield _event("token", text=text)
                continue

            for node, update in (chunk or {}).items():
                if not isinstance(update, dict):
                    continue
                for msg in update.get("messages") or []:
                    if isinstance(msg, AIMessage):
                        text = _text_of(msg.content)
                        if text:
                            yield _event("ai", text=text)
                        for call in msg.tool_calls or []:
                            yield _event("tool_start", id=call.get("id"), name=call.get("name"), args=_jsonable(call.get("args", {})))
                    elif isinstance(msg, ToolMessage):
                        content = _text_of(msg.content) or str(msg.content)
                        if len(content) > TOOL_OUTPUT_LIMIT:
                            content = content[:TOOL_OUTPUT_LIMIT] + "\n[truncated]"
                        yield _event("tool_end", id=msg.tool_call_id, name=msg.name, content=content, error=getattr(msg, "status", "") == "error")
                if "todos" in update and update["todos"] is not None:
                    yield _event("todos", todos=_jsonable(update["todos"]))
                if update.get("files"):
                    yield _event("files", files=_jsonable(update["files"]))
        yield _event("done")
    except Exception as exc:  # surface model/auth errors to the phone
        yield _event("error", message=f"{type(exc).__name__}: {exc}")


# --------------------------------------------------------------------------- routes


@app.get("/api/chat")
async def health():
    return {"ok": True, "app": "deep-agents-mobile", "version": APP_VERSION}


@app.post("/api/chat")
async def chat(request: Request):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Request body must be JSON."}, status_code=400)

    provider = body.get("provider", "anthropic")
    model = (body.get("model") or "").strip()
    api_key = (body.get("apiKey") or "").strip()
    tavily_key = (body.get("tavilyKey") or "").strip() or None
    if provider not in ("anthropic", "openai"):
        return JSONResponse({"error": "provider must be 'anthropic' or 'openai'."}, status_code=400)
    if not model or not api_key:
        return JSONResponse({"error": "Add your API key and model in Settings."}, status_code=400)

    messages = _clean_history(body.get("messages"))
    if not messages or messages[-1]["role"] != "user":
        return JSONResponse({"error": "The last message must be from the user."}, status_code=400)

    try:
        agent = build_agent(provider, model, api_key, tavily_key)
    except Exception as exc:
        return JSONResponse({"error": f"Could not start the agent: {exc}"}, status_code=400)

    todos = body.get("todos") if isinstance(body.get("todos"), list) else None
    return StreamingResponse(
        run_agent_stream(agent, messages, _clean_files(body.get("files")), todos),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
