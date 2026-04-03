"""
Test fixtures for FixIT Chat backend.
Uses the same PostgreSQL and Redis from Docker Compose.
Creates a separate test database to avoid polluting production data.
"""
import asyncio
import uuid
from collections.abc import AsyncGenerator

import pytest
import redis.asyncio as aioredis
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import hash_password, create_access_token
from app.models.base import Base
from app.models.agent import Agent  # noqa: F401 - needed for Base.metadata
from app.models.session import ChatSession  # noqa: F401
from app.models.message import Message  # noqa: F401
from app.models.attachment import Attachment  # noqa: F401
from app.models.note import SessionNote  # noqa: F401
from app.models.settings import WidgetSettings  # noqa: F401
from app.models.login_attempt import LoginAttempt  # noqa: F401


# ─── Test database URL ───
# Replace the DB name with a test-specific one
TEST_DB_URL = settings.database_url.rsplit("/", 1)[0] + "/fixit_chat_test"
ADMIN_DB_URL = settings.database_url  # to create/drop test DB


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session", autouse=True)
async def setup_test_database():
    """Create test database, run migrations, and drop it after tests."""
    # Connect to default DB to create test DB
    admin_engine = create_async_engine(ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    async with admin_engine.connect() as conn:
        # Drop existing test DB if any
        await conn.execute(text("DROP DATABASE IF EXISTS fixit_chat_test"))
        await conn.execute(text("CREATE DATABASE fixit_chat_test"))
    await admin_engine.dispose()

    # Create all tables in test DB
    test_engine = create_async_engine(TEST_DB_URL)
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await test_engine.dispose()

    yield

    # Cleanup: drop test DB
    admin_engine = create_async_engine(ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    async with admin_engine.connect() as conn:
        await conn.execute(text(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = 'fixit_chat_test' AND pid <> pg_backend_pid()"
        ))
        await conn.execute(text("DROP DATABASE IF EXISTS fixit_chat_test"))
    await admin_engine.dispose()


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a clean database session for each test."""
    engine = create_async_engine(TEST_DB_URL)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.fixture
async def clean_db(db_session: AsyncSession):
    """Clean all tables before each test that needs it."""
    for table in reversed(Base.metadata.sorted_tables):
        await db_session.execute(table.delete())
    await db_session.commit()


@pytest.fixture
async def redis_client() -> AsyncGenerator[aioredis.Redis, None]:
    """Provide a Redis client, clean all test keys before and after."""
    client = aioredis.from_url(settings.redis_url, decode_responses=True)
    # Clean before test
    for pattern in ("refresh:*", "rate_limit:*", "ratelimit:*"):
        keys = await client.keys(pattern)
        if keys:
            await client.delete(*keys)
    yield client
    # Clean after test
    for pattern in ("refresh:*", "rate_limit:*", "ratelimit:*"):
        keys = await client.keys(pattern)
        if keys:
            await client.delete(*keys)
    await client.aclose()


@pytest.fixture
async def test_agent(db_session: AsyncSession, clean_db) -> Agent:
    """Create a test agent."""
    from app.repositories.agent_repo import AgentRepository
    repo = AgentRepository(db_session)
    agent = await repo.create(
        username="testadmin",
        password_hash=hash_password("TestPass123"),
        display_name="Test Admin",
        is_active=True,
    )
    await db_session.commit()
    return agent


@pytest.fixture
async def inactive_agent(db_session: AsyncSession, clean_db) -> Agent:
    """Create an inactive agent."""
    from app.repositories.agent_repo import AgentRepository
    repo = AgentRepository(db_session)
    agent = await repo.create(
        username="inactive_user",
        password_hash=hash_password("TestPass123"),
        display_name="Inactive Agent",
        is_active=False,
    )
    await db_session.commit()
    return agent


@pytest.fixture
def auth_token(test_agent: Agent) -> str:
    """Create a valid JWT access token for the test agent."""
    return create_access_token(test_agent.id)


@pytest.fixture
def auth_cookies(test_agent: Agent) -> dict:
    """Create access_token cookie dict for the test agent."""
    return {"access_token": create_access_token(test_agent.id)}


@pytest.fixture
async def test_session(db_session: AsyncSession, clean_db) -> ChatSession:
    """Create a test chat session with encrypted data."""
    from app.services.encryption_service import EncryptionService
    enc = EncryptionService()
    encrypted = enc.encrypt_session_data({
        "visitor_name": "Иван Петров",
        "visitor_phone": "+78634441160",
        "visitor_org": "ООО Тест",
        "initial_message": "Помогите с проблемой",
    })

    from app.repositories.session_repo import SessionRepository
    repo = SessionRepository(db_session)
    session = await repo.create(
        visitor_name=encrypted["visitor_name"],
        visitor_phone=encrypted["visitor_phone"],
        visitor_org=encrypted["visitor_org"],
        initial_message=encrypted["initial_message"],
        visitor_token=uuid.uuid4().hex,
        consent_given=True,
        custom_fields={},
    )
    await db_session.commit()
    return session


@pytest.fixture
async def test_settings(db_session: AsyncSession, clean_db):
    """Create widget settings (singleton)."""
    from app.repositories.settings_repo import SettingsRepository
    repo = SettingsRepository(db_session)
    s = await repo.get_or_create()
    await db_session.commit()
    return s


@pytest.fixture
async def client(
    db_session: AsyncSession,
    redis_client: aioredis.Redis,
) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client with overridden dependencies."""
    from app.main import create_app
    from app.core.database import get_db, async_session_factory
    from app.core.redis import get_redis
    from app.api.deps import get_redis_client

    # Clean login_attempts in the main DB (used by brute force middleware)
    async with async_session_factory() as main_db:
        await main_db.execute(text("DELETE FROM login_attempts"))
        await main_db.commit()

    app = create_app()

    async def override_get_db():
        yield db_session

    def override_get_redis():
        return redis_client

    async def override_get_redis_client():
        return redis_client

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis
    app.dependency_overrides[get_redis_client] = override_get_redis_client

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
