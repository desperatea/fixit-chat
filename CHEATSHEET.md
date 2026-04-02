# Шпаргалка: FixIT Chat — Ответы на вопросы собеседования

## 1. Что это за проект?

Автономный чат техподдержки для сайта fixitmail.ru (компания "ФиксИТ", IT-аутсорсинг, Таганрог).
Встраивается на любой сайт одним `<script>` тегом, работает как отдельный микросервис в Docker.

**Три части:**
- **Виджет** — кнопка чата на сайте клиента (vanilla TypeScript, Shadow DOM)
- **Админка** — панель для специалистов поддержки (React + MUI)
- **Backend** — API + WebSocket сервер (FastAPI + PostgreSQL + Redis)

---

## 2. Стек технологий

| Слой | Технология | Почему выбрали |
|------|-----------|----------------|
| Backend | Python 3.12, FastAPI | Async из коробки, автогенерация Swagger |
| БД | PostgreSQL 16 | Надёжность, JSONB для динамических полей |
| Кеш | Redis 7 | Pub/sub для WebSocket, rate limiting, хранение refresh-токенов |
| ORM | SQLAlchemy 2.0 (async) | Type-safe, новый стиль mapped_column |
| Миграции | Alembic | Стандарт для SQLAlchemy |
| Валидация | Pydantic v2 | Быстрая валидация, автогенерация схем |
| Админка | React 18 + MUI 5 | Компонентная библиотека, быстрая разработка |
| Стейт | Zustand | Проще чем Redux, нет boilerplate |
| Виджет | Vanilla TypeScript | Без зависимостей, минимальный размер (7KB gzip) |
| Изоляция | Shadow DOM | CSS виджета не конфликтует с сайтом клиента |
| Инфра | Docker Compose | Одна команда для запуска всего |
| Прокси | nginx | Маршрутизация, статика, WebSocket upgrade |

---

## 3. Архитектура (слои backend)

```
models → repositories → services → api (views)
```

- **models** — SQLAlchemy ORM модели (таблицы БД)
- **repositories** — CRUD операции (доступ к данным)
- **services** — бизнес-логика (шифрование, валидация, уведомления)
- **api** — роутеры FastAPI (HTTP endpoints + WebSocket)

**Правило:** роутер НИКОГДА не обращается к БД напрямую, только через сервис.

---

## 4. Таблицы БД (7 таблиц)

| Таблица | Назначение | Зашифрованные поля |
|---------|-----------|-------------------|
| `agents` | Специалисты поддержки | — |
| `chat_sessions` | Сессии обращений | visitor_name, visitor_phone, visitor_org, initial_message |
| `messages` | Сообщения в чате | content |
| `attachments` | Вложения (файлы) | — |
| `session_notes` | Внутренние заметки агентов | content |
| `widget_settings` | Настройки виджета (singleton) | — |
| `login_attempts` | Защита от брутфорса | — |

**Все модели** используют:
- UUID первичные ключи
- TimestampMixin (created_at, updated_at)
- SoftDeleteMixin (deleted_at) — данные не удаляются физически

---

## 5. Безопасность

### Аутентификация (JWT)
- **Access token**: 15 мин, в памяти (sessionStorage), алгоритм HS256
- **Refresh token**: 7 дней, httpOnly cookie, хранится в Redis
- **Почему Redis**: можно мгновенно отозвать токен (logout = удаление из Redis)

### Шифрование (AES-256-GCM)
- **Что шифруется**: имя, телефон, организация, сообщения, заметки
- **Ключ**: 32 байта, base64, из переменной окружения `ENCRYPTION_KEY`
- **Nonce**: 12 байт, уникальный для каждого значения
- **Формат хранения**: `base64(nonce + ciphertext + tag)`
- **GCM**: обеспечивает и шифрование, и проверку целостности

### Пароли
- **bcrypt** с автоматической генерацией соли

### Middleware стек (порядок важен!)
1. **SecurityHeaders** — CSP, X-Frame-Options, HSTS (16 заголовков)
2. **CORS** — whitelist доменов из БД
3. **IPWhitelist** — ограничение доступа к админке по IP
4. **RateLimit** — 100 req/min API, 10 req/min login (Redis sliding window)
5. **BruteForce** — 5 неудачных логинов = блокировка IP на 15 мин

### Защита файлов
- Валидация MIME по magic bytes (не по расширению!)
- White-list расширений из настроек
- UUID имена файлов (нельзя угадать)
- Доступ только через API с проверкой прав

### Visitor auth (виджет)
- При создании сессии генерируется `visitor_token` (32 символа hex)
- Передаётся в заголовке `X-Visitor-Token`
- Даёт доступ только к своей сессии

---

## 6. WebSocket

### Два канала:
- `/ws/chat/{session_id}?token=visitor_token` — для посетителя
- `/ws/admin?token=jwt_access_token` — для агента

### ConnectionManager (в памяти):
```python
visitor_connections: dict[UUID, WebSocket]   # session_id → ws
agent_connections: dict[UUID, WebSocket]     # agent_id → ws
```

### Типы событий:
- `message` — новое сообщение
- `typing` — индикатор набора текста
- `read` — пометка прочитанным
- `new_session` — новая сессия (только для агентов)
- `session_closed` — сессия закрыта
- `session_rated` — оценка поставлена

