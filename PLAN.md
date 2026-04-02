# План реализации: Чат техподдержки ФиксИТ

## Context

Компания "ФиксИТ" (fixitmail.ru) — IT-аутсорсинг, Таганрог. Нужен чат техподдержки, который:
- Легко встраивается на любой сайт одним `<script>` тегом
- Работает как отдельный микросервис в Docker
- Имеет админ-панель для специалистов поддержки
- Безопасен, профессионально написан, покрыт тестами

Сайт fixitmail.ru — статический HTML (jQuery + Bootstrap 4), nginx + Apache, Let's Encrypt wildcard.

---

## 1. Стек технологий

| Компонент | Технология |
|-----------|-----------|
| Backend | Python 3.12 + FastAPI + Uvicorn |
| Database | PostgreSQL 16 + Redis 7 |
| ORM | SQLAlchemy 2.0 (async) + Alembic |
| WebSocket | FastAPI native WebSocket |
| Админка | React 18 + TypeScript + Material UI (MUI) 5 |
| Виджет | Vanilla TypeScript + Shadow DOM + Vite |
| Контейнеризация | Docker + docker-compose |
| Тесты | pytest + httpx + pytest-asyncio |
| Мониторинг | Prometheus + Grafana |
| Reverse proxy | nginx |

---

## 2. Структура проекта

