"""Demand forecasting methods and accuracy metrics."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing, Holt, SimpleExpSmoothing
except ImportError:  # pragma: no cover
    ExponentialSmoothing = Holt = SimpleExpSmoothing = None


def moving_average(data: np.ndarray, window: int = 3, periods: int = 8) -> List[float]:
    series = np.asarray(data, dtype=float).copy()
    window = max(1, min(int(window), len(series)))
    result = []
    for _ in range(periods):
        avg = float(np.mean(series[-window:]))
        result.append(max(0.0, round(avg, 2)))
        series = np.append(series, avg)
    return result


def exponential_smoothing(data: np.ndarray, alpha: float = 0.3, periods: int = 8) -> List[float]:
    series = np.asarray(data, dtype=float)
    alpha = float(np.clip(alpha, 0.01, 0.99))
    if SimpleExpSmoothing is None or len(series) < 2:
        return moving_average(series, window=3, periods=periods)
    model = SimpleExpSmoothing(series, initialization_method="estimated").fit(
        smoothing_level=alpha, optimized=False
    )
    fc = model.forecast(periods)
    return [max(0.0, round(float(x), 2)) for x in fc]


def double_exponential(
    data: np.ndarray,
    alpha: float = 0.3,
    beta: float = 0.1,
    periods: int = 8,
) -> List[float]:
    series = np.asarray(data, dtype=float)
    alpha = float(np.clip(alpha, 0.01, 0.99))
    beta = float(np.clip(beta, 0.01, 0.99))
    if Holt is None or len(series) < 2:
        return exponential_smoothing(series, alpha=alpha, periods=periods)
    model = Holt(series, initialization_method="estimated").fit(
        smoothing_level=alpha, smoothing_trend=beta, optimized=False
    )
    fc = model.forecast(periods)
    return [max(0.0, round(float(x), 2)) for x in fc]


def holt_winters(
    data: np.ndarray,
    periods: int = 8,
    trend: str = "add",
    seasonal: str = "add",
    seasonal_periods: int = 4,
    alpha: Optional[float] = None,
) -> List[float]:
    series = np.asarray(data, dtype=float)
    seasonal_periods = int(seasonal_periods) if seasonal_periods in (4, 12) else 4
    if ExponentialSmoothing is None or len(series) < seasonal_periods * 2:
        return double_exponential(series, periods=periods)
    kwargs: Dict[str, Any] = {
        "trend": trend if trend in ("add", "mul") else "add",
        "seasonal": seasonal if seasonal in ("add", "mul") else "add",
        "seasonal_periods": seasonal_periods,
        "initialization_method": "estimated",
    }
    model = ExponentialSmoothing(series, **kwargs)
    if alpha is not None:
        fitted = model.fit(smoothing_level=float(np.clip(alpha, 0.01, 0.99)), optimized=False)
    else:
        fitted = model.fit(optimized=True)
    fc = fitted.forecast(periods)
    return [max(0.0, round(float(x), 2)) for x in fc]


def forecast_with_method(
    data: List[float],
    method: str,
    periods: int = 8,
    params: Optional[Dict[str, Any]] = None,
) -> List[float]:
    params = params or {}
    arr = np.asarray(data, dtype=float)
    if len(arr) == 0:
        return [0.0] * periods

    if method == "moving_average":
        return moving_average(arr, window=int(params.get("ma_window", 3)), periods=periods)
    if method == "exponential_smoothing":
        return exponential_smoothing(arr, alpha=float(params.get("alpha", 0.3)), periods=periods)
    if method == "double_exponential":
        return double_exponential(
            arr,
            alpha=float(params.get("alpha", 0.3)),
            beta=float(params.get("beta", 0.1)),
            periods=periods,
        )
    if method == "holt_winters":
        return holt_winters(
            arr,
            periods=periods,
            trend=str(params.get("trend", "add")),
            seasonal=str(params.get("seasonal", "add")),
            seasonal_periods=int(params.get("seasonal_periods", 4)),
            alpha=params.get("alpha"),
        )
    raise ValueError(f"Unknown forecast method: {method}")


def confidence_bounds(values: List[float], historical: np.ndarray) -> Tuple[List[float], List[float]]:
    """Simple residual-based interval (±1.96 * residual std)."""
    hist = np.asarray(historical, dtype=float)
    if len(hist) >= 2:
        # Use recent absolute diffs as proxy for residual noise
        diffs = np.diff(hist[-min(8, len(hist)) :])
        sigma = float(np.std(diffs)) if len(diffs) else float(np.std(hist)) * 0.2
    else:
        sigma = float(np.mean(values)) * 0.1 if values else 1.0
    sigma = max(sigma, 0.5)
    lower = [max(0.0, round(v - 1.96 * sigma, 2)) for v in values]
    upper = [round(v + 1.96 * sigma, 2) for v in values]
    return lower, upper


def holdout_accuracy(
    data: List[float],
    method: str,
    params: Optional[Dict[str, Any]] = None,
    holdout: int = 4,
) -> Dict[str, float]:
    """Train on all but last `holdout` points; score against holdout actuals."""
    arr = np.asarray(data, dtype=float)
    if len(arr) <= holdout + 1:
        holdout = max(1, len(arr) // 4)
    if holdout < 1 or len(arr) <= holdout:
        return {"mape": 0.0, "mad": 0.0, "bias": 0.0}

    train = arr[:-holdout]
    actual = arr[-holdout:]
    try:
        pred = forecast_with_method(train.tolist(), method, periods=holdout, params=params)
    except Exception:
        pred = moving_average(train, window=min(3, len(train)), periods=holdout)

    pred = np.asarray(pred[:holdout], dtype=float)
    actual = np.asarray(actual, dtype=float)
    abs_err = np.abs(actual - pred)
    mad = float(np.mean(abs_err))
    bias = float(np.mean(pred - actual))
    nonzero = actual != 0
    if np.any(nonzero):
        mape = float(np.mean(abs_err[nonzero] / np.abs(actual[nonzero])) * 100)
    else:
        mape = 0.0
    return {
        "mape": round(mape, 1),
        "mad": round(mad, 1),
        "bias": round(bias, 1),
    }
