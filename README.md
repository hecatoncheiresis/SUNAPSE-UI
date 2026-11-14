#  `SYNAPSE-UI`

**Synchronous Yielding Node Assistant with Persistent Storage and Exchange User Interface**

A local-first node-based web application (ComfyUI-style) for multi-stage reasoning with LLMs, structured context compression via Lens Nodes, and transparent storage in plain Markdown files.

[![Node.js](https://img.shields.io/badge/Node.js-LTS-339933?logo=node.js&logoColor=white)](#quick-start)
[![TypeScript](https://img.shields.io/badge/TypeScript-Fastify_%2B_React-3178C6?logo=typescript&logoColor=white)](#architecture)
[![React Flow](https://img.shields.io/badge/Canvas-@xyflow%2Freact-FF0072)](#working-with-the-canvas)
[![Storage](https://img.shields.io/badge/Storage-Plain_Markdown_(.md)-000000?logo=markdown&logoColor=white)](#project-format-on-disk)
[![API](https://img.shields.io/badge/LLM_API-OpenAI--Compatible-412991)](#models-and-key-safety)

[🇬🇧 English](#english) • [🇷🇺 Русский](#русский)

</div>

---

<a id="english"></a>

## 🇬🇧 English

### Overview

Long conversations with Large Language Models suffer from context bloat, noise accumulation, and attention degradation. **Reasoning Canvas** (`SYNAPSE-UI`) solves this by turning linear chats into a visual reasoning graph:

Chat Node ---→ Lens Node (Digest) ---→ Chat Node

Each **Chat Node** is a streaming question–answer dialogue persisted immediately to a plain `.md` file. Instead of dragging bloated chat histories forward, you pass dialogues through a **Lens Node** (`Exact Lens Node` or `Auto Lens Node`), distill them into a compact **Digest**, and feed only the verified essence into new branches of thought.

All project data lives on your disk as human-readable Markdown and JSON files in **write-through** mode—no database, no cloud accounts, and full compatibility with `git`, text editors, and external scripts.

---

### Key Features

#### 1. Chat & Branching (`Chat Node`)
* **Real-time Streaming & Markdown**: Responses stream in live and render as Markdown without forcing the viewport to auto-scroll. Every question and answer is appended immediately to `chats/nodeN.md`.
* **Switch Models Mid-Dialogue**: Change the active LLM at any point in the conversation via the bottom-right selector.
* **System Prompt (`⚙`)**: Attach a hidden system instruction to any `Chat Node` (located between `Fork` and the trash icon; turns **green** while non-empty). It is prepended to every request and counted by the `Token Meter`, while staying hidden from the chat history.
* **Dialogue Branching (`Fork`)**: Creates a new `Chat Node` pre-populated with a copy of the source node's questions, answers, and `System Prompt` in its input field so you can edit context, switch models, and explore alternative reasoning paths.

#### 2. Context Compression (`Exact Lens Node` & `Auto Lens Node`)
* **Context Handoff Questionnaire**: Both lens types structure context around four focused sections:
  1. *Project Scope & Objective*
  2. *Established Rules & Constraints*
  3. *Discarded Ideas & Solved Blockers*
  4. *Current Artifacts & State*
* **`Exact Lens Node`**: You fill in the four questionnaire sections manually and compress the connected chat(s) into a **Digest**.
* **`Auto Lens Node`**: Two-stage workflow:
  1. **`Extract`**: Uses a dedicated `Extraction Model` and customizable `Extraction Prompt` (`Reset prompt` restores defaults) to automatically populate all four questionnaire sections from connected dialogues, which you can then refine manually.
  2. **`Run` / `Re-Run`**: Compresses the structured state into a **Digest**.
* **`Compression Target` & Inline Digest Editing**: Define the desired output size as a percentage of input (`% of input`) or an explicit token count (`tokens`, passed as a soft target). Clicking a generated `Digest` switches it to plain-text mode for direct inline editing (saved automatically). Running a lens is always an explicit manual action (`Re-Run` overwrites the single Digest).

#### 3. Graph Rules & Visual Provenance (`Edge State`)
* **Strict Data Flow (`Chat → Lens → Chat`)**:
  * `Chat Node → Lens Node`: Allowed at any time. Multiple chats can feed a single lens (combined under `### nodeN` headings), and one chat can feed multiple lenses.
  * `Lens Node → Chat Node`: Allowed once the lens has a generated `Digest` and **before** the target chat sends its first question. Multiple `Input Slots` appear dynamically one by one and assemble Digests from top to bottom. Once the first question is sent, `Input Slots` close and Digests are permanently recorded in the chat history.
  * `Chat → Chat` and `Lens → Lens`: Disallowed (use a `Lens Node` or `Fork`).
* **`Edge State` Colour Semantics**:
  * ⚪ **White**: Connected, not yet processed (`Run` not executed on the lens, or first question not sent in the chat). Removable via `Delete`.
  * 🟢 **Green**: Consistent and active (`Digest` matches the upstream dialogue / ingested into the chat). Once a link has passed information, it cannot be deleted so reasoning provenance stays intact.
  * 🔴 **Red**: Upstream changed after sync (new messages added to the chat after `Run`, or `Digest` edited after the chat started). Acts as a visual signal only—nothing re-runs automatically.

#### 4. Token Accounting (`Token Meter`)
* A vertical gauge with a smooth green-to-red gradient tracks context fullness against the model's `Context Limit`.
* Displays a pre-send estimate before each request and updates with exact API `usage` metrics afterward.
* **Non-blocking**: Reaching or exceeding `100%` never blocks sending requests.
* `Exact Lens Node` has one `Token Meter` (left) plus a right-edge `Digest` token counter; `Auto Lens Node` has two `Token Meters` (left for `Extraction Model`, centre for `Run`) plus the right-edge `Digest` counter.

> [!TIP]
> When configuring a model's **Context Limit**, set it to the token range where the model maintains **full attention** rather than its absolute technical maximum—this yields noticeably deeper reasoning and pattern recognition.

#### 5. Canvas Ergonomics & Non-Destructive History
* **`Focus Zoom`**: Double-click a node to centre the camera, enter `Focus Zoom` (100% interactive mode), and place the cursor in the first input field. Zoom out down to `1/10` of `Focus Zoom` to pan, arrange nodes, and wire links in inert overview mode.
* **`Standard Size` & `Display Settings`**: All nodes share a uniform size proportional to your browser window (`Standard Size for all Nodes` in the `Sidebar`). Customize `Window Margins` (`0–40%`), `Font`, and `Interface Scale` (`70–500%`) in `Display Settings` (stored per browser).
* **Per-Project `Node Defaults`**: Click the gear icon (`⚙`) next to any node type in `Node Search` to configure default models, prompts, and compression targets for future nodes in the current project (`canvas.json`).
* **`Remove / Restore` & Undo/Redo**: Removing a node from the canvas (`Delete` or trash icon) preserves its `.md` file on disk. Restore it immediately with `Ctrl+Z` (or via the REST API).

---

### Quick Start

#### Requirements
* **Node.js** (current LTS release) and **npm**

#### Installation & Launch
```bash
npm install
npm run build      # build frontend assets (vite build → dist/)
npm start          # start local server on 127.0.0.1:3100
```

Open **<http://127.0.0.1:3100>** in your browser. To use a custom port:
```bash
PORT=4000 npm start
```

#### Development Mode
Run the backend watcher and Vite dev server in two terminals:
```bash
npm run dev:server   # Fastify server with auto-restart (tsx watch)
npm run dev:web      # Vite dev server (proxies /api/ to 127.0.0.1:3100)
```

#### First Steps in the App
1. Open the left **`Sidebar`** → **`Models`** (opens `Model Panel` in a new tab) and add an OpenAI-compatible provider (`Base URL`, `API Key`, `Model Name`, `Context Limit`).
2. Select or create a **`Project`** folder on disk (`Choose the project folder` → `Create project`).
3. Right-click (`RMB`) empty canvas space → **`Create node`** → **`Node Search`** → select **`Chat Node`** and left-click (`LMB`) to place it.
4. Double-click the node to focus, ask a question, then connect a **`Lens Node`** (`Exact` or `Auto`) and click **`Run`** to generate a **`Digest`**.
5. Wire the lens's **`Digest`** into a new **`Chat Node`** and ask your next question—the compressed context travels automatically with your first message.

---

### Mouse Controls & Keyboard Shortcuts

| Action / Shortcut | Effect |
| :--- | :--- |
| `RMB` on empty canvas | Open `Canvas Menu` (`Create node` → `Node Search`) |
| `LMB` on canvas (while placing) | Place the selected node at the cursor's top-left corner |
| `Esc` or `RMB` (while placing) | Cancel node creation |
| Double-click `LMB` on node | Centre viewport, enter `Focus Zoom`, and focus the first input field |
| Mouse wheel | Zoom from `1/10 Focus Zoom` (overview) to `100% Focus Zoom` (interactive) |
| `Delete` (node or white link selected) | Remove node from canvas (keeps `.md` file) or delete unused white link |
| `Ctrl + Z` | Undo last canvas layout/structure action (including node removal) |
| `Ctrl + Shift + Z` / `Ctrl + Y` | Redo undone canvas action |

---

### Project Format on Disk & Key Security

Every project is a self-contained directory written immediately on every change (**write-through**):

```text
my-project/
├── canvas.json        # Node positions, active links, and per-project Node Defaults
├── chats/             # Chat Node dialogue files (node1.md, node3.md, …)
├── exact-lenses/      # Exact Lens Node questionnaires and Digests
└── auto-lenses/       # Auto Lens Node extraction prompts, questionnaires, and Digests
```

* **Monotonic Naming**: Nodes are named `nodeN` from a single running counter; numbers are **never reused**, even after deletion.
* **Clean LLM Payloads**: Technical file headers and service metadata are never sent to the LLM—only questions, answers, System Prompts, and Digests.
* **Key Isolation**: Global model configurations live in `models.json` (and recent paths in `recent-projects.json`) in the repository root or `RC_CONFIG_DIR`. Both files are gitignored, and **API keys are never sent to the browser**.
* **Supported Providers**: Any OpenAI-compatible Chat Completions endpoint (OpenAI, OpenRouter, Gemini OpenAI endpoint, Ollama, LM Studio, llama.cpp, etc.).

---

### Architecture, API & Testing

<details>
<summary><strong>📁 Repository Structure</strong></summary>

```text
src/
├── server/               # Node.js + TypeScript + Fastify backend
│   ├── main.ts           # Entry point, port, config directory (RC_CONFIG_DIR)
│   ├── app.ts            # Fastify instance and HTTP routes
│   ├── projectStore.ts   # Project lifecycle, canvas.json, monotonic nodeN IDs
│   ├── nodeFile.ts       # Markdown (.md) parsing and write-through serialization
│   ├── graphRules.ts     # Pure graph connection validation rules
│   ├── graphService.ts   # Node/edge creation, deletion, and Fork
│   ├── nodeDefaults.ts   # Per-project Node Defaults management
│   ├── chatNode.ts       # Streaming chat execution and Token Meter accounting
│   ├── lensNode.ts       # Exact & Auto Lens Run, Extract, and token accounting
│   ├── extraction.ts     # Built-in Extraction Prompt and response parser
│   ├── edgeState.ts      # White / green / red Edge State computation
│   ├── restore.ts        # Node restoration and file/canvas mismatch warnings
│   ├── modelStore.ts     # Server-side model registry (keys stay off the client)
│   ├── llmClient.ts      # OpenAI-compatible Chat Completions client
│   └── tokens.ts, recentProjects.ts, fileLock.ts, errors.ts
└── web/                  # React + TypeScript + @xyflow/react frontend
    ├── CanvasView.tsx, ChatNodeView.tsx, LensNodeView.tsx, NodeShell.tsx, PinEdge.tsx
    ├── Sidebar.tsx, ModelPanel.tsx, DisplaySettingsPanel.tsx, NodeSearch.tsx, NodeDefaultsPanel.tsx
    ├── TokenMeter.tsx, Markdown.tsx, SystemPromptButton.tsx, FolderPicker.tsx
    └── api.ts, history.ts, canvasActions.ts, displaySettings.ts, nodeSize.ts, style.css
tests/                    # Vitest HTTP API integration tests (with fake OpenAI server)
e2e/                      # Playwright end-to-end browser tests
```
</details>

<details>
<summary><strong>🔌 Main HTTP API Routes (<code>/api</code>)</strong></summary>

| Domain | Endpoints |
| :--- | :--- |
| **Project & FS** | `POST /project/open`, `GET /projects/recent`, `GET /canvas`, `GET /fs/list` |
| **Node Defaults** | `GET / PUT /node-defaults/:type` (`chat`, `exact-lens`, `auto-lens`) |
| **Nodes** | `POST /nodes`, `PUT /nodes/:id/position`, `PUT /nodes/:id/size`, `DELETE /nodes/:id`, `POST /nodes/:id/fork` |
| **Links** | `POST /edges`, `DELETE /edges/:id`, `GET /edges/states` |
| **Restore** | `GET /restorable`, `POST /restorable/:id/restore`, `GET /warnings` |
| **Chat Node** | `GET /nodes/:id/chat`, `PUT /nodes/:id/model`, `PUT /nodes/:id/system-prompt`, `POST /nodes/:id/tokens`, `POST /nodes/:id/messages`, `POST /nodes/:id/messages/stream` |
| **Lens Node** | `GET / PUT /nodes/:id/lens`, `PUT /nodes/:id/digest`, `GET /nodes/:id/lens/tokens`, `GET /nodes/:id/lens/extraction-tokens`, `POST /nodes/:id/extract`, `POST /nodes/:id/run` |
| **Models** | `GET / POST /models`, `GET / PUT / DELETE /models/:id` |
</details>

#### Quality Gates & Commands
| Command | Description |
| :--- | :--- |
| `npm run check` | Full verification gate: glossary check → `tsc --noEmit` → `vite build` → `vitest run` |
| `npm test` | Run Vitest HTTP API integration tests |
| `npm run typecheck` | Run TypeScript compiler type check |
| `npm run check:ui` | Build frontend + run Playwright E2E browser scenarios |

* **Further Documentation**: [`GLOSSARY.md`](GLOSSARY.md) (ubiquitous domain language), [`CODING_STANDARDS.md`](CODING_STANDARDS.md), and [`docs/adr/`](docs/adr) (Architecture Decision Records).

---
---

<a id="русский"></a>

## 🇷🇺 Русский

### О проекте

При длинных диалогах с большими языковыми моделями (LLM) контекст разрастается, накапливается информационный шум и снижается качество внимания модели. **Reasoning Canvas** (`SYNAPSE-UI`) решает эту проблему, превращая линейную переписку в визуальный граф рассуждений:

$$\text{Chat Node} \longrightarrow \text{Lens Node (Digest)} \longrightarrow \text{Chat Node}$$

Каждый **Chat Node** — это потоковый диалог «вопрос–ответ», который мгновенно сохраняется в обычный `.md`-файл. Вместо того чтобы тащить за собой всю историю переписки, вы пропускаете диалоги через узел-линзу (**Lens Node**: `Exact Lens Node` или `Auto Lens Node`), сжимаете их в компактный **Digest** и передаёте в новые ветки рассуждений только проверенную суть.

Все данные проекта хранятся локально на диске в виде читаемых Markdown- и JSON-файлов в режиме мгновенной записи (**write-through**) — без баз данных, аккаунтов и привязки к облаку, с полной совместимостью с `git` и любыми текстовыми редакторами.

---

### Основные возможности

#### 1. Чаты и ветвление (`Chat Node`)
* **Потоковые ответы (Streaming) и Markdown**: ответы модели приходят в реальном времени и отображаются как Markdown без принудительной автопрокрутки ленты. Каждый вопрос и ответ сразу дописываются в `chats/nodeN.md`.
* **Смена модели на лету**: переключать активную LLM можно в любой момент прямо в процессе диалога через выпадающий список в правом нижнем углу ноды.
* **Системный промпт (`System Prompt`, `⚙`)**: скрытая инструкция для конкретной `Chat Node` (кнопка между `Fork` и корзиной; подсвечивается **зелёным**, пока текст не пуст). Подставляется перед каждым запросом и учитывается в `Token Meter`, но не загромождает историю сообщений.
* **Ветвление диалога (`Fork`)**: создаёт новую `Chat Node` с копией вопросов, ответов и `System Prompt` в поле ввода — удобно для редактирования контекста, смены модели и проверки альтернативных гипотез.

#### 2. Сжатие контекста (`Exact Lens Node` и `Auto Lens Node`)
* **Анкета передачи контекста (`Context Handoff Questionnaire`)**: оба типа линз структурируют контекст по четырём ключевым разделам:
  1. *Project Scope & Objective* — цель проекта и ожидаемый результат;
  2. *Established Rules & Constraints* — принятые правила, стек, архитектурные решения и ограничения;
  3. *Discarded Ideas & Solved Blockers* — отклонённые подходы и решённые проблемы;
  4. *Current Artifacts & State* — актуальные версии кода, схем данных и черновиков.
* **`Exact Lens Node` (Точная линза)**: вы вручную заполняете четыре раздела анкеты и сжимаете подключённые чаты в **Digest**.
* **`Auto Lens Node` (Автоматическая линза)**: двухэтапный сценарий работы:
  1. **`Extract`**: отдельная модель извлечения (`Extraction Model`) по настраиваемому шаблону (`Extraction Prompt`, кнопка `Reset prompt` возвращает исходный текст) автоматически заполняет все четыре раздела анкеты на основе диалогов, после чего их можно отредактировать вручную.
  2. **`Run` / `Re-Run`**: сжимает структурированную анкету в **Digest**.
* **`Compression Target` и ручная правка дайджеста**: целевой размер дайджеста задаётся в процентах от входа (`% of input`) или в явном количестве токенов (`tokens`, передаётся модели как мягкий ориентир). Клик по готовому `Digest` переводит его в режим текстового редактора для прямой правки внутри узла (сохраняется автоматически). Запуск линзы всегда выполняется вручную (`Re-Run` перезаписывает единственный Digest).

#### 3. Правила графа и цветовая индикация (`Edge State`)
* **Строгий поток данных (`Chat → Lens → Chat`)**:
  * `Chat Node → Lens Node`: разрешено в любой момент. Одна линза может принимать сразу несколько чатов (объединяются под заголовками `### nodeN`), а один чат может питать несколько линз.
  * `Lens Node → Chat Node`: разрешено, если у линзы уже сформирован `Digest` и **до** отправки первого вопроса в целевой чатовой ноде. Входные слоты (`Input Slot`) появляются по одному и объединяют дайджесты сверху вниз. После первого вопроса входные слоты закрываются, а дайджесты навсегда вшиваются в историю чата.
  * `Chat → Chat` и `Lens → Lens`: запрещены (используйте `Lens Node` или `Fork`).
* **Семантика цветов связей (`Edge State`)**:
  * ⚪ **Белая связь**: узел подключён, но данные ещё не переданы (`Run` в линзе не запускался или первый вопрос в чате ещё не отправлен). Белую связь можно удалить клавишей `Delete`.
  * 🟢 **Зелёная связь**: узлы согласованы (`Digest` соответствует текущему чату или уже принят чатом). Связь, по которой прошла информация, удалить нельзя — она фиксирует источник данных.
  * 🔴 **Красная связь**: после синхронизации исходные данные изменились (в чат добавили новые сообщения после `Run` или изменили `Digest` после старта чата). Это только визуальный сигнал — автоматический перезапуск не выполняется.

#### 4. Контроль контекста (`Token Meter`)
* Вертикальный индикатор с градиентом от зелёного к красному показывает заполнение контекста относительно `Context Limit` модели.
* До отправки запроса отображает предварительную оценку токенов, а после ответа API обновляется по точным данным `usage`.
* **Без блокировок**: достижение или превышение `100%` никогда не блокирует отправку новых запросов.
* У `Exact Lens Node` один `Token Meter` (слева) и счётчик токенов `Digest` справа; у `Auto Lens Node` два `Token Meter` (слева для `Extraction Model`, по центру для `Run`) и счётчик `Digest` справа.

> [!TIP]
> При настройке **Context Limit** для модели рекомендуется указывать не предельный технический объём окна, а диапазон токенов, в котором модель сохраняет **полное внимание** — именно в нём она лучше всего находит глубокие связи и закономерности.

#### 5. Эргономика холста и сохранность истории
* **`Focus Zoom`**: двойной клик по ноде центрирует экран, переводит масштаб в `Focus Zoom` (100% рабочий режим) и ставит курсор в первое поле ввода. При отдалении (до `1/10` от `Focus Zoom`) ноды переходят в инертный режим для удобного перемещения и соединения связями.
* **`Standard Size` и `Display Settings`**: все ноды имеют единый размер, пропорциональный окну браузера (кнопка `Standard Size for all Nodes` в `Sidebar`). Поля окна (`Window Margins`, `0–40%`), шрифт (`Font`) и масштаб интерфейса (`Interface Scale`, `70–500%`) настраиваются в `Display Settings` и сохраняются в браузере.
* **Настройки по умолчанию для проекта (`Node Defaults`)**: шестерёнка (`⚙`) рядом с типом узла в `Node Search` задаёт стартовые модели, промпты и параметры сжатия для всех новых нод этого типа в рамках проекта (`canvas.json`).
* **`Remove / Restore` и Undo/Redo**: удаление ноды с холста (`Delete` или корзина) не удаляет её `.md`-файл с диска. Вернуть ноду вместе со связями можно сразу через `Ctrl+Z` (или через REST API).

---

### Быстрый старт

#### Требования
* **Node.js** (актуальная LTS-версия) и **npm**

#### Установка и запуск
```bash
npm install
npm run build      # сборка фронтенда (vite build → dist/)
npm start          # запуск локального сервера на 127.0.0.1:3100
```

Откройте **<http://127.0.0.1:3100>** в браузере. Чтобы указать другой порт:
```bash
PORT=4000 npm start
```

#### Режим разработки
Запустите сервер и Vite dev-сервер в двух терминалах:
```bash
npm run dev:server   # сервер Fastify с автоперезапуском (tsx watch)
npm run dev:web      # Vite dev-сервер (проксирует /api/ на 127.0.0.1:3100)
```

#### Первые шаги в приложении
1. Откройте левую панель **`Sidebar`** → **`Models`** (`Model Panel` откроется в новой вкладке) и добавьте модель (`Base URL`, `API Key`, `Model Name`, `Context Limit`).
2. Выберите или создайте рабочую папку **`Project`** на диске (`Choose the project folder` → `Create project`).
3. Нажмите правую кнопку мыши (`RMB`) по пустому месту холста → **`Create node`** → **`Node Search`** → выберите **`Chat Node`** и разместите её левым кликом (`LMB`).
4. Двойным кликом сфокусируйтесь на ноде, задайте вопрос, затем подключите **`Lens Node`** (`Exact` или `Auto`) и нажмите **`Run`** для создания **`Digest`**.
5. Подключите выход линзы с готовым **`Digest`** ко входу новой **`Chat Node`** и задайте следующий вопрос — сжатый контекст автоматически уйдёт модели вместе с первым сообщением.

---

### Управление мышью и горячие клавиши

| Действие / Комбинация | Результат |
| :--- | :--- |
| `RMB` по пустому холсту | Открыть меню холста (`Canvas Menu` → `Create node` → `Node Search`) |
| `LMB` по холсту (при размещении) | Разместить выбранную ноду левым верхним углом в точке курсора |
| `Esc` или `RMB` (при размещении) | Отменить создание и размещение ноды |
| Двойной клик `LMB` по ноде | Центрировать камеру, включить `Focus Zoom` и поставить курсор в первое поле ввода |
| Колесо мыши | Масштабирование от `1/10 Focus Zoom` (обзор графа) до `100% Focus Zoom` (работа в нодах) |
| `Delete` (выделена нода / белая связь) | Удалить ноду с холста (файл `.md` остаётся на диске) или удалить неиспользованную белую связь |
| `Ctrl + Z` | Отменить последнее действие на холсте (включая возврат удалённой ноды со связями) |
| `Ctrl + Shift + Z` / `Ctrl + Y` | Повторить отменённое действие на холсте (Redo) |

---

### Формат проекта на диске и безопасность ключей

Каждый проект — это обычная папка, куда изменения записываются немедленно (**write-through**):

```text
my-project/
├── canvas.json        # Расположение нод, активные связи и проектные Node Defaults
├── chats/             # Файлы диалогов Chat Node (node1.md, node3.md, …)
├── exact-lenses/      # Анкеты и Digest'ы Exact Lens Node
└── auto-lenses/       # Промпты извлечения, анкеты и Digest'ы Auto Lens Node
```

* **Сквозная нумерация**: все узлы получают имена `nodeN` из единого счётчика; номера **никогда не переиспользуются**, даже после удаления ноды.
* **Чистый контекст для LLM**: технические заголовки файлов и служебная информация никогда не отправляются в модель — только вопросы, ответы, System Prompt и Digest'ы.
* **Изоляция API-ключей**: глобальные настройки моделей хранятся в `models.json` (а список недавних проектов — в `recent-projects.json`) в корне репозитория или в каталоге `RC_CONFIG_DIR`. Оба файла добавлены в `.gitignore`, а **API-ключи никогда не передаются в браузер**.
* **Поддерживаемые провайдеры**: любой OpenAI-совместимый Chat Completions API (OpenAI, OpenRouter, Gemini через OpenAI-совместимый endpoint, Ollama, LM Studio, llama.cpp и др.).

---

### Архитектура, API и тестирование

<details>
<summary><strong>📁 Структура репозитория</strong></summary>

```text
src/
├── server/               # Бэкенд на Node.js + TypeScript + Fastify
│   ├── main.ts           # Точка входа, порт, каталог конфигурации (RC_CONFIG_DIR)
│   ├── app.ts            # Экземпляр Fastify и все HTTP-маршруты
│   ├── projectStore.ts   # Открытие проекта, canvas.json, выдача имён nodeN
│   ├── nodeFile.ts       # Парсинг и сериализация Markdown-файлов (.md)
│   ├── graphRules.ts     # Чистые правила валидации связей графа
│   ├── graphService.ts   # Создание/удаление нод и связей, Fork
│   ├── nodeDefaults.ts   # Проектные настройки по умолчанию (Node Defaults)
│   ├── chatNode.ts       # Потоковые диалоги и учёт токенов (Token Meter)
│   ├── lensNode.ts       # Логика Run и Extract для Exact и Auto Lens Node
│   ├── extraction.ts     # Встроенный Extraction Prompt и парсер анкеты
│   ├── edgeState.ts      # Вычисление состояния связей (белый / зелёный / красный)
│   ├── restore.ts        # Восстановление нод и предупреждения о расхождениях
│   ├── modelStore.ts     # Серверный реестр моделей (ключи не отдаются клиенту)
│   ├── llmClient.ts      # Клиент OpenAI-совместимого Chat Completions API
│   └── tokens.ts, recentProjects.ts, fileLock.ts, errors.ts
└── web/                  # Фронтенд на React + TypeScript + @xyflow/react
    ├── CanvasView.tsx, ChatNodeView.tsx, LensNodeView.tsx, NodeShell.tsx, PinEdge.tsx
    ├── Sidebar.tsx, ModelPanel.tsx, DisplaySettingsPanel.tsx, NodeSearch.tsx, NodeDefaultsPanel.tsx
    ├── TokenMeter.tsx, Markdown.tsx, SystemPromptButton.tsx, FolderPicker.tsx
    └── api.ts, history.ts, canvasActions.ts, displaySettings.ts, nodeSize.ts, style.css
tests/                    # Интеграционные тесты HTTP API на Vitest (с fake OpenAI сервером)
e2e/                      # Сквозные браузерные тесты на Playwright
```
</details>

<details>
<summary><strong>🔌 Основные маршруты HTTP API (<code>/api</code>)</strong></summary>

| Область | Маршруты |
| :--- | :--- |
| **Проект и ФС** | `POST /project/open`, `GET /projects/recent`, `GET /canvas`, `GET /fs/list` |
| **Node Defaults** | `GET / PUT /node-defaults/:type` (`chat`, `exact-lens`, `auto-lens`) |
| **Ноды** | `POST /nodes`, `PUT /nodes/:id/position`, `PUT /nodes/:id/size`, `DELETE /nodes/:id`, `POST /nodes/:id/fork` |
| **Связи** | `POST /edges`, `DELETE /edges/:id`, `GET /edges/states` |
| **Восстановление** | `GET /restorable`, `POST /restorable/:id/restore`, `GET /warnings` |
| **Chat Node** | `GET /nodes/:id/chat`, `PUT /nodes/:id/model`, `PUT /nodes/:id/system-prompt`, `POST /nodes/:id/tokens`, `POST /nodes/:id/messages`, `POST /nodes/:id/messages/stream` |
| **Lens Node** | `GET / PUT /nodes/:id/lens`, `PUT /nodes/:id/digest`, `GET /nodes/:id/lens/tokens`, `GET /nodes/:id/lens/extraction-tokens`, `POST /nodes/:id/extract`, `POST /nodes/:id/run` |
| **Модели** | `GET / POST /models`, `GET / PUT / DELETE /models/:id` |
</details>

#### Команды проверки и разработки
| Команда | Назначение |
| :--- | :--- |
| `npm run check` | Основной гейт качества: проверка глоссария → `tsc --noEmit` → `vite build` → `vitest run` |
| `npm test` | Запуск интеграционных тестов HTTP API (Vitest) |
| `npm run typecheck` | Проверка типов TypeScript |
| `npm run check:ui` | Сборка фронтенда и запуск E2E-сценариев в браузере (Playwright) |

* **Дополнительная документация**: [`GLOSSARY.md`](GLOSSARY.md) (словарь терминов предметной области), [`CODING_STANDARDS.md`](CODING_STANDARDS.md) и [`docs/adr/`](docs/adr) (архитектурные решения).