```
fixit-chat/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── Makefile                      # Упрощённые команды (make up, make test, etc.)
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   │
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py               # FastAPI app factory
│   │   ├── config.py             # Pydantic Settings (из .env)
│   │   │
│   │   ├── models/               # SQLAlchemy модели
│   │   │   ├── __init__.py
│   │   │   ├── base.py           # Base, TimestampMixin, SoftDeleteMixin
│   │   │   ├── agent.py          # Модель агента (специалиста)
│   │   │   ├── session.py        # Модель чат-сессии
│   │   │   ├── message.py        # Модель сообщения
│   │   │   ├── attachment.py     # Модель вложения
│   │   │   ├── note.py           # Внутренние заметки агентов
│   │   │   ├── rating.py         # Оценка сессии
│   │   │   └── settings.py       # Модель настроек виджета
│   │   │
│   │   ├── schemas/              # Pydantic схемы (валидация)
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── session.py
│   │   │   ├── message.py
│   │   │   ├── attachment.py
│   │   │   ├── note.py
│   │   │   ├── agent.py
│   │   │   ├── settings.py
│   │   │   └── stats.py
│   │   │
│   │   ├── repositories/         # Слой доступа к данным
│   │   │   ├── __init__.py
│   │   │   ├── base.py           # BaseRepository (CRUD generic)
│   │   │   ├── session_repo.py
│   │   │   ├── message_repo.py
│   │   │   ├── agent_repo.py
│   │   │   ├── note_repo.py
│   │   │   └── settings_repo.py
│   │   │
│   │   ├── services/             # Бизнес-логика
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py   # Абстракция auth (JWT / OIDC)
│   │   │   ├── session_service.py
│   │   │   ├── message_service.py
│   │   │   ├── file_service.py   # Загрузка, валидация, хранение файлов
│   │   │   ├── notification_service.py  # Telegram + in-app
│   │   │   ├── encryption_service.py    # AES-256 шифрование
│   │   │   ├── stats_service.py
│   │   │   ├── settings_service.py
│   │   │   └── cleanup_service.py       # Soft delete по таймауту
│   │   │
│   │   ├── api/                  # Роутеры (views)
│   │   │   ├── __init__.py
│   │   │   ├── deps.py           # Dependency injection (get_db, get_current_agent)
│   │   │   ├── v1/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── router.py     # Агрегирующий роутер v1
│   │   │   │   ├── auth.py       # POST /login, /refresh, /logout
│   │   │   │   ├── sessions.py   # CRUD сессий
│   │   │   │   ├── messages.py   # Сообщения в сессии
│   │   │   │   ├── attachments.py # Загрузка/скачивание файлов
│   │   │   │   ├── notes.py      # Внутренние заметки
│   │   │   │   ├── agents.py     # Управление агентами
│   │   │   │   ├── settings.py   # Настройки виджета
│   │   │   │   ├── stats.py      # Статистика
│   │   │   │   └── widget.py     # Публичные эндпоинты для виджета
│   │   │   └── ws/
│   │   │       ├── __init__.py
│   │   │       ├── manager.py    # WebSocket connection manager
│   │   │       ├── chat.py       # WS для чата (пользователь)
│   │   │       └── admin.py      # WS для админки (агент)
│   │   │
│   │   ├── middleware/
│   │   │   ├── __init__.py
│   │   │   ├── cors.py
│   │   │   ├── rate_limit.py     # Rate limiting через Redis
│   │   │   ├── ip_whitelist.py   # IP restriction для админки
│   │   │   ├── brute_force.py    # Защита от перебора паролей
│   │   │   └── security_headers.py # CSP, X-Frame-Options, etc.
│   │   │
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── database.py       # Async engine, session factory
│   │   │   ├── redis.py          # Redis connection pool
│   │   │   ├── security.py       # Password hashing (bcrypt), JWT
│   │   │   ├── encryption.py     # AES-256 encrypt/decrypt
│   │   │   └── exceptions.py     # Кастомные исключения
│   │   │
│   │   ├── tasks/
│   │   │   ├── __init__.py
│   │   │   ├── scheduler.py      # APScheduler для периодических задач
│   │   │   ├── cleanup.py        # Soft delete старых сессий
│   │   │   └── auto_close.py     # Автозакрытие неактивных сессий
│   │   │
│   │   └── cli/
│   │       ├── __init__.py
│   │       └── commands.py       # CLI: create-admin, migrate, etc.
│   │
│   └── tests/
│       ├── conftest.py           # Fixtures: test DB, client, auth
│       ├── factories.py          # Factory Boy для тестовых данных
│       ├── test_api/
│       │   ├── test_auth.py
│       │   ├── test_sessions.py
│       │   ├── test_messages.py
│       │   ├── test_attachments.py
│       │   ├── test_agents.py
│       │   └── test_settings.py
│       ├── test_services/
│       │   ├── test_encryption.py
│       │   ├── test_file_service.py
│       │   └── test_session_service.py
│       ├── test_ws/
│       │   ├── test_chat_ws.py
│       │   └── test_admin_ws.py
│       └── test_security/
│           ├── test_rate_limit.py
│           ├── test_brute_force.py
│           └── test_ip_whitelist.py
│
├── admin/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   ├── client.ts          # Axios instance + interceptors
│   │   │   ├── auth.ts
│   │   │   ├── sessions.ts
│   │   │   ├── messages.ts
│   │   │   ├── agents.ts
│   │   │   └── settings.ts
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useSessions.ts
│   │   │   └── useSound.ts
│   │   ├── store/
│   │   │   ├── authStore.ts       # Zustand store
│   │   │   ├── sessionStore.ts
│   │   │   └── settingsStore.ts
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── SessionListPage.tsx
│   │   │   ├── ChatPage.tsx
│   │   │   ├── SettingsPage.tsx
│   │   │   └── AgentsPage.tsx
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Header.tsx
│   │   │   ├── Chat/
│   │   │   │   ├── MessageList.tsx
│   │   │   │   ├── MessageInput.tsx
│   │   │   │   ├── MessageBubble.tsx
│   │   │   │   ├── TypingIndicator.tsx
│   │   │   │   └── FilePreview.tsx
│   │   │   ├── Sessions/
│   │   │   │   ├── SessionList.tsx
│   │   │   │   ├── SessionCard.tsx
│   │   │   │   └── SessionFilters.tsx
│   │   │   ├── Notes/
│   │   │   │   └── NotePanel.tsx
│   │   │   ├── Stats/
│   │   │   │   ├── StatsCards.tsx
│   │   │   │   └── ChartWidget.tsx
│   │   │   └── Settings/
│   │   │       ├── WidgetSettings.tsx
│   │   │       ├── FormFieldsSettings.tsx
│   │   │       ├── TelegramSettings.tsx
│   │   │       └── FileTypesSettings.tsx
│   │   ├── utils/
│   │   │   ├── formatters.ts
│   │   │   └── validators.ts
│   │   └── types/
│   │       └── index.ts           # Общие TypeScript типы
│   └── tests/
│       └── ...
│
├── widget/
│   ├── Dockerfile                 # Multi-stage build
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── loader.ts             # Точка входа (~1KB), async загрузка
│   │   ├── widget.ts             # Основной класс виджета
│   │   ├── components/
│   │   │   ├── ChatWindow.ts     # Окно чата
│   │   │   ├── PreChatForm.ts    # Пре-чат форма
│   │   │   ├── MessageList.ts    # Список сообщений
│   │   │   ├── MessageInput.ts   # Поле ввода
│   │   │   ├── FileUpload.ts     # Загрузка файлов
│   │   │   ├── RatingForm.ts     # Оценка 5 звёзд
│   │   │   └── FloatingButton.ts # Кнопка виджета
│   │   ├── services/
│   │   │   ├── api.ts            # HTTP-клиент
│   │   │   ├── websocket.ts      # WebSocket клиент
│   │   │   ├── storage.ts        # localStorage manager
│   │   │   ├── sound.ts          # Звуковые уведомления
│   │   │   └── captcha.ts        # Yandex SmartCaptcha
│   │   ├── styles/
│   │   │   └── widget.css        # Стили (инжектируются в Shadow DOM)
│   │   └── types.ts
│   └── tests/
│       └── ...
│
├── nginx/
│   ├── nginx.conf
│   └── conf.d/
│       └── chat.conf              # Конфигурация chat.fixitmail.ru
│
├── monitoring/
│   ├── prometheus/
│   │   └── prometheus.yml
│   └── grafana/
│       ├── provisioning/
│       │   ├── dashboards/
│       │   │   └── chat-dashboard.json
│       │   └── datasources/
│       │       └── prometheus.yml
│       └── grafana.ini
│
└── scripts/
    ├── init.sh                    # Первичная настройка
    └── backup.sh                  # Ручной бэкап БД
```

