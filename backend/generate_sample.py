import pandas as pd

# Lead_Time_Weeks per item (weeks of supplier lead time)
ITEM_MASTER = [
    ["ITM001", "Finished Good A", 2, 50, 100, "EA", 45.00],
    ["ITM002", "Finished Good B", 3, 30, 50, "EA", 82.00],
    ["ITM003", "Sub-Assembly X", 1, 20, 200, "EA", 12.50],
    ["ITM004", "Sub-Assembly Y", 2, 15, 100, "EA", 18.00],
    ["ITM005", "Raw Material P", 1, 100, 500, "KG", 2.80],
    ["ITM006", "Raw Material Q", 2, 80, 300, "KG", 4.10],
    ["ITM007", "Raw Material R", 1, 60, 400, "EA", 1.50],
    ["ITM008", "Packaging Mat", 1, 200, 1000, "EA", 0.30],
]

BOM = [
    ["ITM001", "ITM003", 2],
    ["ITM001", "ITM005", 3],
    ["ITM001", "ITM008", 1],
    ["ITM002", "ITM004", 1],
    ["ITM002", "ITM006", 4],
    ["ITM002", "ITM007", 2],
    ["ITM003", "ITM005", 1],
    ["ITM003", "ITM007", 3],
    ["ITM004", "ITM006", 2],
    ["ITM004", "ITM007", 1],
]

INVENTORY = [
    ["ITM001", 120, 20, 100],
    ["ITM002", 45, 15, 30],
    ["ITM003", 180, 30, 150],
    ["ITM004", 90, 10, 80],
    ["ITM005", 600, 100, 500],
    ["ITM006", 250, 50, 200],
    ["ITM007", 800, 200, 600],
    ["ITM008", 2000, 500, 1500],
]

DEMAND_FORECAST = [
    ["ITM001", 30, 35, 40, 28, 50, 45, 38, 42],
    ["ITM002", 20, 18, 25, 22, 30, 28, 15, 20],
]

OPEN_POS = [
    ["PO-1001", "ITM005", "Supplier A", 500, "W1", "Confirmed"],
    ["PO-1002", "ITM006", "Supplier B", 300, "W2", "Confirmed"],
    ["PO-1003", "ITM007", "Supplier C", 400, "W1", "In Transit"],
    ["PO-1004", "ITM003", "Supplier D", 200, "W3", "Pending"],
    ["PO-1005", "ITM001", "Supplier E", 100, "W2", "Confirmed"],
    ["PO-1006", "ITM008", "Supplier F", 1000, "W1", "In Transit"],
]

# 16 weeks of historical sales (oldest W-16 → newest W-1)
SALES_HISTORY_ITM = [
    ["ITM001", 12, 15, 18, 14, 20, 16, 22, 19, 25, 21, 18, 23, 20, 17, 22, 19],
    ["ITM002", 20, 22, 25, 21, 28, 24, 30, 26, 32, 28, 25, 30, 27, 24, 28, 25],
]

SALES_HISTORY_ELC = [
    ["ELC001", 12, 15, 18, 14, 20, 16, 22, 19, 25, 21, 18, 23, 20, 17, 22, 19],
    ["ELC002", 20, 22, 25, 21, 28, 24, 30, 26, 32, 28, 25, 30, 27, 24, 28, 25],
]

HISTORY_COLS = ["Item_ID"] + [f"W-{i}" for i in range(16, 0, -1)]


def _write_workbook(path: str, item_master, bom, inventory, demand, open_pos, sales):
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        pd.DataFrame(
            item_master,
            columns=[
                "Item_ID", "Item_Name", "Lead_Time_Weeks", "Safety_Stock",
                "Lot_Size", "Unit", "Unit_Cost",
            ],
        ).to_excel(writer, sheet_name="Item_Master", index=False)

        pd.DataFrame(bom, columns=["Parent_Item", "Child_Item", "Qty_Per"]).to_excel(
            writer, sheet_name="BOM", index=False
        )

        pd.DataFrame(
            inventory,
            columns=["Item_ID", "On_Hand_Qty", "Allocated_Qty", "Available_Qty"],
        ).to_excel(writer, sheet_name="Inventory", index=False)

        pd.DataFrame(
            demand,
            columns=["Item_ID", "W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"],
        ).to_excel(writer, sheet_name="Demand_Forecast", index=False)

        pd.DataFrame(
            open_pos,
            columns=[
                "PO_Number", "Item_ID", "Supplier", "Order_Qty",
                "Expected_Receipt_Week", "Status",
            ],
        ).to_excel(writer, sheet_name="Open_POs", index=False)

        pd.DataFrame(sales, columns=HISTORY_COLS).to_excel(
            writer, sheet_name="Sales_History", index=False
        )


