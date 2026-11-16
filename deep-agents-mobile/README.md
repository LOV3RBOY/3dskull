# Deep Agents Mobile

A phone app (installable PWA) for [LangChain Deep Agents](https://docs.langchain.com/oss/python/deepagents/overview).
The agent plans with a to-do list, reads and writes files in its own workspace,
reads web pages, optionally searches the web, and delegates to sub-agents.

- **Frontend:** `index.html`, a single page with no build step. It works on iPhone and Android and can be added to the home screen.
- **Backend:** `api/chat.py`, a Python serverless function on Vercel that runs `deepagents.create_deep_agent` and streams progress as NDJSON.
- **Your data stays on your phone.** Chats, the agent's files and your API keys live in the browser's local storage. Keys go to the server only with each request, and the server never stores them.

## Deploy (from your phone)

1. Open <https://vercel.com/new> and sign in with GitHub.
2. Import the `3dskull` repository.
3. Under **Root Directory**, choose `deep-agents-mobile`. Leave Framework Preset as **Other**.
4. Tap **Deploy**. No environment variables are needed.
5. Open the URL Vercel gives you.

## Install on your home screen

- **iPhone (Safari):** Share, then **Add to Home Screen**.
- **Android (Chrome):** ⋮, then **Install app**.

## First run

Open **Settings** (gear icon) and complete these steps:

1. Pick **Anthropic** or **OpenAI** and a model.
2. Paste your API key from <https://console.anthropic.com/settings/keys> or <https://platform.openai.com/api-keys>.
3. Optional: add a free [Tavily](https://app.tavily.com) key to turn on web search.

## Features

| | |
|---|---|
| Planning | Live plan bar showing the agent's `write_todos` list and progress |
| Files | Every file the agent writes, viewable, copyable and shareable or downloadable |
| Sub-agents | `task` calls shown inline. Tap any step to see its input and result |
| Web | `fetch_url` always on. `web_search` turns on when a Tavily key is set |
| Chats | Multiple conversations, each with its own files and plan, saved on the device |
| Offline | The app shell opens offline. Running the agent needs a connection |

## Limits

- A single agent turn can run for up to 300 seconds, the Vercel function limit set in `vercel.json`.
- There is no shell or code execution. The agent's filesystem is virtual and kept per chat.

## Local development

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt uvicorn
uvicorn api.chat:app --reload   # API at http://127.0.0.1:8000/api/chat
```