---

## 3. Схема базы данных

### Таблица `agents` (специалисты поддержки)
```
id              UUID PK DEFAULT gen_random_uuid()
username        VARCHAR(50) UNIQUE NOT NULL
password_hash   VARCHAR(255) NOT NULL
display_name    VARCHAR(100) NOT NULL
is_active       BOOLEAN DEFAULT true
last_seen_at    TIMESTAMP WITH TIME ZONE
created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
updated_at      TIMESTAMP WITH TIME ZONE DEFAULT now()

INDEX idx_agents_username ON agents(username)
```

### Таблица `chat_sessions` (сессии обращений)
```
id              UUID PK DEFAULT gen_random_uuid()
visitor_name    VARCHAR(100) NOT NULL          -- зашифровано AES-256
visitor_phone   VARCHAR(50)                    -- зашифровано AES-256
visitor_org     VARCHAR(200)                   -- зашифровано AES-256
initial_message TEXT NOT NULL                  -- зашифровано AES-256
status          VARCHAR(20) DEFAULT 'open'     -- open | closed
rating          SMALLINT CHECK (rating BETWEEN 1 AND 5)
consent_given   BOOLEAN DEFAULT false          -- согласие 152-ФЗ
closed_at       TIMESTAMP WITH TIME ZONE
deleted_at      TIMESTAMP WITH TIME ZONE       -- soft delete
created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
updated_at      TIMESTAMP WITH TIME ZONE DEFAULT now()

-- Кастомные поля формы хранятся в JSONB
custom_fields   JSONB DEFAULT '{}'

INDEX idx_sessions_status ON chat_sessions(status) WHERE deleted_at IS NULL
INDEX idx_sessions_created ON chat_sessions(created_at DESC)
INDEX idx_sessions_deleted ON chat_sessions(deleted_at)
```

