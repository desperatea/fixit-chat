.PHONY: up down logs test create-admin backup shell migrate makemigrations

# === Для продакшена (на сервере) ===

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f backend

create-admin:
	docker compose exec backend python -m app.cli create-admin

backup:
	./scripts/backup.sh

# === Для разработки ===

test:
	docker compose exec backend pytest -v

shell:
	docker compose exec backend bash

migrate:
	docker compose exec backend alembic upgrade head

makemigrations:
	@read -p "Описание миграции: " msg; \
	docker compose exec backend alembic revision --autogenerate -m "$$msg"
	docker compose cp backend:/app/alembic/versions/ /tmp/_mig_tmp/
	find /tmp/_mig_tmp -name '*.py' -exec cp {} backend/alembic/versions/ \;
	rm -rf /tmp/_mig_tmp
	@echo "Миграция скопирована в backend/alembic/versions/"
