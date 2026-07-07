import io
import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from database import WEEKS

ROLE_LABELS = {
    "item_master": "Item Master",
    "bom": "BOM",
    "inventory": "Inventory",
    "demand_forecast": "Demand Forecast",
    "open_pos": "Open POs",
}

ITEM_ID_ALIASES = [
    "Item_ID", "ItemID", "Item ID", "item_id", "SKU", "Part Number", "Part_No", "PartNumber",
    "product_id", "product id", "ProductID", "code", "item_code", "Item Code",
    "part_no", "PartNo", "id", "ID",
]

ITEM_MASTER_FIELDS = {
    "item_id": ITEM_ID_ALIASES,
    "item_name": ["Item_Name", "ItemName", "Item Name", "item_name", "Description", "Name", "Product Name"],
    "lead_time_weeks": [
        "Lead_Time_Weeks", "Lead Time", "LeadTime", "lead_time", "LT", "LT_Weeks",
        "lead_time_days", "leadtime_weeks", "procurement_time", "replenishment_time", "lt_weeks",
    ],
    "safety_stock": [
        "Safety_Stock", "Safety Stock", "SS", "Min Stock", "safety_stock", "Min_Stock",
        "safety_qty", "min_qty", "minimum_qty", "reorder_point", "ROP", "buffer_stock", "minimum_stock",
    ],
    "lot_size": [
        "Lot_Size", "Lot Size", "LotSize", "lot_size", "MOQ", "Min_Order_Qty",
        "order_qty", "min_order", "moq", "batch_size", "order_multiple",
    ],
    "unit": ["Unit", "UOM", "unit", "Unit_of_Measure", "uom", "measure", "unit_of_measure", "units"],
    "unit_cost": [
        "Unit_Cost", "Unit Cost", "UnitCost", "unit_cost", "Cost", "Price",
        "cost", "price", "unit_price", "standard_cost",
    ],
}

BOM_FIELDS = {
    "parent": [
        "Parent_Item", "Parent Item", "Parent", "parent_item", "ParentItem",
        "parent", "assembly", "finished_good", "fg", "parent_part", "finished_item",
    ],
    "child": [
        "Child_Item", "Child Item", "Child", "child_item", "ChildItem", "Component",
        "child", "component", "material", "raw_material", "part", "ingredient", "child_part",
    ],
    "qty_per": [
        "Qty_Per", "Qty Per", "Quantity", "qty_per", "Qty", "BOM_Qty",
        "quantity", "qty", "quantity_per", "usage", "usage_qty", "bom_quantity",
    ],
}

INVENTORY_FIELDS = {
    "item_id": ITEM_ID_ALIASES,
    "on_hand": [
        "On_Hand_Qty", "On Hand", "OnHand", "on_hand", "Qty_On_Hand", "On_Hand",
        "qty_on_hand", "stock", "current_stock", "balance", "qoh", "QOH",
    ],
    "allocated": ["Allocated_Qty", "Allocated", "allocated", "Qty_Allocated"],
    "available": [
        "Available_Qty", "Available", "available", "Stock", "Qty_Available", "On_Hand_Available",
    ],
}

OPEN_PO_FIELDS = {
    "po_number": [
        "PO_Number", "PO Number", "PONumber", "po_number", "PO", "Purchase_Order", "Order_Number",
        "po", "order_no", "order_number", "purchase_order_no", "po_no", "doc_number",
    ],
    "item_id": ITEM_ID_ALIASES,
    "supplier": [
        "Supplier", "Vendor", "supplier", "Supplier_Name",
        "vendor", "vendor_name", "supplier_name", "vendor_id", "source",
    ],
    "order_qty": ["Order_Qty", "Order Qty", "Quantity", "Qty", "order_qty", "PO_Qty"],
    "expected_receipt_week": [
        "Expected_Receipt_Week", "Receipt Week", "Arrival Week", "Due_Week",
        "Expected Week", "Receipt_Week", "Week",
        "due_date", "delivery_date", "arrival_date", "expected_date",
        "due_week", "delivery_week", "eta", "ETA",
    ],
    "status": ["Status", "PO_Status", "status", "Order_Status", "order_status", "po_status", "state", "condition"],
}