### Таблица `messages` (сообщения)
```
id              UUID PK DEFAULT gen_random_uuid()
session_id      UUID FK → chat_sessions(id) ON DELETE CASCADE
sender_type     VARCHAR(10) NOT NULL           -- visitor | agent | system
sender_id       UUID FK → agents(id) NULL      -- NULL для visitor/system
content         TEXT NOT NULL                   -- зашифровано AES-256
is_read         BOOLEAN DEFAULT false
delivered_at    TIMESTAMP WITH TIME ZONE DEFAULT now()
read_at         TIMESTAMP WITH TIME ZONE
created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()

INDEX idx_messages_session ON messages(session_id, created_at)
INDEX idx_messages_unread ON messages(session_id, is_read) WHERE is_read = false
```

### Таблица `attachments` (вложения)
```
id              UUID PK DEFAULT gen_random_uuid()
message_id      UUID FK → messages(id) ON DELETE CASCADE
file_name       VARCHAR(255) NOT NULL
file_path       VARCHAR(500) NOT NULL          -- путь на диске
file_size       INTEGER NOT NULL               -- в байтах
mime_type       VARCHAR(100) NOT NULL
created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()

INDEX idx_attachments_message ON attachments(message_id)
```

### Таблица `session_notes` (внутренние заметки агентов)
```
id              UUID PK DEFAULT gen_random_uuid()
session_id      UUID FK → chat_sessions(id) ON DELETE CASCADE
agent_id        UUID FK → agents(id) ON DELETE SET NULL
content         TEXT NOT NULL                   -- зашифровано AES-256
created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()

INDEX idx_notes_session ON session_notes(session_id)
```

### Таблица `widget_settings` (настройки виджета — singleton)
```
id                  INTEGER PK DEFAULT 1 CHECK (id = 1)
primary_color       VARCHAR(7) DEFAULT '#1976D2'
header_title        VARCHAR(100) DEFAULT 'Техподдержка'
welcome_message     TEXT DEFAULT 'Здравствуйте! Опишите вашу проблему...'
logo_url            VARCHAR(500)
auto_close_minutes  INTEGER DEFAULT 1440          -- 24 часа
telegram_bot_token  VARCHAR(255)                   -- зашифрован
telegram_chat_id    VARCHAR(50)
allowed_file_types  TEXT[] DEFAULT '{jpg,jpeg,png,gif,webp,pdf,doc,docx,xls,xlsx}'
max_file_size_mb    INTEGER DEFAULT 10
privacy_policy_url  VARCHAR(500)
form_fields         JSONB DEFAULT '[
    {"name":"visitor_name","label":"Имя","type":"text","required":true},
    {"name":"visitor_phone","label":"Телефон","type":"tel","required":false},
    {"name":"visitor_org","label":"Организация","type":"text","required":false},
    {"name":"initial_message","label":"Сообщение","type":"textarea","required":true}
]'
allowed_origins     TEXT[] DEFAULT '{https://fixitmail.ru}'
admin_ip_whitelist  TEXT[] DEFAULT '{}'
smartcaptcha_key    VARCHAR(255)
updated_at          TIMESTAMP WITH TIME ZONE DEFAULT now()
```

### Таблица `login_attempts` (защита от брутфорса)
```
id              SERIAL PK
ip_address      INET NOT NULL
attempted_at    TIMESTAMP WITH TIME ZONE DEFAULT now()
success         BOOLEAN DEFAULT false

INDEX idx_login_attempts_ip ON login_attempts(ip_address, attempted_at)
```

---

## 4. API эндпоинты

### Публичные (для виджета) — префикс `/api/v1/widget`
```
GET    /settings              — Получить настройки виджета (цвета, форма, приветствие)
POST   /sessions              — Создать сессию (пре-чат форма + SmartCaptcha token)
GET    /sessions/{id}         — Получить сессию по ID + token
POST   /sessions/{id}/messages — Отправить сообщение от посетителя
GET    /sessions/{id}/messages — Получить историю сообщений
POST   /sessions/{id}/files   — Загрузить файл
GET    /files/{id}            — Скачать файл
POST   /sessions/{id}/rating  — Оценить сессию (1-5 звёзд)
POST   /sessions/{id}/read    — Пометить сообщения прочитанными
WS     /ws/chat/{session_id}?token={visitor_token} — WebSocket для посетителя
```