def main():
    _write_workbook(
        "sample_mrp_data.xlsx",
        ITEM_MASTER, BOM, INVENTORY, DEMAND_FORECAST, OPEN_POS, SALES_HISTORY_ITM,
    )
    print("Created sample_mrp_data.xlsx")

    # Electronics variant (ELC / SUB / RAW / PKG naming)
    elc_items = [
        ["ELC001", "Smart Speaker Pro", 3, 40, 50, "EA", 89.00],
        ["ELC002", "Wireless Earbuds", 2, 60, 100, "EA", 59.00],
        ["SUB001", "Audio Board", 2, 25, 100, "EA", 18.00],
        ["SUB002", "Battery Pack", 2, 30, 80, "EA", 12.00],
        ["SUB003", "Driver Module", 1, 40, 120, "EA", 8.50],
        ["SUB004", "Charging Case", 1, 35, 100, "EA", 9.00],
        ["RAW001", "Processor Chip", 4, 100, 200, "EA", 3.20],
        ["RAW002", "Memory Module", 3, 80, 150, "EA", 2.10],
        ["RAW003", "Lithium Cell", 2, 200, 500, "EA", 0.85],
        ["RAW004", "Speaker Cone", 2, 150, 300, "EA", 1.40],
        ["RAW005", "PCB Blank", 1, 120, 250, "EA", 0.60],
        ["PKG001", "Retail Box", 1, 300, 1000, "EA", 0.45],
        ["PKG002", "Foam Insert", 1, 250, 800, "EA", 0.25],
    ]
    elc_bom = [
        ["ELC001", "SUB001", 1],
        ["ELC001", "SUB002", 1],
        ["ELC001", "RAW004", 2],
        ["ELC001", "PKG001", 1],
        ["ELC002", "SUB003", 1],
        ["ELC002", "SUB004", 1],
        ["ELC002", "PKG002", 1],
        ["SUB001", "RAW001", 1],
        ["SUB001", "RAW002", 2],
        ["SUB001", "RAW005", 1],
        ["SUB002", "RAW003", 4],
        ["SUB003", "RAW001", 1],
        ["SUB003", "RAW005", 1],
        ["SUB004", "RAW003", 2],
        ["SUB004", "RAW005", 1],
    ]
    elc_inv = [
        ["ELC001", 80, 10, 70],
        ["ELC002", 120, 20, 100],
        ["SUB001", 150, 20, 130],
        ["SUB002", 100, 15, 85],
        ["SUB003", 180, 30, 150],
        ["SUB004", 140, 20, 120],
        ["RAW001", 400, 50, 350],
        ["RAW002", 500, 60, 440],
        ["RAW003", 1200, 100, 1100],
        ["RAW004", 600, 50, 550],
        ["RAW005", 800, 80, 720],
        ["PKG001", 2000, 200, 1800],
        ["PKG002", 1500, 150, 1350],
    ]
    elc_demand = [
        ["ELC001", 25, 28, 30, 22, 35, 32, 28, 30],
        ["ELC002", 40, 38, 45, 42, 50, 48, 35, 40],
    ]
    elc_pos = [
        ["PO-2001", "RAW001", "ChipCo", 200, "W1", "Confirmed"],
        ["PO-2002", "RAW003", "PowerCell", 500, "W2", "In Transit"],
        ["PO-2003", "PKG001", "PackPro", 1000, "W1", "Confirmed"],
        ["PO-2004", "SUB001", "BoardWorks", 100, "W3", "Pending"],
    ]

    _write_workbook(
        "watched_files/electronics_mrp_data.xlsx",
        elc_items, elc_bom, elc_inv, elc_demand, elc_pos, SALES_HISTORY_ELC,
    )
    print("Created watched_files/electronics_mrp_data.xlsx")


if __name__ == "__main__":
    main()
