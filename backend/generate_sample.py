import pandas as pd

# Lead_Time_Weeks per item (weeks of supplier lead time)
ITEM_MASTER = [
    ["ITM001", "Finished Good A", 2, 50, 100, "EA", 45.00],   # 2 weeks
    ["ITM002", "Finished Good B", 3, 30, 50, "EA", 82.00],   # 3 weeks
    ["ITM003", "Sub-Assembly X", 1, 20, 200, "EA", 12.50],  # 1 week
    ["ITM004", "Sub-Assembly Y", 2, 15, 100, "EA", 18.00],   # 2 weeks
    ["ITM005", "Raw Material P", 1, 100, 500, "KG", 2.80],   # 1 week
    ["ITM006", "Raw Material Q", 2, 80, 300, "KG", 4.10],    # 2 weeks
    ["ITM007", "Raw Material R", 1, 60, 400, "EA", 1.50],    # 1 week
    ["ITM008", "Packaging Mat", 1, 200, 1000, "EA", 0.30],   # 1 week
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


def main():
    with pd.ExcelWriter("sample_mrp_data.xlsx", engine="openpyxl") as writer:
        pd.DataFrame(
            ITEM_MASTER,
            columns=[
                "Item_ID",
                "Item_Name",
                "Lead_Time_Weeks",
                "Safety_Stock",
                "Lot_Size",
                "Unit",
                "Unit_Cost",
            ],
        ).to_excel(writer, sheet_name="Item_Master", index=False)

        pd.DataFrame(
            BOM, columns=["Parent_Item", "Child_Item", "Qty_Per"]
        ).to_excel(writer, sheet_name="BOM", index=False)

        pd.DataFrame(
            INVENTORY,
            columns=["Item_ID", "On_Hand_Qty", "Allocated_Qty", "Available_Qty"],
        ).to_excel(writer, sheet_name="Inventory", index=False)

        pd.DataFrame(
            DEMAND_FORECAST,
            columns=["Item_ID", "W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"],
        ).to_excel(writer, sheet_name="Demand_Forecast", index=False)

        pd.DataFrame(
            OPEN_POS,
            columns=[
                "PO_Number",
                "Item_ID",
                "Supplier",
                "Order_Qty",
                "Expected_Receipt_Week",
                "Status",
            ],
        ).to_excel(writer, sheet_name="Open_POs", index=False)

    print("Created sample_mrp_data.xlsx")


if __name__ == "__main__":
    main()