DEMAND_ITEM_ID_FIELDS = ITEM_ID_ALIASES

FIELD_LABELS = {
    "item_id": "Item ID",
    "item_name": "Item Name",
    "lead_time_weeks": "Lead Time",
    "safety_stock": "Safety Stock",
    "lot_size": "Lot Size",
    "unit": "Unit",
    "unit_cost": "Unit Cost",
    "parent": "Parent",
    "child": "Child",
    "qty_per": "Qty Per",
    "on_hand": "On Hand",
    "allocated": "Allocated",
    "available": "Available",
    "po_number": "PO Number",
    "supplier": "Supplier",
    "order_qty": "Order Qty",
    "expected_receipt_week": "Receipt Week",
    "status": "Status",
    "week_columns": "Week Columns",
}

REQUIRED_FIELDS = {
    "item_master": ["item_id", "item_name", "lead_time_weeks", "safety_stock", "lot_size", "unit", "unit_cost"],
    "bom": ["parent", "child", "qty_per"],
    "inventory": ["item_id"],
    "demand_forecast": ["item_id"],
    "open_pos": ["po_number", "item_id", "supplier", "order_qty", "expected_receipt_week", "status"],
}


class ExcelParseError(Exception):
    def __init__(self, errors: List[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def normalize_col(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def field_label(field: str) -> str:
    return FIELD_LABELS.get(field, field.replace("_", " ").title())


def find_column(columns: List[str], candidates: List[str]) -> Optional[str]:
    normalized = {normalize_col(c): c for c in columns}
    for cand in candidates:
        key = normalize_col(cand)
        if key in normalized:
            return normalized[key]
    return None


def map_columns(columns: List[str], field_spec: Dict[str, List[str]]) -> Tuple[Dict[str, str], List[Dict[str, Any]]]:
    mapped = {}
    missing = []
    for field, candidates in field_spec.items():
        col = find_column(columns, candidates)
        if col:
            mapped[field] = col
        else:
            missing.append({"field": field, "expected": candidates})
    return mapped, missing


def _report_entry(field: str, source_column: Optional[str], required: bool) -> Dict[str, Any]:
    return {
        "field": field,
        "label": field_label(field),
        "found": source_column is not None,
        "source_column": source_column,
        "required": required,
    }


_DEMAND_SEQ_PATTERNS = [
    re.compile(r"^w(\d+)$"),
    re.compile(r"^week(\d+)$"),
    re.compile(r"^wk(\d+)$"),
    re.compile(r"^p(\d+)$"),
    re.compile(r"^period(\d+)$"),
    re.compile(r"^month(\d+)$"),
]


def _looks_like_date(raw: Any) -> bool:
    s = str(raw).strip()
    patterns = [
        r"^\d{4}-\d{1,2}-\d{1,2}( 00:00:00)?$",   # 2024-01-01
        r"^\d{1,2}/\d{4}$",                        # 01/2024
        r"^\d{4}/\d{1,2}$",                        # 2024/01
        r"^\d{1,2}/\d{1,2}/\d{2,4}$",              # 01/02/2024
        r"^[A-Za-z]{3,9}[-\s]?\d{2,4}$",           # Jan-2024, January 2024
        r"^\d{2,4}[-\s][A-Za-z]{3,9}$",            # 2024-Jan
    ]
    return any(re.match(p, s) for p in patterns)


def detect_demand_columns(columns: List[str]) -> List[Tuple[int, Optional[int], str]]:
    """Return ordered list of (position, sequence_number_or_None, source_column) for demand-like columns."""
    matches: List[Tuple[int, Optional[int], str]] = []
    for idx, col in enumerate(columns):
        norm = normalize_col(col)
        seq = None
        for pat in _DEMAND_SEQ_PATTERNS:
            m = pat.match(norm)
            if m:
                seq = int(m.group(1))
                break
        if seq is not None:
            matches.append((idx, seq, str(col)))
        elif _looks_like_date(col):
            matches.append((idx, None, str(col)))
    return matches


def build_demand_week_map(columns: List[str]) -> Dict[str, str]:
    """Map detected demand columns to canonical W1..W8 labels."""
    detected = detect_demand_columns(columns)[:8]
    if not detected:
        return {}

    seqs = [seq for _, seq, _ in detected]
    all_numbered = all(s is not None for s in seqs)
    in_range = all(s is not None and 1 <= s <= 8 for s in seqs)
    unique = len(set(seqs)) == len(seqs)
    if all_numbered and in_range and unique:
        return {f"W{seq}": src for _, seq, src in detected}

    return {f"W{i + 1}": src for i, (_, _, src) in enumerate(detected)}


def _column_text(columns: List[str]) -> str:
    return " ".join(normalize_col(c) for c in columns)


def score_sheet_role(columns: List[str], role: str) -> int:
    text = _column_text(columns)
    score = 0

    if role == "item_master":
        if any(k in text for k in ("leadtime", "ltweeks", "leadtimeweeks", "procurementtime", "replenishmenttime")) or "lt" in text.split():
            score += 4
        if any(k in text for k in ("safetystock", "minstock", "reorderpoint", "bufferstock", "safetyqty")) or " ss " in f" {text} ":
            score += 3
        if any(k in text for k in ("itemid", "sku", "partnumber", "partno", "productid", "itemcode")):
            score += 4
        if "lot" in text or "moq" in text or "batchsize" in text:
            score += 1
        if "unitcost" in text or "cost" in text:
            score += 1

    elif role == "bom":
        if any(k in text for k in ("parent", "assembly", "finishedgood", "finisheditem")):
            score += 5
        if any(k in text for k in ("child", "component", "material", "ingredient")):
            score += 5
        if "qty" in text or "quantity" in text or "usage" in text:
            score += 2

    elif role == "inventory":
        if any(k in text for k in ("onhand", "inventory", "stock", "available", "balance", "qoh")):
            score += 5
        if any(k in text for k in ("itemid", "sku", "partnumber", "productid")):
            score += 3

    elif role == "demand_forecast":
        score += len(detect_demand_columns(columns)) * 2
        if any(k in text for k in ("itemid", "sku", "partnumber", "productid")):
            score += 4
        if "forecast" in text or "demand" in text:
            score += 2

    elif role == "open_pos":
        if "supplier" in text or "vendor" in text:
            score += 4
        if "po" in text or "purchaseorder" in text or "ordernumber" in text or "orderno" in text:
            score += 4
        if any(k in text for k in ("itemid", "sku", "partnumber", "productid")):
            score += 2
        if "status" in text:
            score += 1

    return score


def detect_sheet_roles(sheets: Dict[str, pd.DataFrame]) -> Dict[str, Optional[str]]:
    roles = list(ROLE_LABELS.keys())
    assignments: Dict[str, Optional[str]] = {r: None for r in roles}
    used_sheets = set()

    scores: List[Tuple[int, str, str]] = []
    for sheet_name, df in sheets.items():
        cols = [str(c) for c in df.columns]
        for role in roles:
            scores.append((score_sheet_role(cols, role), role, sheet_name))

    scores.sort(reverse=True)
    for score, role, sheet_name in scores:
        if score <= 0:
            continue
        if assignments[role] is not None:
            continue
        if sheet_name in used_sheets:
            continue
        assignments[role] = sheet_name
        used_sheets.add(sheet_name)

    return assignments


def _rename_df(df: pd.DataFrame, mapping: Dict[str, str], canonical_names: Dict[str, str]) -> pd.DataFrame:
    rename_map = {src: canonical_names[field] for field, src in mapping.items()}
    out = df.rename(columns=rename_map)
    return out[[canonical_names[f] for f in mapping]]


def _normalize_week_label(value: Any) -> str:
    text = str(value).strip().upper()
    match = re.match(r"^W(\d+)$", text) or re.match(r"^WEEK\s*(\d+)$", text)
    if match:
        n = int(match.group(1))
        if 1 <= n <= 8:
            return f"W{n}"
    return text


def build_normalized_sheets(sheets: Dict[str, pd.DataFrame], assignments: Dict[str, Optional[str]]):
    result = {}
    column_mappings: List[Dict[str, str]] = []
    errors: List[str] = []
    sheet_summaries = []

    def summary(role, label, sheet_name, df, fields):
        available = [str(c) for c in df.columns] if df is not None else []
        sheet_summaries.append({
            "role": role,
            "label": label,
            "sheet_name": sheet_name,
            "row_count": len(df) if df is not None else 0,
            "found": sheet_name is not None,
            "available_columns": available,
            "fields": fields,
        })

    # ---- Item Master ----
    role = "item_master"
    sheet_name = assignments.get(role)
    if not sheet_name:
        errors.append(
            "Could not find an Item Master sheet. Please make sure your file has a sheet with item IDs and lead times."
        )
        summary(role, ROLE_LABELS[role], None, None, [])
    else:
        df = sheets[sheet_name]
        available = [str(c) for c in df.columns]
        mapped, _ = map_columns(available, ITEM_MASTER_FIELDS)
        fields = [_report_entry(f, mapped.get(f), f in REQUIRED_FIELDS[role]) for f in ITEM_MASTER_FIELDS]
        for field in REQUIRED_FIELDS[role]:
            if field not in mapped:
                spec = ITEM_MASTER_FIELDS[field]
                errors.append(
                    f"Found Item Master sheet '{sheet_name}' but could not find a {field_label(field)} column. "
                    f"Expected one of: {', '.join(spec[:6])}. Columns in this sheet: {', '.join(available)}"
                )
        if not any(f["required"] and not f["found"] for f in fields):
            canonical = {
                "item_id": "Item_ID", "item_name": "Item_Name", "lead_time_weeks": "Lead_Time_Weeks",
                "safety_stock": "Safety_Stock", "lot_size": "Lot_Size", "unit": "Unit", "unit_cost": "Unit_Cost",
            }
            norm = _rename_df(df, mapped, canonical)
            result["item_master"] = norm
            for field, src in mapped.items():
                column_mappings.append({"role": role, "field": field, "source_column": src, "canonical": canonical[field]})
        summary(role, ROLE_LABELS[role], sheet_name, df, fields)

    # ---- BOM (optional) ----
    role = "bom"
    sheet_name = assignments.get(role)
    if sheet_name:
        df = sheets[sheet_name]
        available = [str(c) for c in df.columns]
        mapped, _ = map_columns(available, BOM_FIELDS)
        fields = [_report_entry(f, mapped.get(f), f in REQUIRED_FIELDS[role]) for f in BOM_FIELDS]
        missing_required = [f for f in REQUIRED_FIELDS[role] if f not in mapped]
        if missing_required:
            for field in missing_required:
                spec = BOM_FIELDS[field]
                errors.append(
                    f"Found BOM sheet '{sheet_name}' but could not find a {field_label(field)} column. "
                    f"Expected one of: {', '.join(spec[:6])}. Columns in this sheet: {', '.join(available)}"
                )
        else:
            canonical = {"parent": "Parent_Item", "child": "Child_Item", "qty_per": "Qty_Per"}
            norm = _rename_df(df, mapped, canonical)
            result["bom"] = norm
            for field, src in mapped.items():
                column_mappings.append({"role": role, "field": field, "source_column": src, "canonical": canonical[field]})
        summary(role, ROLE_LABELS[role], sheet_name, df, fields)
    else:
        result["bom"] = pd.DataFrame(columns=["Parent_Item", "Child_Item", "Qty_Per"])
        summary(role, ROLE_LABELS[role], None, None, [])

    # ---- Inventory ----
    role = "inventory"
    sheet_name = assignments.get(role)
    if not sheet_name:
        errors.append(
            "Could not find an Inventory sheet. Please make sure your file has a sheet with stock or on-hand quantities."
        )
        summary(role, ROLE_LABELS[role], None, None, [])
    else:
        df = sheets[sheet_name]
        available = [str(c) for c in df.columns]
        mapped, _ = map_columns(available, INVENTORY_FIELDS)
        fields = [_report_entry(f, mapped.get(f), f == "item_id") for f in INVENTORY_FIELDS]
        if "item_id" not in mapped:
            errors.append(
                f"Found Inventory sheet '{sheet_name}' but could not find an Item ID column. "
                f"Expected one of: {', '.join(INVENTORY_FIELDS['item_id'][:6])}. Columns in this sheet: {', '.join(available)}"
            )
        elif "available" not in mapped and "on_hand" not in mapped:
            errors.append(
                f"Found Inventory sheet '{sheet_name}' but could not find stock quantity columns. "
                f"Expected one of: Available_Qty, On Hand, Stock, QOH. Columns in this sheet: {', '.join(available)}"
            )
        else:
            cols = {"item_id": "Item_ID"}
            out = df.rename(columns={mapped["item_id"]: "Item_ID"})
            if "available" in mapped:
                out = out.rename(columns={mapped["available"]: "Available_Qty"})
                cols["available"] = "Available_Qty"
            elif "on_hand" in mapped:
                out = out.rename(columns={mapped["on_hand"]: "On_Hand_Qty"})
                cols["on_hand"] = "On_Hand_Qty"
            if "allocated" in mapped:
                out = out.rename(columns={mapped["allocated"]: "Allocated_Qty"})
            if "On_Hand_Qty" in out.columns and "Allocated_Qty" in out.columns:
                out["Available_Qty"] = out["On_Hand_Qty"] - out["Allocated_Qty"]
            elif "Available_Qty" not in out.columns and "On_Hand_Qty" in out.columns:
                out["Available_Qty"] = out["On_Hand_Qty"]
            keep = ["Item_ID", "Available_Qty"]
            if "On_Hand_Qty" in out.columns:
                keep.append("On_Hand_Qty")
            if "Allocated_Qty" in out.columns:
                keep.append("Allocated_Qty")
            result["inventory"] = out[keep]
            for field, src in mapped.items():
                column_mappings.append({"role": role, "field": field, "source_column": src, "canonical": cols.get(field, field)})
        summary(role, ROLE_LABELS[role], sheet_name, df, fields)

    # ---- Demand Forecast ----
    role = "demand_forecast"
    sheet_name = assignments.get(role)
    if not sheet_name:
        errors.append(
            "Could not find a Demand Forecast sheet. Please make sure your file has a sheet with week columns (W1–W8), dates, or period columns."
        )
        summary(role, "Demand", None, None, [])
    else:
        df = sheets[sheet_name]
        available = [str(c) for c in df.columns]
        item_col = find_column(available, DEMAND_ITEM_ID_FIELDS)
        week_map = build_demand_week_map(available)
        week_sources = list(week_map.values())
        fields = [
            _report_entry("item_id", item_col, True),
            {
                "field": "week_columns",
                "label": "Week Columns",
                "found": len(week_map) > 0,
                "source_column": ", ".join(week_sources) if week_sources else None,
                "required": True,
            },
        ]
        if not item_col:
            errors.append(
                f"Found Demand sheet '{sheet_name}' but could not find an Item ID column. "
                f"Expected one of: {', '.join(DEMAND_ITEM_ID_FIELDS[:6])}. Columns in this sheet: {', '.join(available)}"
            )
        elif len(week_map) < 1:
            errors.append(
                f"Found Demand sheet '{sheet_name}' but could not find week/period columns. "
                f"Expected columns like W1, Week1, WK1, P1, Period1, or dates. Columns in this sheet: {', '.join(available)}"
            )
        else:
            out = df.rename(columns={item_col: "Item_ID"})
            for week, src in week_map.items():
                out = out.rename(columns={src: week})
            ordered = sorted(week_map.keys(), key=lambda w: int(w[1:]))
            out = out[["Item_ID"] + ordered]
            result["demand_forecast"] = out
            column_mappings.append({"role": role, "field": "item_id", "source_column": item_col, "canonical": "Item_ID"})
            for week, src in week_map.items():
                column_mappings.append({"role": role, "field": week, "source_column": src, "canonical": week})
        summary(role, "Demand", sheet_name, df, fields)

    # ---- Open POs (optional) ----
    role = "open_pos"
    sheet_name = assignments.get(role)
    if sheet_name:
        df = sheets[sheet_name]
        available = [str(c) for c in df.columns]
        mapped, _ = map_columns(available, OPEN_PO_FIELDS)
        fields = [_report_entry(f, mapped.get(f), f in REQUIRED_FIELDS[role]) for f in OPEN_PO_FIELDS]
        missing_required = [f for f in REQUIRED_FIELDS[role] if f not in mapped]
        if missing_required:
            for field in missing_required:
                spec = OPEN_PO_FIELDS[field]
                errors.append(
                    f"Found Open POs sheet '{sheet_name}' but could not find a {field_label(field)} column. "
                    f"Expected one of: {', '.join(spec[:6])}. Columns in this sheet: {', '.join(available)}"
                )
        else:
            canonical = {
                "po_number": "PO_Number", "item_id": "Item_ID", "supplier": "Supplier",
                "order_qty": "Order_Qty", "expected_receipt_week": "Expected_Receipt_Week", "status": "Status",
            }
            norm = _rename_df(df, mapped, canonical)
            norm["Expected_Receipt_Week"] = norm["Expected_Receipt_Week"].apply(_normalize_week_label)
            result["open_pos"] = norm
            for field, src in mapped.items():
                column_mappings.append({"role": role, "field": field, "source_column": src, "canonical": canonical[field]})
        summary(role, ROLE_LABELS[role], sheet_name, df, fields)
    else:
        result["open_pos"] = pd.DataFrame(columns=[
            "PO_Number", "Item_ID", "Supplier", "Order_Qty", "Expected_Receipt_Week", "Status",
        ])
        summary(role, ROLE_LABELS[role], None, None, [])

    ready = len(errors) == 0 and "item_master" in result and "inventory" in result and "demand_forecast" in result

    return {
        "ready_to_process": ready,
        "sheets": sheet_summaries,
        "column_mappings": column_mappings,
        "errors": errors,
        "normalized": result if ready else None,
    }


def read_excel_sheets(content: bytes) -> Dict[str, pd.DataFrame]:
    return pd.read_excel(io.BytesIO(content), sheet_name=None)


def validate_excel(content: bytes) -> Dict[str, Any]:
    sheets = read_excel_sheets(content)
    assignments = detect_sheet_roles(sheets)
    parsed = build_normalized_sheets(sheets, assignments)
    return {
        "ready_to_process": parsed["ready_to_process"],
        "sheets": parsed["sheets"],
        "column_mappings": parsed["column_mappings"],
        "errors": parsed["errors"],
    }


def parse_excel(content: bytes) -> Dict[str, pd.DataFrame]:
    validation = validate_excel(content)
    if not validation["ready_to_process"]:
        raise ExcelParseError(validation["errors"])
    sheets = read_excel_sheets(content)
    assignments = detect_sheet_roles(sheets)
    parsed = build_normalized_sheets(sheets, assignments)
    return parsed["normalized"]
