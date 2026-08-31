from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from config import get_settings


def prepare_database_url(raw: str) -> tuple[str, dict]:
    """Normalize host-provided Postgres URLs for SQLAlchemy + asyncpg."""
    url = (raw or "").strip()
    connect_args: dict = {}
    if not url:
        return url, connect_args

    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]

    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    sslmode = query.pop("sslmode", None)
    query.pop("ssl", None)
    host = parsed.hostname or ""
    local = host in {"localhost", "127.0.0.1"}
    public_host = "." in host
    if sslmode in {"require", "verify-ca", "verify-full"} or (
        not local and public_host and sslmode != "disable"
    ):
        connect_args["ssl"] = True

    url = urlunparse(parsed._replace(query=urlencode(query)))
    return url, connect_args


settings = get_settings()
_db_url, _connect_args = prepare_database_url(settings.database_url)
engine = create_async_engine(
    _db_url,
    echo=False,
    connect_args=_connect_args,
    pool_pre_ping=True,
)
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Add new User columns if missing (e.g. phone, job_title, profile_photo_url)
        # Each ALTER TABLE runs inside its own SAVEPOINT so that a failure for an
        # existing column doesn't leave the whole transaction in "aborted" state.
        def add_user_columns(sync_conn):
            sa_text = __import__("sqlalchemy").text

            for col, spec in [
                ("phone", "VARCHAR(50)"),
                ("job_title", "VARCHAR(255)"),
                ("profile_photo_url", "VARCHAR(512)"),
                ("profile_photo_content_type", "VARCHAR(128)"),
                ("profile_photo_data", "BYTEA"),
                ("password_change_code_hash", "VARCHAR(128)"),
                ("password_change_code_expires_at", "TIMESTAMPTZ"),
                ("password_change_code_last_sent_at", "TIMESTAMPTZ"),
                ("password_change_code_attempts", "INTEGER DEFAULT 0"),
            ]:
                # Use a nested transaction (SAVEPOINT) per column so that a
                # single failure doesn't abort the entire connection transaction.
                nested = sync_conn.begin_nested()
                try:
                    sync_conn.execute(
                        sa_text(f"ALTER TABLE users ADD COLUMN {col} {spec}")
                    )
                    nested.commit()
                except Exception:
                    # Column probably already exists – rollback this SAVEPOINT only.
                    nested.rollback()

        await conn.run_sync(add_user_columns)