### Реконнект (виджет):
- Экспоненциальный backoff: 1с → 2с → 4с → ... → 30с (макс)
- Максимум 10 попыток
- Формула: `min(1000 * 2^attempts, 30000)`

### Коды ошибок WS:
- `4401` — Unauthorized (JWT невалидный)
- `4403` — Forbidden (visitor token неверный)

---

## 7. API эндпоинты

### Публичные (виджет) — `/api/v1/widget/`
- `GET /settings` — настройки виджета (цвета, форма)
- `POST /sessions` — создать сессию
- `GET /sessions/{id}` — получить сессию (+ visitor token)
- `POST /sessions/{id}/messages` — отправить сообщение
- `GET /sessions/{id}/messages` — история сообщений
- `POST /sessions/{id}/close` — закрыть сессию
- `POST /sessions/{id}/rating` — оценить (1-5)

### Приватные (админка) — `/api/v1/admin/`
- `POST /auth/login` — вход (username + password → JWT + cookie)
- `POST /auth/refresh` — обновить access token (из cookie)
- `POST /auth/logout` — выход (удаление refresh из Redis)
- `GET /sessions` — список сессий (поиск, фильтры, пагинация)
- `POST /sessions/{id}/messages` — ответить от имени агента
- CRUD для агентов, настроек, заметок, статистики

---

## 8. Docker Compose (6 сервисов)

| Сервис | Образ | Назначение |
|--------|-------|-----------|
| postgres | postgres:16-alpine | База данных |
| redis | redis:7-alpine | Кеш, pub/sub, токены |
| backend | Python 3.12 (custom) | API + WebSocket |
| admin | Node 20 → nginx (custom) | React SPA |
| widget | Node 20 → nginx (custom) | Статика виджета |
| nginx | nginx:alpine | Reverse proxy |

### Маршрутизация nginx:
```
/api/*     → backend:8000
/ws/*      → backend:8000 (upgrade, timeout 86400s)
/admin/*   → admin:80
/widget/*  → widget:80 (CORS: *)
/health    → backend:8000
/docs      → backend:8000
/          → 302 /admin/
```

---

## 9. Виджет (Shadow DOM)

### Загрузка:
1. `loader.js` (~0.5KB) — создаёт `<div id="fixit-chat-root">`, загружает `widget.js`
2. `widget.js` (~7KB gzip) — основной код

### Компоненты:
```
FloatingButton → ChatWindow
                    ├── PreChatForm (имя, тел, орг, сообщение + согласие)
                    ├── MessageList + TypingIndicator
                    ├── MessageInput
                    └── RatingForm (после закрытия)
```

### Shadow DOM:
```html
<div id="fixit-chat-root">
  #shadow-root (open)
    <style>/* все стили */</style>
    <div class="fixit-widget">...</div>
</div>
```
CSS виджета полностью изолирован от CSS сайта клиента.

---

## 10. Админка (React)

### Zustand stores:
- `authStore` — JWT токены, текущий агент
- `sessionStore` — список сессий, активная сессия, сообщения, заметки
- `settingsStore` — настройки виджета

### Страницы:
| URL | Компонент | Описание |
|-----|-----------|----------|
| `/login` | LoginPage | Форма входа |
| `/` | DashboardPage | Статистика + графики (recharts) |
| `/sessions` | SessionListPage | Таблица сессий с фильтрами |
| `/sessions/:id` | ChatPage | Чат (слева) + заметки (справа) |
| `/settings` | SettingsPage | Настройки виджета |
| `/agents` | AgentsPage | Управление агентами |

### WebSocket hook:
- Один WS на всё приложение
- Звуковое уведомление при новом сообщении/сессии
- Автореконнект через 3 секунды

---

## 11. Ключевые архитектурные решения

| Решение | Почему |
|---------|--------|
| Один уровень ролей (все агенты равны) | Простота, нет супервайзеров |
| Статусы только open/closed | Минимализм, без сложных workflow |
| Soft delete | Данные не теряются, можно восстановить |
| Файлы на Docker volume, не S3 | Простота, один сервер |
| Один сайт, без мультитенантности | Проект для одной компании |
| Только русский язык | Нет i18n, целевая аудитория — Россия |
| WebSocket через Redis pub/sub | Готовность к масштабированию |
| Singleton настройки (1 строка в БД) | Динамическое обновление без рестарта |

---

## 12. Паттерны кода

### BaseRepository (Generic CRUD):
```python
get_by_id(), get_all(), create(), update(), delete(), count()
```
SoftDeleteRepository наследует и фильтрует `deleted_at IS NULL`.

### Шифрование при сохранении/чтении:
- **Сохранение**: данные → encrypt → БД
- **Чтение**: БД → detach от сессии → decrypt in-place → return

### Graceful degradation:
- Telegram недоступен → лог warning, работа продолжается
- Redis недоступен → rate limiting пропускается
- CORS whitelist пустой → разрешить всё (режим настройки)

---

## 13. Что НЕ реализовано (знать для честности)

- pytest тесты
- Yandex SmartCaptcha интеграция
- Endpoint загрузки файлов (POST /files)
- Автозакрытие неактивных сессий (APScheduler)
- Soft delete cleanup task
- Prometheus метрики + Grafana
- docker-compose.prod.yml (HTTPS)
- Read receipts в UI виджета
