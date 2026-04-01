import asyncio
import getpass
import sys

from sqlalchemy import select

from app.core.database import async_session_factory
from app.core.security import hash_password
from app.models.agent import Agent


async def _create_admin():
    print("=== Создание администратора FixIT Chat ===\n")

    username = input("Логин: ").strip()
    if not username or len(username) < 3:
        print("Ошибка: логин должен быть не менее 3 символов")
        sys.exit(1)

    display_name = input("Имя для отображения: ").strip()
    if not display_name:
        print("Ошибка: имя не может быть пустым")
        sys.exit(1)

    password = getpass.getpass("Пароль: ")
    if len(password) < 8:
        print("Ошибка: пароль должен быть не менее 8 символов")
        sys.exit(1)

    password_confirm = getpass.getpass("Повторите пароль: ")
    if password != password_confirm:
        print("Ошибка: пароли не совпадают")
        sys.exit(1)

    async with async_session_factory() as session:
        existing = await session.execute(
            select(Agent).where(Agent.username == username)
        )
        if existing.scalar_one_or_none():
            print(f"Ошибка: логин '{username}' уже существует")
            sys.exit(1)

        agent = Agent(
            username=username,
            password_hash=hash_password(password),
            display_name=display_name,
            is_active=True,
        )
        session.add(agent)
        await session.commit()

    print(f"\nАдминистратор '{username}' создан успешно!")


def create_admin():
    asyncio.run(_create_admin())
