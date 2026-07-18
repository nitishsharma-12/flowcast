"""External risk-signal providers used by the Flowcast forecast workflow."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

import httpx


DEFAULT_MANUFACTURING_HUBS = [
    {"name": "Los Angeles", "lat": 34.05, "lon": -118.24},
    {"name": "Houston", "lat": 29.76, "lon": -95.37},
    {"name": "Chicago", "lat": 41.85, "lon": -87.65},
    {"name": "New York", "lat": 40.71, "lon": -74.00},
]

FRED_SERIES = [
    ("Consumer Confidence", "UMCSENT"),
    ("Industrial Production", "INDPRO"),
    ("Inflation (CPI)", "CPIAUCSL"),
    ("Unemployment", "UNRATE"),
]

NEWS_QUERIES = [
    "supply chain disruption",
    "port strike logistics",
    "semiconductor shortage",
    "freight delay shipping",
    "manufacturing disruption",
]

RISK_RANK = {"NONE": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3}


def _warning(message: str) -> str:
    return f"External risk data unavailable: {message}"


def weather_risk(code: int) -> tuple[str, int, str]:
    if 95 <= code <= 99:
        return "HIGH", 15, "Thunderstorm or hail expected"
    if 71 <= code <= 77:
        return "MEDIUM", 10, "Snow expected"
    if 61 <= code <= 67:
        return "LOW", 5, "Rain expected"
    if 0 <= code <= 3:
        return "NONE", 0, "Clear conditions"
    if 80 <= code <= 94:
        return "MEDIUM", 10, "Severe precipitation expected"
    if 51 <= code <= 70 or 78 <= code <= 79:
        return "LOW", 5, "Wet weather expected"
    return "NONE", 0, "No significant weather risk"


def fetch_weather(locations: Iterable[dict[str, Any]] | None = None) -> dict[str, Any]:
    location_rows = list(locations or DEFAULT_MANUFACTURING_HUBS)
    results: list[dict[str, Any]] = []
    warnings: list[str] = []

    with httpx.Client(timeout=8.0) as client:
        for location in location_rows:
            try:
                response = client.get(
                    "https://api.open-meteo.com/v1/forecast",
                    params={
                        "latitude": location["lat"],
                        "longitude": location["lon"],
                        "daily": "weathercode,precipitation_sum,windspeed_10m_max",
                        "forecast_days": 14,
                        "timezone": "auto",
                    },
                )
                response.raise_for_status()
                daily = response.json().get("daily", {})
                codes = daily.get("weathercode") or daily.get("weather_code") or []
                precipitation = daily.get("precipitation_sum") or []
                winds = daily.get("windspeed_10m_max") or daily.get("wind_speed_10m_max") or []
                if not codes:
                    raise ValueError("forecast contained no daily weather codes")

                scored = [(RISK_RANK[weather_risk(int(code))[0]], idx, int(code)) for idx, code in enumerate(codes)]
                _, risk_day, code = max(scored)
                level, buffer_pct, description = weather_risk(code)
                results.append(
                    {
                        "name": location["name"],
                        "lat": location["lat"],
                        "lon": location["lon"],
                        "weather_code": code,
                        "risk_level": level,
                        "description": description,
                        "buffer_recommendation": buffer_pct,
                        "precipitation": round(float(precipitation[risk_day]), 1)
                        if risk_day < len(precipitation)
                        else 0,
                        "max_wind": round(max((float(value) for value in winds), default=0), 1),
                    }
                )
            except Exception as exc:
                warnings.append(f"{location['name']}: {exc}")

    overall = max(results, key=lambda row: RISK_RANK[row["risk_level"]], default=None)
    payload: dict[str, Any] = {
        "locations": results,
        "overall_risk": overall["risk_level"] if overall else "NONE",
        "recommended_buffer": max((row["buffer_recommendation"] for row in results), default=0),
    }
    if warnings:
        payload["warning"] = _warning("; ".join(warnings))
    return payload


def _fred_interpretation(name: str, change: float, adjustment: int) -> str:
    if name == "Consumer Confidence":
        if adjustment < 0:
            return "Consumer confidence falling — expect softer demand"
        if adjustment > 0:
            return "Consumer confidence rising — expect stronger demand"
        return "Consumer confidence is broadly stable"
    if name == "Industrial Production":
        return (
            "Industrial production is growing — demand may strengthen"
            if change > 0
            else "Industrial production is flat or falling"
        )
    if name == "Inflation (CPI)":
        return (
            "Inflation is accelerating — purchasing power may soften"
            if adjustment < 0
            else "Inflation change is not materially affecting demand"
        )
    return (
        "Unemployment is rising — monitor demand"
        if change > 0
        else "Unemployment is stable or improving"
    )


def _economic_adjustment(name: str, change: float) -> int:
    if name == "Consumer Confidence":
        return 8 if change > 5 else -8 if change < -5 else 0
    if name == "Inflation (CPI)" and change > 0.5:
        return -5
    if name == "Industrial Production" and change > 0:
        return 5
    return 0


def fetch_economic(api_key: str) -> dict[str, Any]:
    if not api_key or api_key.startswith("your_"):
        return {
            "indicators": [],
            "overall_demand_adjustment": 0,
            "signal": "NEUTRAL",
            "warning": "FRED_API_KEY is not configured",
        }

    indicators: list[dict[str, Any]] = []
    warnings: list[str] = []
    with httpx.Client(timeout=8.0) as client:
        for name, series_id in FRED_SERIES:
            try:
                response = client.get(
                    "https://api.stlouisfed.org/fred/series/observations",
                    params={
                        "series_id": series_id,
                        "api_key": api_key,
                        "limit": 2,
                        "sort_order": "desc",
                        "file_type": "json",
                    },
                )
                response.raise_for_status()
                valid = [
                    float(row["value"])
                    for row in response.json().get("observations", [])
                    if row.get("value") not in (None, ".")
                ]
                if len(valid) < 2:
                    raise ValueError("fewer than two valid observations")
                current, previous = valid[0], valid[1]
                change = current - previous
                change_pct = (change / previous * 100) if previous else 0
                adjustment = _economic_adjustment(name, change)
                if adjustment > 0:
                    impact = "POSITIVE"
                elif adjustment < 0:
                    impact = "NEGATIVE"
                else:
                    impact = "NEUTRAL"
                indicators.append(
                    {
                        "name": name,
                        "series_id": series_id,
                        "current_value": round(current, 2),
                        "previous_value": round(previous, 2),
                        "change": round(change, 2),
                        "change_pct": round(change_pct, 2),
                        "impact": impact,
                        "demand_adjustment": adjustment,
                        "interpretation": _fred_interpretation(name, change, adjustment),
                    }
                )
            except Exception as exc:
                warnings.append(f"{name}: {exc}")

    total = max(-30, min(30, sum(row["demand_adjustment"] for row in indicators)))
    payload: dict[str, Any] = {
        "indicators": indicators,
        "overall_demand_adjustment": total,
        "signal": "BULLISH" if total > 0 else "BEARISH" if total < 0 else "NEUTRAL",
    }
    if warnings:
        payload["warning"] = _warning("; ".join(warnings))
    return payload


def article_risk(title: str, description: str = "") -> tuple[str, int]:
    content = f"{title} {description}".lower()
    if any(word in content for word in ("shutdown", "strike", "shortage", "crisis", "halt")):
        return "HIGH", 12
    if any(word in content for word in ("delay", "disruption", "concern")):
        return "MEDIUM", 8
    if any(word in content for word in ("warning", "risk", "monitor", "watch")):
        return "LOW", 4
    return "NONE", 0


def fetch_news(api_key: str) -> dict[str, Any]:
    if not api_key or api_key.startswith("your_"):
        return {
            "articles": [],
            "total_articles": 0,
            "high_risk_count": 0,
            "overall_risk": "NONE",
            "recommended_buffer": 0,
            "warning": "NEWS_API_KEY is not configured",
        }

    articles_by_url: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    with httpx.Client(timeout=8.0) as client:
        for query in NEWS_QUERIES:
            try:
                response = client.get(
                    "https://newsapi.org/v2/everything",
                    params={
                        "q": query,
                        "sortBy": "publishedAt",
                        "pageSize": 3,
                        "language": "en",
                        "apiKey": api_key,
                    },
                )
                response.raise_for_status()
                for article in response.json().get("articles", []):
                    url = article.get("url")
                    title = article.get("title") or "Untitled article"
                    if not url or url in articles_by_url:
                        continue
                    level, buffer_pct = article_risk(title, article.get("description") or "")
                    if level == "NONE":
                        continue
                    articles_by_url[url] = {
                        "title": title,
                        "source": (article.get("source") or {}).get("name") or "Unknown source",
                        "published_at": article.get("publishedAt"),
                        "risk_level": level,
                        "url": url,
                        "buffer_recommendation": buffer_pct,
                    }
            except Exception as exc:
                warnings.append(f"{query}: {exc}")

    articles = sorted(
        articles_by_url.values(),
        key=lambda row: (
            RISK_RANK[row["risk_level"]],
            row.get("published_at") or "",
        ),
        reverse=True,
    )
    highest = max(articles, key=lambda row: RISK_RANK[row["risk_level"]], default=None)
    payload: dict[str, Any] = {
        "articles": articles,
        "total_articles": len(articles),
        "high_risk_count": sum(row["risk_level"] == "HIGH" for row in articles),
        "overall_risk": highest["risk_level"] if highest else "NONE",
        "recommended_buffer": max((row["buffer_recommendation"] for row in articles), default=0),
    }
    if warnings:
        payload["warning"] = _warning("; ".join(warnings))
    return payload


def combine_risk(
    weather: dict[str, Any],
    economic: dict[str, Any],
    news: dict[str, Any],
) -> dict[str, Any]:
    components = {
        "weather": int(weather.get("recommended_buffer", 0) or 0),
        "economic": int(economic.get("overall_demand_adjustment", 0) or 0),
        "news": int(news.get("recommended_buffer", 0) or 0),
    }
    total = max(-30, min(30, sum(components.values())))
    overall = max(
        (weather.get("overall_risk", "NONE"), news.get("overall_risk", "NONE")),
        key=lambda level: RISK_RANK.get(level, 0),
    )
    warnings = [
        value["warning"]
        for value in (weather, economic, news)
        if value.get("warning")
    ]
    return {
        "weather": weather,
        "economic": economic,
        "news": news,
        "components": components,
        "total_adjustment": total,
        "overall_risk": overall,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "warnings": warnings,
        "partial_data": bool(warnings),
    }
