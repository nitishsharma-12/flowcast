# Flowcast — Supply Chain Intelligence

> An end-to-end MRP automation platform powered by AI

![Python](https://img.shields.io/badge/Python-3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100-green)
![React](https://img.shields.io/badge/React-18-61dafb)
![SQLite](https://img.shields.io/badge/SQLite-3-lightblue)
![Claude AI](https://img.shields.io/badge/Claude-AI-orange)

## What it does
Flowcast automates Material Requirements Planning (MRP) — replacing
manual Excel → Python → SQL → Power BI pipelines with a live
AI-powered dashboard.

Upload any ERP export and Flowcast instantly calculates:
- Gross & net requirements across 8-week horizon
- Planned order releases with real calendar dates
- Stockout risk detection
- BOM explosion across multiple levels
- Safety stock & lot sizing (MOQ-based)

## Tech Stack
| Layer | Technology |
|---|---|
| MRP Engine | Python (pandas, openpyxl) |
| API | FastAPI + SQLite |
| Frontend | React + Recharts |
| AI Assistant | Claude API (claude-sonnet-4-6) |
| BI Export | Microsoft Fabric / Metabase |

## Pipeline

```
📄 Excel/ERP  →  🐍 Python MRP Engine  →  🗄️ SQLite  →  🤖 AI Dashboard
                                                          │
                                                          └──▶ 📊 Metabase BI (live connection)
```

1. **Ingest** — Upload an ERP/Excel export (or drop it in the watched folder for live sync).
2. **Map** — `excel_mapper.py` normalizes arbitrary column names into the canonical schema.
3. **Compute** — The Python MRP engine runs BOM explosion, gross-to-net netting, lot sizing, and lead-time offsetting.
4. **Store** — Results are persisted to SQLite and exposed through FastAPI endpoints.
5. **Explore** — The React dashboard renders the plan, and the Claude-powered assistant answers questions in natural language.

## Project Structure

```
mrp-app/
├── backend/
│   ├── main.py            # FastAPI app + MRP engine + Claude assistant
│   ├── database.py        # SQLAlchemy models
│   ├── excel_mapper.py    # ERP column mapping / normalization
│   ├── generate_sample.py # Sample data generator
│   └── requirements.txt
├── frontend/
│   ├── src/App.jsx        # Single-page React dashboard
│   └── package.json
└── start_metabase.sh      # Optional local Metabase launcher
```

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- An Anthropic API key (for the AI Assistant)

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Provide your Claude API key (never commit this)
export ANTHROPIC_API_KEY="sk-ant-..."

uvicorn main:app --reload --port 8000
```

The API runs at `http://localhost:8000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

The dashboard runs at `http://localhost:5173`.

### 3. Load data
Upload your own ERP export from the **Upload** page, or click **Load sample data**
to explore the app with generated demo data.

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key used by the AI Assistant. Required for chat; the rest of the app works without it. |

> **Security note:** API keys are read from the environment only. Never hardcode
> secrets in source or commit them to version control.

## Optional: Metabase BI

A local Metabase instance can connect directly to the SQLite database for
ad-hoc BI. The `metabase.jar` is not included in the repo (too large for GitHub) —
download it from [metabase.com](https://www.metabase.com/start/oss/) and run:

```bash
./start_metabase.sh
```

## Author
Built by Nitish Sharma · MS Engineering Management · San Jose State University
