# FixIT Chat — Чат техподдержки

## Описание проекта

Автономный чат-виджет техподдержки для сайта fixitmail.ru (компания "ФиксИТ", IT-аутсорсинг).
Встраивается одним `<script>` тегом, работает как отдельный микросервис в Docker.

## Стек

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic v2
- **Database**: PostgreSQL 16, Redis 7
- **Admin**: React 18, TypeScript, Material UI 5, Zustand, Vite
- **Widget**: Vanilla TypeScript, Shadow DOM, Vite
- **Infra**: Docker Compose, nginx, Prometheus, Grafana

## Структура проекта

```
fixit-chat/
├── backend/          # FastAPI API + WebSocket
│   ├── app/
│   │   ├── api/      # Роутеры (views): v1/ и ws/
│   │   ├── core/     # database, redis, security, encryption, exceptions
│   │   ├── models/   # SQLAlchemy модели
│   │   ├── schemas/  # Pydantic схемы (валидация вход/выход)
│   │   ├── repositories/  # Слой доступа к данным (CRUD)
│   │   ├── services/      # Бизнес-логика
│   │   ├── middleware/    # CORS, rate limit, IP whitelist, brute force, security headers
│   │   ├── tasks/         # Фоновые задачи (cleanup, auto-close)
│   │   └── cli/           # CLI-команды (create-admin)
│   └── tests/
├── admin/            # React SPA для специалистов поддержки
├── widget/           # Встраиваемый виджет (Shadow DOM)
├── nginx/            # Конфигурация reverse proxy
├── monitoring/       # Prometheus + Grafana
└── scripts/          # Утилиты (backup, init)
```

## Архитектурные принципы

- **Разделение слоёв**: models → repositories → services → api (views). НЕ обращайся к БД из роутеров напрямую.
- **DRY**: общая логика в `BaseRepository`, миксины в моделях (`TimestampMixin`, `SoftDeleteMixin`).
- **Валидация**: входные данные — Pydantic schemas. НЕ доверяй данным из запросов.
- **Абстракция auth**: `AuthProvider` (ABC) → `JWTAuthProvider` сейчас, `OIDCAuthProvider` (NextCloud) позже.
- **Шифрование**: AES-256-GCM для персональных данных в БД. Ключ из env `ENCRYPTION_KEY`.
- **API-first**: все действия через REST API. Swagger UI автогенерация на `/docs`.
- **WebSocket через Redis pub/sub**: для масштабируемости, даже при одном сервере.

## Правила кодирования

### Python (backend)
- Асинхронный код везде (`async def`, `await`).
- Type hints обязательны для аргументов и возвращаемых значений.
- Pydantic v2 для всех схем (`model_config = ConfigDict(...)`).
- SQLAlchemy 2.0 стиль (mapped_column, Mapped).
- Логирование через `structlog` (JSON в stdout).
- Тесты: pytest + httpx + pytest-asyncio. Покрытие >80%.
- Linter: ruff. Formatter: ruff format.

### TypeScript (admin, widget)
- Strict mode включён.
- React: функциональные компоненты + hooks. Без class components.
- State: Zustand (не Redux, не Context для глобального стейта).
- API-клиент: axios с interceptors для JWT refresh.
- Виджет: чистый TypeScript без фреймворков, Shadow DOM для изоляции CSS.
- Linter: eslint. Formatter: prettier.

### Безопасность
- CORS whitelist из `widget_settings.allowed_origins` в БД.
- Rate limiting через Redis (100 req/min API, 10 req/min login).
- Brute force: блокировка IP после 5 неудачных логинов на 15 мин.
- IP whitelist для админки из `widget_settings.admin_ip_whitelist`.
- Файлы: валидация MIME по magic bytes, white-list расширений, UUID имена, доступ только через API.
- Пароли: bcrypt. JWT access: 15 мин. Refresh: 7 дней, httpOnly cookie, хранится в Redis.
- Security headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS.
- SQL injection: исключён через SQLAlchemy ORM, никаких raw queries.
- XSS: plain text сообщения, экранирование при рендеринге.

## Команды

```bash
make up              # docker-compose up -d --build
make down            # docker-compose down
make logs            # docker-compose logs -f backend
make test            # pytest в backend контейнере
make migrate         # alembic upgrade head
make create-admin    # создать первого админа через CLI
make backup          # ручной бэкап БД
```

## Домен и маршрутизация (chat.fixitmail.ru)

```
/api/v1/widget/*  → backend   (публичные эндпоинты для виджета)
/api/v1/admin/*   → backend   (приватные эндпоинты, JWT + IP whitelist)
/ws/*             → backend   (WebSocket, upgrade)
/admin/*          → admin SPA (React)
/widget/*         → widget    (статика виджета)
/health           → backend
/metrics          → backend   (Prometheus, IP restricted)
/docs             → backend   (Swagger UI, IP restricted)
```

## Переменные окружения (.env)