### Приватные (для админки) — префикс `/api/v1/admin`
```
POST   /auth/login            — Вход (username + password)
POST   /auth/refresh          — Обновить access token
POST   /auth/logout           — Выход (invalidate refresh token)

GET    /sessions              — Список сессий (поиск, фильтры, пагинация)
GET    /sessions/{id}         — Детали сессии
PATCH  /sessions/{id}         — Обновить статус (закрыть)
GET    /sessions/{id}/messages — Сообщения сессии
POST   /sessions/{id}/messages — Отправить сообщение от агента
POST   /sessions/{id}/files   — Загрузить файл от агента
POST   /sessions/{id}/read    — Пометить прочитанными

GET    /sessions/{id}/notes   — Заметки к сессии
POST   /sessions/{id}/notes   — Добавить заметку

GET    /agents                — Список агентов
POST   /agents                — Создать агента
PATCH  /agents/{id}           — Редактировать агента
DELETE /agents/{id}           — Деактивировать агента

GET    /settings              — Получить настройки
PUT    /settings              — Обновить настройки
POST   /settings/logo         — Загрузить логотип

GET    /stats                 — Статистика (дашборд)
GET    /stats/daily           — По дням (график)

WS     /ws/admin?token={jwt}  — WebSocket для агента (все события)
```

### Служебные
```
GET    /health                — Health check
GET    /metrics               — Prometheus метрики
GET    /docs                  — Swagger UI (только в dev или по IP whitelist)
```

### WebSocket события

**Канал виджета** (`/ws/chat/{session_id}`):
```
→ server: { type: "message", data: { id, content, sender_type, created_at } }
→ server: { type: "typing", data: { sender_type: "agent" } }
→ server: { type: "read", data: { message_ids: [...] } }
→ server: { type: "session_closed" }
← client: { type: "message", data: { content } }
← client: { type: "typing" }
← client: { type: "read", data: { message_ids: [...] } }
```

**Канал админки** (`/ws/admin`):
```
→ server: { type: "new_session", data: { session } }
→ server: { type: "new_message", data: { session_id, message } }
→ server: { type: "typing", data: { session_id, sender_type: "visitor" } }
→ server: { type: "read", data: { session_id, message_ids: [...] } }
→ server: { type: "session_closed", data: { session_id } }
→ server: { type: "session_rated", data: { session_id, rating } }
← client: { type: "message", data: { session_id, content } }
← client: { type: "typing", data: { session_id } }
← client: { type: "read", data: { session_id, message_ids: [...] } }
```

---

## 5. Архитектура виджета

### Загрузка (2 этапа)
1. **Лоадер** (`loader.ts`, ~1KB минифицированный):
   - Встраивается через `<script async src="https://chat.fixitmail.ru/widget/loader.js"></script>`
   - Создаёт `<div id="fixit-chat-root">`
   - Асинхронно загружает основной бандл `widget.js` (~30-50KB gzip)
   - Передаёт конфигурацию

2. **Основной бандл** (`widget.ts`):
   - Fetch настроек с сервера `GET /api/v1/widget/settings`
   - Создаёт Shadow DOM внутри `#fixit-chat-root`
   - Инжектирует CSS в Shadow DOM
   - Рендерит компоненты

### Компоненты виджета (Vanilla TS, без фреймворка)
```
FloatingButton → (клик) → ChatWindow
                              ├── PreChatForm (имя, тел, орг, текст + captcha + consent)
                              │     └── (submit) → API создаёт сессию → WebSocket connect
                              ├── MessageList
                              │     ├── MessageBubble (visitor / agent / system)
                              │     └── TypingIndicator
                              ├── MessageInput + FileUpload
                              └── RatingForm (после закрытия сессии)
```

