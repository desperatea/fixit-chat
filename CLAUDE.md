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
SECRET_KEY          — для JWT
ENCRYPTION_KEY      — 32 bytes base64, для AES-256
TELEGRAM_BOT_TOKEN  — бот уведомлений (отдельный от сайта)
TELEGRAM_CHAT_ID    — куда отправлять уведомления
SMARTCAPTCHA_KEY    — Yandex SmartCaptcha server key
GRAFANA_PASSWORD    — пароль Grafana admin
```

## Ключевые решения

- **Один уровень ролей**: все агенты равны, без супервайзеров.
- **Статусы сессий**: только open/closed.
- **Soft delete**: данные помечаются deleted_at, физически не удаляются.
- **Хранение файлов**: локальный Docker volume, НЕ S3.
- **Один сайт**: нет мультитенантности.
- **Язык**: только русский, без i18n.
- **Мобильная адаптация**: только виджет, админка — десктоп.
