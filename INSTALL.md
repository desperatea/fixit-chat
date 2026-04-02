# FixIT Chat — Инструкция по запуску и управлению

## Требования

- Linux (Ubuntu/Debian/Mint)
- Docker и Docker Compose установлены
- Свободен порт 80
- 2 ГБ свободной оперативной памяти

Проверить Docker:
```bash
docker --version        # Docker 20+
docker compose version  # Docker Compose v2+
```

Если Docker не установлен: https://docs.docker.com/engine/install/ubuntu/

---

## Первый запуск (5 шагов)

### 1. Перейти в папку проекта
```bash
cd fixit-chat
```

### 2. Создать файл настроек
```bash
cp .env.example .env
```

Отредактировать `.env` — заменить пароли на свои:
```bash
nano .env
```

Пример заполненного `.env`:
```
DB_USER=fixit
DB_PASSWORD=MyStr0ngP@ss!
REDIS_PASSWORD=RedisP@ss123
SECRET_KEY=любая_длинная_случайная_строка_минимум_32_символа
ENCRYPTION_KEY=F65rlKkjP8ZhOKCl/emNwxR7e+0erE093lVcbtw63Os=
```

> Для генерации ключей можно выполнить:
> ```bash
> python3 -c "import os,base64,secrets; print(f'SECRET_KEY={secrets.token_hex(32)}'); print(f'ENCRYPTION_KEY={base64.b64encode(os.urandom(32)).decode()}')"
> ```

Остальные поля (TELEGRAM_*, SMARTCAPTCHA_KEY, GRAFANA_PASSWORD) можно оставить пустыми — для теста не нужны.

### 3. Запустить
```bash
make up
```

Первый запуск займёт 3-5 минут (скачиваются образы, собираются контейнеры).
Дождитесь, пока все контейнеры запустятся:
```bash
docker compose ps
```
Должно быть 6 контейнеров в статусе `Up`.

### 4. Создать первого администратора
```bash
make create-admin
```
Введите логин, имя и пароль по запросу (пароль минимум 8 символов).

### 5. Открыть в браузере

| Что | Адрес |
|-----|-------|
| Тестовая страница с виджетом | http://localhost/test |
| Админ-панель | http://localhost/admin/ |
| Swagger API | http://localhost/docs |

---

## Управление

### Запуск и остановка

```bash
make up             # Запустить все контейнеры (с пересборкой, если код изменился)
make down           # Остановить все контейнеры
```

### Перезагрузка

**Перезагрузить всё** (все 6 контейнеров):
```bash
make down && make up
```

**Перезагрузить только backend** (без пересборки, быстро):
```bash
docker compose restart backend
```

**Перезагрузить backend с пересборкой** (если менялся код Python):
```bash
docker compose up -d --build backend
```

**Перезагрузить виджет или админку** (если менялся код TypeScript):
```bash
docker compose build --no-cache widget && docker compose up -d widget
docker compose build --no-cache admin && docker compose up -d admin
```

**Перезагрузить nginx** (если менялась конфигурация):
```bash
docker compose restart nginx
```

### Логи и отладка

```bash
make logs                          # Логи backend (в реальном времени)
docker compose logs -f widget      # Логи виджета
docker compose logs -f admin       # Логи админки
docker compose logs -f nginx       # Логи nginx
docker compose logs -f             # Логи всех контейнеров
```

### Администрирование

```bash
make create-admin    # Создать нового администратора
make shell           # Зайти в контейнер backend (bash)
make migrate         # Применить миграции БД
make backup          # Ручной бэкап базы данных
make test            # Запустить тесты
```

### Статус контейнеров

```bash
docker compose ps    # Показать статус всех контейнеров
```

Все 6 контейнеров должны быть в статусе `Up`:
- `postgres` — база данных
- `redis` — кеш и pub/sub
- `backend` — API-сервер
- `admin` — админ-панель
- `widget` — виджет чата
- `nginx` — reverse proxy

---

## Доступ из локальной сети

Узнать IP-адрес сервера:
```bash
hostname -I | awk '{print $1}'
```

Если сервер на машине `10.66.0.192`, то коллеги из той же сети могут открыть:

| Что | Адрес |
|-----|-------|
| Тестовая страница с виджетом | http://10.66.0.192/test |
| Админ-панель | http://10.66.0.192/admin/ |

Убедитесь, что файрвол разрешает порт 80:
```bash
sudo ufw allow 80/tcp    # Ubuntu с UFW
```

---

## Как тестировать

1. Откройте тестовую страницу — это имитация сайта клиента с виджетом чата
2. Нажмите на кнопку чата (правый нижний угол)
3. Заполните форму, отправьте сообщение
4. Откройте админ-панель на другом компьютере/вкладке
5. Залогиньтесь под созданным админом
6. В разделе «Сессии» появится обращение — откройте его
7. Ответьте — ответ появится в виджете мгновенно со звуком
8. Посетитель может закрыть чат кнопкой «Завершить чат» и оценить

---

## Решение проблем

**Контейнер не запускается:**
```bash
docker compose logs <имя_контейнера>    # Посмотреть ошибку
docker compose up -d --build             # Пересобрать и запустить
```

**Порт 80 занят:**
```bash
sudo lsof -i :80    # Узнать, кто занимает порт
```

**Сбросить всё и начать заново** (удалит данные БД!):
```bash
make down
docker volume rm fixit-mail_postgres_data fixit-mail_redis_data
make up
make create-admin
```

---

## Отличия тестового режима от продакшена

| Аспект | Тестовый режим | Продакшен |
|--------|---------------|-----------|
| Протокол | HTTP (данные не шифруются в сети) | HTTPS (Let's Encrypt) |
| Домен | IP-адрес | chat.fixitmail.ru |
| CORS | Разрешены все домены (`*`) | Только fixitmail.ru |
| IP whitelist | Отключён (доступ со всех IP) | Только разрешённые IP для админки |
| SmartCaptcha | Отключена | Yandex SmartCaptcha на форме |
| Telegram | Не настроен | Уведомления о новых обращениях |
| Мониторинг | Не настроен | Prometheus + Grafana |
| SSL сертификат | Нет | Wildcard *.fixitmail.ru |
| Персональные данные | В БД зашифрованы (AES-256), но передаются по HTTP | Зашифрованы и в БД, и при передаче |

**Для демо в офисной сети тестовый режим полностью безопасен** — трафик не выходит в интернет.

Для перехода на продакшен нужно: добавить DNS-запись `chat.fixitmail.ru`, настроить SSL, заполнить CORS/IP whitelist/Telegram в настройках админки.