### Shadow DOM структура
```html
<div id="fixit-chat-root">
  #shadow-root (open)
    <style>/* все стили виджета */</style>
    <div class="fixit-widget">
      <button class="fixit-fab">💬</button>
      <div class="fixit-chat-window">
        <!-- динамический контент -->
      </div>
    </div>
</div>
```

---

## 6. Архитектура админки (React + MUI)

### State management: Zustand
- `authStore` — JWT tokens, текущий агент
- `sessionStore` — список сессий, активная сессия, сообщения
- `settingsStore` — настройки виджета

### Страницы
| Путь | Компонент | Описание |
|------|-----------|----------|
| `/login` | LoginPage | Форма входа |
| `/` | DashboardPage | Статистика, графики |
| `/sessions` | SessionListPage | Список сессий + фильтры |
| `/sessions/:id` | ChatPage | Чат + заметки |
| `/settings` | SettingsPage | Настройки виджета |
| `/agents` | AgentsPage | Управление агентами |

### Ключевые компоненты
- **Layout** (Sidebar + Header) — обёртка для всех страниц
- **SessionList** — таблица сессий с поиском, фильтрами, пагинацией
- **ChatPage** — split view: чат слева, заметки справа
- **MessageList** — виртуализированный список сообщений
- **DashboardPage** — карточки метрик + график по дням (recharts)

### WebSocket в админке
- Один WS на всё приложение (`useWebSocket` hook)
- При новом сообщении/сессии — звуковое уведомление + обновление badge
- Typing indicators для всех открытых сессий

---

## 7. Docker Compose

```yaml
services:
  # PostgreSQL
  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: fixit_chat
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: pg_isready -U ${DB_USER}
    restart: unless-stopped

  # Redis
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --requirepass ${REDIS_PASSWORD}
    healthcheck:
      test: redis-cli -a ${REDIS_PASSWORD} ping
    restart: unless-stopped

  # Backend API
  backend:
    build: ./backend
    environment:
      - DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@postgres/fixit_chat
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - SECRET_KEY=${SECRET_KEY}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - uploads:/app/uploads
    restart: unless-stopped

  # Admin Panel (nginx serves static build)
  admin:
    build: ./admin
    restart: unless-stopped

  # Widget (nginx serves static build)
  widget:
    build: ./widget
    restart: unless-stopped

  # Nginx (reverse proxy)
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - certbot_data:/etc/letsencrypt:ro
    depends_on:
      - backend
      - admin
      - widget
    restart: unless-stopped

  # Prometheus
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./monitoring/prometheus:/etc/prometheus:ro
      - prometheus_data:/prometheus
    restart: unless-stopped

  # Grafana
  grafana:
    image: grafana/grafana:latest
    volumes:
      - ./monitoring/grafana:/etc/grafana:ro
      - grafana_data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  uploads:
  prometheus_data:
  grafana_data:
  certbot_data:
```

### Nginx маршрутизация (chat.fixitmail.ru)
```
/api/*        → backend:8000        (API)
/ws/*         → backend:8000        (WebSocket, upgrade)
/admin/*      → admin:80            (React SPA)
/widget/*     → widget:80           (Widget static files)
/health       → backend:8000        (Health check)
/metrics      → backend:8000        (Prometheus, IP restricted)
/docs         → backend:8000        (Swagger, IP restricted)
```

---

## 8. Безопасность

### Middleware стек (порядок важен)
1. **SecurityHeaders** — CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS
2. **CORS** — whitelist доменов из `widget_settings.allowed_origins`
3. **RateLimit** — через Redis: 100 req/min для API, 10 req/min для login
4. **IPWhitelist** — для `/api/v1/admin/*`, `/docs`, `/metrics`
5. **BruteForce** — 5 неудачных login → блокировка IP на 15 минут

### Шифрование (AES-256-GCM)
- Ключ из env `ENCRYPTION_KEY` (32 bytes, base64)
- Шифруются: visitor_name, visitor_phone, visitor_org, message.content, note.content, telegram_bot_token
- Каждое значение имеет уникальный IV (nonce)
- Формат хранения: `base64(nonce + ciphertext + tag)`

