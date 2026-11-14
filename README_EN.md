# Reasoning Canvas

A local web app with a node canvas (ComfyUI-style) for long reasoning sessions with LLMs. Each **Chat Node** is a question–answer dialogue with a model, saved to a plain Markdown file. A **Lens Node** compresses one or more such dialogues into a compact **Digest**, which then feeds new Chat Nodes. This lets you branch your reasoning and carry only the essence from one dialogue to another.

All data is plain `.md` files in the project folder: you can read them without the app, keep them in git, copy and move them.

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Working with the canvas](#working-with-the-canvas)
- [Project format on disk](#project-format-on-disk)
- [Models and key safety](#models-and-key-safety)
- [Architecture](#architecture)
- [HTTP API](#http-api)
- [Development and tests](#development-and-tests)
- [Project documentation](#project-documentation)

## Features

- **Chat Node** — a dialogue with an LLM; every question and answer is appended to the Dialogue File immediately. The model can be changed at any point in the chat. Answers stream in; questions and answers render as Markdown, and the chat does not auto-scroll when an answer arrives.
- **System Prompt** — a text attached to a Chat Node (the gear ⚙ between Fork and the trash; it is green while the text is not empty). It is placed before every question in the request to the LLM, but is not shown in the history and is not part of the question; it can be changed at any time, applies to the following questions and is counted by the Token Meter.
- **Lens Node** in two kinds:
  - **Exact Lens Node** — you fill in the four sections of the "Context Handoff Questionnaire" yourself;
  - **Auto Lens Node** — the sections are filled in by **Extraction** (a separate model with a configurable Extraction Prompt), after which you can edit them by hand.
- **Digest** — the result of a Run: compressed context of a given size (**Compression Target** — a percentage of the input or an explicit token count, passed to the model as a soft target). The Digest is shown as Markdown; a click switches it to text mode for editing right in the node (changes are saved automatically).
- **Token Meter** — a vertical "glass" with a green→red gradient showing how full the context is relative to the model's **Context Limit**. It uses real `usage` data from the API response, and an estimate before sending. The limit never blocks a request.
- **Edge State** — the colour of a link shows whether the nodes agree: white — not used yet, green — consistent, red — something changed afterwards (a signal only; nothing is re-run automatically).
- **Node Defaults** — the gear ⚙ after each node type in Node Search sets what all *new* nodes of that type start with in the project: for a Chat Node, the model and System Prompt; for an Exact Lens Node, the model and Compression Target; for an Auto Lens Node, the Run model, Extraction Model, Extraction Prompt and Compression Target. Changes are saved at once.
- **Fork** — a new Chat Node with a copy of the questions, answers and System Prompt in its input field (you can edit them and pick another model).
- **Remove / Restore** — removing a node from the canvas (the trash in the node or the `Delete` key) does not delete its file. The node comes back with the links recorded in its file: via `Ctrl+Z` right after removal or via the API (`GET /restorable`, `POST /restorable/:id/restore`); there is no separate Restore menu in the UI.
- **Undo / Redo** — `Ctrl+Z`, `Ctrl+Shift+Z` / `Ctrl+Y` for canvas layout and structure.
- **Pin colours**: an input pin takes the colour of its own link (white, green, red); without links it is white. The interface palette is a neutral grey canvas, with nodes and panels in a blue accent and green links.
- **Any OpenAI-compatible model**: OpenAI, OpenRouter, Gemini (via the OpenAI-compatible endpoint), Ollama, LM Studio, etc.
- **Interface settings** (Display Settings): window margins, font, interface scale 70–500 %.

## Quick start

### Requirements

- Node.js (a current LTS version) and npm.

### Install and run

```bash
npm install
npm run build      # build the frontend (vite build → dist/)
npm start          # start the server
```

Open <http://127.0.0.1:3100>. Change the port with the `PORT` variable:

```bash
PORT=4000 npm start
```

The server listens on `127.0.0.1` only — the app is meant for local use, with no accounts and no hosting.

### Development mode

In two terminals:

```bash
npm run dev:server   # server with auto-restart (tsx watch)
npm run dev:web      # Vite dev server for the frontend (proxies /api/ to 127.0.0.1:3100)
```

### First steps in the app

1. Open the **Sidebar** (left panel) → **Models** (Model Panel, opens in a browser tab) and add a model: base URL, API key, model name, Context Limit.
2. In the Sidebar choose or create a **Project** — a folder on disk (there is a built-in folder browser and a list of recent projects).
3. Right-click an empty spot on the canvas → **Canvas Menu** → "Create node" → **Node Search** → create a Chat Node: the chosen type hangs on the cursor, a left click puts the node down, `Esc` or a right click cancels. (The gear ⚙ next to a node type opens [Node Defaults](#node-defaults) — the model and other settings for future nodes of that type.)
4. Ask a question. Create a Lens Node, drag a link from the Chat Node to the Lens Node, press **Run** — you get a Digest.
5. Create a new Chat Node and drag a link from the Lens Node to it: the Digest is sent to the model together with the first question.

## How it works

### Graph: Chat → Lens → Chat

| Link | Allowed | Condition |
|---|---|---|
| Chat Node → Lens Node | yes | at any time; a link added after a Run stays white and can be deleted |
| Lens Node → Chat Node | yes | the Lens Node must have a Digest; and only before the Chat Node's first question |
| Chat → Chat | **no** | — |
| Lens → Lens | **no** | — |

Inputs and outputs are unlimited: one Lens Node can read several chats, one output can feed many nodes. A link that has already "passed information" (Lens → Chat after the first question, Chat → Lens whose chat was included in a Run) cannot be deleted — it shows where the information came from. Other links are removed by selecting them and pressing `Delete` (with Undo available).

### Chat Node

- The System Prompt (see [Features](#features)) is recorded in the Dialogue File as service information before every question and in the header, so Restore brings it back.
- The only input is Digests from Lens Nodes. Input slots (**Input Slot**) appear one at a time: once one is filled, a new one appears below; the first question closes them.
- Digests enter the context **once, with the first question**, and are recorded in the Dialogue File as part of the history (see [ADR-0002](docs/adr/0002-digest-recorded-in-chat-and-no-lock.md)); they are not reloaded afterwards.
- The file's technical header and service information are never sent to the LLM — only questions, answers and Digests.
- An LLM call error is shown to the user, is not written to the file as an answer, and the typed question is not lost.

### Lens Node

- Its input is the dialogues (questions and answers only) of all connected Chat Nodes as one block under `### nodeN` headings, plus the Handoff Questionnaire and Compression Target.
- **Run** is an explicit action; nothing runs automatically. A repeated Run overwrites the single Digest (there is no version history).
- Only structural errors (no inputs / no model) block a Run, never context size.
- **Auto Lens Node** additionally has **Extraction**: the dialogues + Extraction Prompt are sent to the Extraction Model, and the answer is split into the four sections (overwriting them entirely). Such a node has two Token Meters: on the left for the Extraction Model, on the right for the Lens Node itself. An Exact Lens Node has one Token Meter (on the left, counting what goes into the input), while the right edge shows the Digest size in tokens (expected from the Compression Target before a Run, actual after).

The node's delete button (trash) is in the top row for the Lens Node as for the Chat Node; deletion asks for confirmation and the node's file is kept.

The four sections of the Handoff Questionnaire: *Project Scope & Objective*, *Established Rules & Constraints*, *Discarded Ideas & Solved Blockers*, *Current Artifacts & State*.

### Node Defaults

The gear ⚙ after each type in Node Search opens the default settings for that type; clicking the name itself still creates a node.

| Type | What is configured |
|---|---|
| Chat Node | model, System Prompt |
| Exact Lens Node | model, Compression Target (percent or tokens) |
| Auto Lens Node | Run model, Extraction Model, Extraction Prompt, Compression Target |

- The settings window saves changes at once (no "Save" button); `Esc` or "← Back" returns to Node Search; "Restore built-in values" resets the settings to the built-in ones.
- The settings belong to the **project** (stored in `canvas.json`, separately for each type), not to the browser or the program; `Undo` does not revert them.
- They only affect nodes created through Node Search after the change. Existing nodes, Fork and Restore take values from the source node or file.
- The Extraction Prompt from the settings becomes the starting text of new Auto Lens Nodes, and it is what the "Reset prompt" button in the node returns to; until it is set, the built-in text applies.
- An unset setting or a deleted model simply leaves the field empty in the new node, without an error.

### Edge State

- **Chat → Lens**: white — the Lens Node has not been Run yet; green — the Run used the chat as it is now; red — something was added to the chat after the Run.
- **Lens → Chat**: white — the first question has not yet taken the Digest; green — the Digest recorded in the chat matches the current one; red — they differ.

## Working with the canvas

- **Creating a node**: right-click an empty spot → Canvas Menu → Node Search; the chosen node hangs on the cursor (by its top-left corner) until a left click puts it down; the gear ⚙ next to a type opens Node Defaults.
- **Standard Size**: all nodes have one size, proportional to the browser window (minus the four Window Margins). The size cannot be changed by hand; a button in the Sidebar applies the current size to all nodes at once ([ADR-0003](docs/adr/0003-one-node-size-and-zoom-floor-at-focus.md)).
- **Focus**: double-click a node — the view centres on it, the zoom becomes **Focus Zoom**, and the cursor goes to the first input field.
- **Focus Zoom**: the maximum canvas zoom; nodes are "working" only at this zoom. At smaller zoom nodes are inert: they can be moved, connected and focused. You can zoom out to 1/10 of Focus Zoom.
- **Sidebar** (collapsible; the state is remembered in the browser): change project, Models (Model Panel), Display Settings, "Standard Size for all nodes".
- **Display Settings**: window margins (0–40 % per side), font, Interface Scale (70–500 %). Stored in the browser, not in the project.

## Project format on disk

A Project is a folder with `canvas.json` and node files:

```
my-project/
├── canvas.json        # layout, links and Node Defaults (the main source of truth for the live graph)
├── chats/             # Chat Node Dialogue Files: node1.md, node3.md, …
├── exact-lenses/      # Exact Lens Node Digests
└── auto-lenses/       # Auto Lens Node Digests
```

- All nodes are named `nodeN` from a single running counter; numbers are **never reused**, even after a node is deleted.
- A node file starts with a technical header (model, creation time, links, etc.), followed by the content: for a chat, alternating `## Question` / `## Answer` blocks (files from older versions with `## Вопрос` / `## Ответ` are still read); for a Lens Node, the Handoff Questionnaire sections and `## Digest`.
- While a node is on the canvas, `canvas.json` takes precedence over the links recorded in the node file. A mismatch shows a warning on load.
- Every change is written immediately (write-through), so closing the browser loses nothing.
- File formats are encapsulated in `src/server/nodeFile.ts`.

## Models and key safety

- Models belong to the **program**, not the project: they are stored in `models.json` in the repository root and are available in all projects. The list of recent projects is in `recent-projects.json`.
- Both files are listed in `.gitignore`, so keys do not end up in git along with dialogues. The directory can be overridden with the `RC_CONFIG_DIR` variable.
- The browser **never receives API keys**: the HTTP API returns only a "keyless" view of models.
- Only the OpenAI-compatible Chat Completions API is supported (the native Anthropic and Gemini APIs are not used).

Model record format:

```json
{
  "models": [
    {
      "id": "model1",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
      "apiKey": "…",
      "modelName": "gemini-3.5-flash-lite",
      "contextLimit": 128000
    }
  ]
}
```

This file is normally created through the Model Panel; no manual editing is needed.

## Architecture

A local Node.js + TypeScript server (Fastify) and a React frontend on React Flow (`@xyflow/react`). There is no database — storage is Markdown files.

```
src/
├── server/
│   ├── main.ts           # entry point, port, config directory
│   ├── app.ts            # Fastify app and all HTTP routes
│   ├── projectStore.ts   # opening a project, canvas.json, issuing nodeN names
│   ├── nodeFile.ts       # parsing and serialising the .md formats
│   ├── graphRules.ts     # pure link rules
│   ├── graphService.ts   # creating/removing nodes and links, Fork
│   ├── nodeDefaults.ts   # Node Defaults: read, write, apply to a new node
│   ├── chatNode.ts       # questions, answers, streaming, chat Token Meter
│   ├── lensNode.ts       # settings, Run, Extraction, Lens Node Token Meter
│   ├── extraction.ts     # Extraction prompt and parsing
│   ├── edgeState.ts      # link colours
│   ├── restore.ts        # Restore and mismatch warnings
│   ├── modelStore.ts     # model registry (keys stay on the server)
│   ├── llmClient.ts      # OpenAI-compatible API client
│   ├── tokens.ts         # token estimation and usage accounting
│   ├── recentProjects.ts # recent projects list
│   └── fileLock.ts, errors.ts
└── web/
    ├── Markdown.tsx, SystemPromptButton.tsx, pinStates.ts
    ├── CanvasView.tsx, ChatNodeView.tsx, LensNodeView.tsx, NodeShell.tsx, PinEdge.tsx, RemoveNodeButton.tsx
    ├── ModelPanel.tsx, DisplaySettingsPanel.tsx, Sidebar.tsx, NodeSearch.tsx, NodeDefaultsPanel.tsx, FolderPicker.tsx
    ├── TokenMeter.tsx, api.ts, history.ts (Undo), canvasActions.ts, graphEvents.ts, displaySettings.ts, nodeSize.ts
    ├── acknowledgements.ts  # acknowledgements text shown on the start screen
    └── style.css
tests/   # Vitest: tests through the HTTP API
e2e/     # Playwright: scenarios in the real UI
```

Principles:

- **Node files are primary** ([ADR-0001](docs/adr/0001-node-files-are-primary.md)): removing from the canvas does not delete the file.
- **Deep modules** behind small interfaces; the single test seam is the server's HTTP API.
- The domain vocabulary is fixed in [`GLOSSARY.md`](GLOSSARY.md) and used verbatim in code and UI.

## HTTP API

Main routes (all under `/api`):

| Area | Routes |
|---|---|
| Project | `POST /project/open`, `GET /projects/recent`, `GET /canvas`, `GET /fs/list` |
| Node Defaults | `GET/PUT /node-defaults/:type` (`chat`, `exact-lens`, `auto-lens`) |
| Nodes | `POST /nodes`, `PUT /nodes/:id/position`, `PUT /nodes/:id/size`, `DELETE /nodes/:id`, `POST /nodes/:id/fork` |
| Links | `POST /edges`, `DELETE /edges/:id`, `GET /edges/states` |
| Restore | `GET /restorable`, `POST /restorable/:id/restore`, `GET /warnings` |
| Chat Node | `GET /nodes/:id/chat`, `PUT /nodes/:id/model`, `PUT /nodes/:id/system-prompt`, `POST /nodes/:id/tokens`, `POST /nodes/:id/messages`, `POST /nodes/:id/messages/stream` |
| Lens Node | `GET/PUT /nodes/:id/lens`, `PUT /nodes/:id/digest`, `GET /nodes/:id/lens/tokens`, `GET /nodes/:id/lens/extraction-tokens`, `POST /nodes/:id/extract`, `POST /nodes/:id/run` |
| Models | `GET/POST /models`, `GET/PUT/DELETE /models/:id` |

## Development and tests

| Command | What it does |
|---|---|
| `npm run check` | the main gate: glossary check → `tsc --noEmit` → `vite build` → `vitest run` |
| `npm test` | Vitest only |
| `npm run typecheck` | type check only |
| `npm run check:ui` | build + Playwright scenarios in a real browser |

- The `pre-commit` hook (`.githooks/`) runs `npm run check`; it is wired up automatically by `npm install` (the `prepare` script).
- Server tests go through the HTTP API with a temporary project folder and a fake OpenAI-compatible server (`tests/helpers/fakeLlm.ts`) that returns canned answers and records all requests. They check external effects: the answer, files on disk, the exact messages the "model" received.
- `scripts/check-glossary.mjs` catches forbidden synonyms (the `_Avoid_` lines in the glossary).
- `check:ui` needs Chromium once per machine: `npx playwright install chromium` (on Linux also `sudo npx playwright install-deps chromium`).