```
DB_USER, DB_PASSWORD, REDIS_PASSWORD
SECRET_KEY              — для JWT
ENCRYPTION_KEY          — 32 bytes base64, для AES-256
TELEGRAM_BOT_TOKEN      — бот уведомлений (отдельный от сайта)
TELEGRAM_CHAT_ID        — куда отправлять уведомления
SMARTCAPTCHA_KEY        — Yandex SmartCaptcha server key
GLPI_INTEGRATION_SECRET — HMAC-SHA256 секрет для подписи GLPI-токенов
GRAFANA_PASSWORD        — пароль Grafana admin
```

## Ключевые решения

- **Один уровень ролей**: все агенты равны, без супервайзеров.
- **Статусы сессий**: только open/closed.
- **Soft delete**: данные помечаются deleted_at, физически не удаляются.
- **Хранение файлов**: локальный Docker volume, НЕ S3.
- **Один сайт**: нет мультитенантности.
- **Язык**: только русский, без i18n.
- **Мобильная адаптация**: только виджет, админка — десктоп.

## Интеграция с GLPI

Виджет интегрируется с GLPI (helpdesk.fixitmail.ru) через плагин. Код GLPI **НЕ модифицируется** — используется только штатный механизм плагинов.

### Архитектура интеграции

```
GLPI (пользователь залогинен)
  │
  ├─ INIT_SESSION хук → генерирует HMAC-SHA256 токен → $_SESSION
  ├─ plugin_init → читает токен → <meta name="fixit-glpi-token">
  ├─ ADD_JAVASCRIPT хук → widget_inject.js
  │
  ▼
widget_inject.js (на странице GLPI)
  ├─ Читает токен из <meta>
  ├─ Подключает loader.js с data-glpi-token
  │
  ▼
Виджет (ChatWindow)
  ├─ glpiToken есть? → createGlpiSession() без формы
  ├─ glpiToken нет?  → showForm() как обычно
  │
  ▼
Backend (POST /api/v1/widget/sessions/glpi)
  ├─ verify_glpi_token() — проверяет HMAC подпись
  ├─ Создаёт сессию с данными из токена
  └─ Сохраняет glpi_user_id в custom_fields
```

### Подписанный токен (HMAC-SHA256)

Формат: `base64url(json_payload).hex(hmac_sha256(payload_b64, secret))`

Payload содержит:
```json
{
  "user_id": "7",
  "name": "Лобойко Евгения",
  "phone": "+79001234567",
  "org": "Головная организация",
  "exp": 1735689600
}
```

Секрет (`GLPI_INTEGRATION_SECRET`) одинаковый в плагине GLPI и в `.env` бэкенда. Токен живёт 2 часа, перегенерируется при каждом логине и смене организации/профиля.

### Файлы интеграции

**Backend** (наш код):
- `backend/app/services/glpi_service.py` — верификация HMAC-токена, класс `GlpiTokenData`
- `backend/app/api/v1/widget.py` — endpoint `POST /sessions/glpi`
- `backend/app/schemas/session.py` — схема `GlpiSessionCreate`

**Widget** (наш код):
- `widget/src/loader.ts` — парсинг `data-glpi-token`
- `widget/src/types.ts` — `glpiToken` в `WidgetConfig`
- `widget/src/widget.ts` — прокидывает `glpiToken` в `ChatWindow`
- `widget/src/components/ChatWindow.ts` — `handleGlpiAutoSession()`, пропуск формы
- `widget/src/services/api.ts` — `createGlpiSession()`

**Плагин GLPI** (папка `plugins/fixitchat/` внутри GLPI, код GLPI НЕ меняется):
```
plugins/fixitchat/
├── setup.php                  # Хуки: INIT_SESSION, ADD_JAVASCRIPT, ADD_HEADER_TAG
└── js/
    ├── widget_inject.js       # Читает meta-тег → подключает loader.js с токеном
    └── widget_inject_anon.js  # Для страницы логина (без токена, обычная форма)
```

### Используемые хуки GLPI

| Хук | Назначение |
|-----|------------|
| `INIT_SESSION` | Генерация токена при логине (сессия готова) |
| `CHANGE_PROFILE` | Перегенерация при смене профиля |
| `CHANGE_ENTITY` | Перегенерация при смене организации |
| `ADD_JAVASCRIPT` | Подключение `widget_inject.js` на все страницы |
| `ADD_JAVASCRIPT_ANONYMOUS_PAGE` | Подключение виджета на страницу логина |
| `ADD_HEADER_TAG` | `<meta>` тег с токеном и URL чата |

### Развёртывание на прод

1. Скопировать `plugins/fixitchat/` в GLPI
2. В `setup.php` установить `FIXIT_SECRET` и `FIXIT_CHAT_URL`
3. В `js/*.js` установить `CHAT_URL`
4. Настроить симлинк или Alias в веб-сервере для `plugins/` → `public/plugins/`
5. Активировать плагин: Настройки → Плагины → FixIT Chat → Установить → Включить
6. В `.env` FixIT Chat установить `GLPI_INTEGRATION_SECRET` (совпадает с `FIXIT_SECRET`)
7. Добавить домен GLPI в `allowed_origins` (CORS) через админку FixIT Chat

### Планы по интеграции

- Создание тикетов GLPI из закрытых сессий чата (`glpi_user_id` уже сохраняется)
- Подтягивание организации/отдела пользователя в боковую панель админки
- SSO через GLPI (OIDC) — заложена абстракция `AuthProvider`