### Защита файлов
- Валидация MIME-type по magic bytes (не по расширению)
- White-list расширений из настроек
- Максимум 10MB
- Файлы сохраняются с UUID-именами (не оригинальными)
- Файлы НЕ доступны напрямую — только через API с проверкой доступа

### Auth (абстракция для будущего OIDC)
```python
# services/auth_service.py
class AuthProvider(ABC):
    async def authenticate(self, credentials) -> Agent
    async def validate_token(self, token: str) -> TokenPayload

class JWTAuthProvider(AuthProvider):  # текущая реализация
class OIDCAuthProvider(AuthProvider):  # будущая реализация (NextCloud)
```
- Access token: 15 минут, в памяти (не в localStorage)
- Refresh token: 7 дней, httpOnly cookie
- Refresh tokens хранятся в Redis (можно отозвать)

### Visitor auth (виджет)
- При создании сессии генерируется `visitor_token` (UUID v4)
- Токен хранится в localStorage
- Используется для доступа к своей сессии и WebSocket

---

## 9. Мониторинг

### Prometheus метрики
- `chat_sessions_total` (counter) — количество созданных сессий
- `chat_sessions_active` (gauge) — текущие открытые сессии
- `chat_messages_total` (counter, labels: sender_type) — сообщения
- `chat_response_time_seconds` (histogram) — время первого ответа агента
- `chat_session_duration_seconds` (histogram) — длительность сессии
- `chat_ratings` (histogram) — распределение оценок
- `ws_connections_active` (gauge, labels: type) — WebSocket соединения
- `http_requests_total` (counter, labels: method, path, status)
- `http_request_duration_seconds` (histogram)

### Grafana дашборд
- Активные сессии (gauge)
- Сообщения в час (time series)
- Среднее время ответа (stat)
- Средняя оценка (stat)
- HTTP ошибки (time series)
- WebSocket соединения (gauge)

### Логирование (structlog)
- JSON формат в stdout
- Уровни: DEBUG, INFO, WARNING, ERROR
- Контекст: request_id, session_id, agent_id
- Docker собирает через json-file driver

---

## 10. Тестирование

### Backend (pytest + httpx + pytest-asyncio)
- **Unit**: services, encryption, validators
- **Integration**: API endpoints с тестовой БД (PostgreSQL in Docker)
- **WebSocket**: тесты WS через httpx WebSocket client
- **Security**: rate limiting, brute force, IP whitelist, CORS
- **Fixtures**: Factory Boy для генерации тестовых данных
- Покрытие > 80%

### Admin (Vitest + React Testing Library)
- Компоненты: рендеринг, взаимодействие
- Stores: Zustand stores
- API: моки через MSW (Mock Service Worker)

### Widget (Vitest)
- Компоненты: Shadow DOM рендеринг
- Services: API client, WebSocket, localStorage

---

## 11. Порядок разработки (фазы) — статус выполнения

### Фаза 1: Фундамент backend (MVP API) ✅ ГОТОВО
1. ✅ Инициализация проекта, docker-compose (postgres + redis + backend)
2. ✅ Модели SQLAlchemy + Alembic миграции
3. ✅ Core: database.py, redis.py, security.py, encryption.py
4. ✅ BaseRepository + все repositories
5. ✅ Auth service (JWT) + login/refresh/logout endpoints
6. ✅ Session + Message services + API endpoints
7. ✅ WebSocket manager + chat/admin каналы
8. ✅ Middleware: CORS, rate limiting, security headers
9. ❌ Тесты (pytest) — не написаны

### Фаза 2: Виджет ✅ ГОТОВО
1. ✅ Лоадер (loader.ts) — 0.5KB
2. ✅ Shadow DOM каркас
3. ✅ Пре-чат форма + consent checkbox (SmartCaptcha — не подключена)
4. ✅ WebSocket клиент с автореконнектом
5. ✅ Чат (отправка/получение сообщений в реалтайме)
6. ✅ Typing indicator
7. ✅ Загрузка файлов (UI готов, backend endpoint /files не создан)
8. ✅ Звуковые уведомления
9. ✅ Оценка сессии (1-5 звёзд)
10. ✅ Мобильная адаптация (CSS)
11. ✅ Сборка Vite — 23KB (7KB gzip)
12. ✅ Закрытие сессии посетителем

