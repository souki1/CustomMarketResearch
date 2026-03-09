from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from config import get_settings

settings = get_settings()
engine = create_async_engine(
    settings.database_url,
    echo=False,
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
        def add_user_columns(sync_conn):
            for col, spec in [
                ("phone", "VARCHAR(50)"),
                ("job_title", "VARCHAR(255)"),
                ("profile_photo_url", "VARCHAR(512)"),
            ]:
                try:
                    sync_conn.execute(
                        __import__("sqlalchemy").text(
                            f"ALTER TABLE users ADD COLUMN {col} {spec}"
                        )
                    )
                except Exception:
                    pass  # column already exists

        await conn.run_sync(add_user_columns)
