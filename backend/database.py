import os
from typing import Tuple

from sqlalchemy import Column, Float, Integer, String, create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

WEEKS = [f"W{i}" for i in range(1, 9)]

SQL_VIEWS = {
    "vw_stockout_risk": """
        SELECT
            item_id,
            item_name,
            week,
            projected_inventory,
            safety_stock,
            projected_inventory - safety_stock AS buffer
        FROM mrp_results
        WHERE projected_inventory < safety_stock
    """,
    "vw_planned_releases": """
        SELECT
            item_id,
            item_name,
            week,
            planned_order,
            release_date,
            need_date,
            is_overdue
        FROM mrp_results
        WHERE planned_order > 0
    """,
    "vw_supply_gap": """
        SELECT
            m.item_id,
            m.item_name,
            m.week,
            m.net_req,
            COALESCE(p.order_qty, 0) AS on_order,
            m.net_req - COALESCE(p.order_qty, 0) AS gap
        FROM mrp_results m
        LEFT JOIN open_pos p ON m.item_id = p.item_id
            AND m.week = p.expected_receipt_week
        WHERE m.net_req > 0
    """,
}

VIEW_CREATE_SQL = {
    name: f"CREATE OR REPLACE VIEW {name} AS{body}"
    for name, body in SQL_VIEWS.items()
}


class Item(Base):
    __tablename__ = "items"
    item_id = Column(String, primary_key=True)
    item_name = Column(String)
    lead_time_weeks = Column(Integer)
    safety_stock = Column(Float)
    lot_size = Column(Float)
    unit = Column(String)
    unit_cost = Column(Float)
    available_qty = Column(Float, default=0)


class OpenPO(Base):
    __tablename__ = "open_pos"
    id = Column(Integer, primary_key=True, autoincrement=True)
    po_number = Column(String)
    item_id = Column(String)
    supplier = Column(String)
    order_qty = Column(Float)
    expected_receipt_week = Column(String)
    status = Column(String)


class MRPResult(Base):
    __tablename__ = "mrp_results"
    id = Column(Integer, primary_key=True, autoincrement=True)
    item_id = Column(String)
    item_name = Column(String)
    week = Column(String)
    gross_req = Column(Float)
    scheduled_receipts = Column(Float)
    projected_inventory = Column(Float)
    net_req = Column(Float)
    planned_order = Column(Float)
    safety_stock = Column(Float)
    stockout_risk = Column(Integer)
    need_date = Column(String, nullable=True)
    release_date = Column(String, nullable=True)
    release_week = Column(String, nullable=True)
    is_overdue = Column(Integer, default=0)


def _normalize_postgres_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgresql://") and "+psycopg2" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


def resolve_database_config() -> Tuple[str, str]:
    env_url = os.environ.get("DATABASE_URL")
    if env_url:
        return _normalize_postgres_url(env_url), "postgresql"

    pg_host = os.environ.get("POSTGRES_HOST")
    if pg_host:
        user = os.environ.get("POSTGRES_USER", "postgres")
        password = os.environ.get("POSTGRES_PASSWORD", "")
        port = os.environ.get("POSTGRES_PORT", "5432")
        db = os.environ.get("POSTGRES_DB", "mrp")
        url = f"postgresql+psycopg2://{user}:{password}@{pg_host}:{port}/{db}"
        return url, "postgresql"

    return "sqlite:///./mrp.db", "sqlite"


def create_engine_with_fallback():
    url, db_type = resolve_database_config()

    if db_type == "postgresql":
        try:
            import psycopg2  # noqa: F401

            eng = create_engine(url, pool_pre_ping=True)
            with eng.connect() as conn:
                conn.execute(text("SELECT 1"))
            return eng, db_type, url, None
        except Exception as exc:
            sqlite_url = "sqlite:///./mrp.db"
            eng = create_engine(sqlite_url, connect_args={"check_same_thread": False})
            return eng, "sqlite", sqlite_url, str(exc)

    eng = create_engine(url, connect_args={"check_same_thread": False})
    return eng, "sqlite", url, None


engine, DB_TYPE, DATABASE_URL, PG_FALLBACK_REASON = create_engine_with_fallback()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_database():
    Base.metadata.create_all(bind=engine)
    create_sql_views()


def create_sql_views():
    with engine.begin() as conn:
        for name, body in SQL_VIEWS.items():
            if DB_TYPE == "postgresql":
                conn.execute(text(f"CREATE OR REPLACE VIEW {name} AS{body}"))
            else:
                conn.execute(text(f"DROP VIEW IF EXISTS {name}"))
                conn.execute(text(f"CREATE VIEW {name} AS{body}"))


def get_db_display_url() -> str:
    if DB_TYPE == "postgresql":
        return DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else "PostgreSQL"
    return "SQLite (local file: mrp.db)"


def is_readonly_query(sql: str) -> bool:
    normalized = " ".join(sql.strip().split()).upper()
    if not normalized:
        return False
    forbidden = (
        "INSERT ", "UPDATE ", "DELETE ", "DROP ", "ALTER ", "CREATE ",
        "TRUNCATE ", "REPLACE ", "ATTACH ", "DETACH ",
    )
    if any(token in normalized for token in forbidden):
        return False
    return (
        normalized.startswith("SELECT")
        or normalized.startswith("WITH")
        or normalized.startswith("PRAGMA")
    )


init_database()