### Фаза 3: Админ-панель ✅ ГОТОВО
1. ✅ Каркас React + MUI + Router
2. ✅ Auth (login, token refresh, protected routes)
3. ✅ Список сессий + поиск/фильтры/пагинация
4. ✅ Чат-страница + WebSocket (реалтайм)
5. ✅ Внутренние заметки (split view)
6. ✅ Управление агентами (CRUD + активация/деактивация)
7. ✅ Страница настроек (внешний вид, Telegram, безопасность)
8. ✅ Звуковые уведомления (глобальные, на любой странице)
9. ✅ Дашборд со статистикой + графиком recharts

### Фаза 4: Доп. функции — ЧАСТИЧНО
1. ✅ Статистика/дашборд — встроена в Фазу 3
2. ✅ Telegram-уведомления — код написан, нужно заполнить токен в настройках
3. ❌ Автозакрытие сессий (scheduler) — не реализовано
4. ❌ Soft delete cleanup task — не реализовано
5. ✅ Brute force protection — middleware работает
6. ✅ IP whitelist для админки — middleware работает

### Фаза 5: Мониторинг и деплой — ЧАСТИЧНО
1. ❌ Prometheus метрики в backend — не реализовано
2. ❌ Grafana дашборд — не реализовано
3. ✅ Health check endpoint — /health
4. ✅ Nginx конфигурация — работает
5. ❌ Docker-compose.prod.yml — не создан
6. ✅ Makefile с командами
7. ✅ .env.example + INSTALL.md с инструкцией по деплою
8. ✅ CLI команда create-admin

### Нереализованные пункты (сводка)
- pytest тесты (backend)
- Yandex SmartCaptcha интеграция
- Backend endpoint для загрузки файлов (POST /files)
- Автозакрытие неактивных сессий (APScheduler)
- Soft delete cleanup task
- Prometheus метрики + Grafana дашборд
- docker-compose.prod.yml (HTTPS, домен)
- Read receipts (пометка прочитанных в UI виджета)

---

## 12. Деплой (максимально просто)

Для пользователя без опыта Docker:

```bash
# 1. Клонировать
git clone ... && cd fixit-chat

# 2. Настроить
cp .env.example .env
nano .env  # заполнить пароли, ключи, домен

# 3. Запустить
make up  # = docker-compose up -d --build

# 4. Создать первого админа
make create-admin  # = docker-compose exec backend python -m app.cli create-admin

# 5. Добавить скрипт на сайт
# <script async src="https://chat.fixitmail.ru/widget/loader.js"></script>
```

Makefile скрывает сложность Docker:
```makefile
up:          docker-compose up -d --build
down:        docker-compose down
logs:        docker-compose logs -f backend
test:        docker-compose exec backend pytest
migrate:     docker-compose exec backend alembic upgrade head
create-admin: docker-compose exec backend python -m app.cli create-admin
backup:      ./scripts/backup.sh
```

---

## 13. Верификация (как тестировать)

1. **Backend API**: запустить `make test` — все pytest тесты
2. **Swagger**: открыть `https://chat.fixitmail.ru/docs` — проверить все эндпоинты
3. **Виджет**: открыть fixitmail.ru, виджет должен появиться в правом нижнем углу
4. **Чат E2E**: открыть виджет → заполнить форму → отправить сообщение → в админке должна появиться сессия
5. **WebSocket**: сообщения должны приходить в реальном времени без обновления страницы
6. **Файлы**: загрузить картинку и PDF через виджет и админку
7. **Telegram**: при новой сессии должно прийти уведомление в Telegram
8. **Безопасность**: попробовать 6 неудачных логинов — IP должен быть заблокирован
9. **Мониторинг**: открыть Grafana дашборд — метрики должны отображаться
10. **Мобильный**: открыть виджет на телефоне — должен быть адаптивным
