import sqlite3
import json
import os

# "Discrepancy Detective" Script
# This script counts the number of items in each library and the number of items in the trash.
# It also checks if the retractedItems table exists and counts the number of retracted items.
# It also verifies the 'Annotation' count again.

# Run this script in your terminal to count the number of items in each library and the number of items in the trash: 
# python tmp/counts_by_Library_and_status.py

# --- CONFIGURATION ---
DB_PATH = r"C:\Users\Biaou\Downloads\TMP\zotero.sqlite"
# ---------------------

def investigate(db_path):
    if not os.path.exists(db_path):
        return {"error": "File not found"}

    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()
        
        results = {}

        # 1. Check Library Distribution (My Library is usually ID 1)
        print("--- Checking Libraries ---")
        cursor.execute("""
            SELECT I.libraryID, L.type, COUNT(I.itemID)
            FROM items I
            LEFT JOIN libraries L ON I.libraryID = L.libraryID
            JOIN itemTypes T ON I.itemTypeID = T.itemTypeID
            WHERE T.typeName NOT IN ('note', 'attachment')
            GROUP BY I.libraryID
        """)
        results['libraries'] = cursor.fetchall()

        # 2. Check Trash (deletedItems table)
        print("--- Checking Trash ---")
        cursor.execute("""
            SELECT COUNT(I.itemID)
            FROM items I
            JOIN itemTypes T ON I.itemTypeID = T.itemTypeID
            WHERE I.itemID IN (SELECT itemID FROM deletedItems)
              AND T.typeName NOT IN ('note', 'attachment')
        """)
        trash_count = cursor.fetchone()[0]
        results['trash_items'] = trash_count

        # 3. Check Retracted Items
        print("--- Checking Retracted Items ---")
        # Check if table exists first (Zotero 7 feature)
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='retractedItems'")
        if cursor.fetchone():
            cursor.execute("SELECT COUNT(*) FROM retractedItems")
            results['retracted_items'] = cursor.fetchone()[0]
        else:
            results['retracted_items'] = "Table not found"

        # 4. Verify 'Annotation' count again
        cursor.execute("""
            SELECT COUNT(*)
            FROM items I
            JOIN itemTypes T ON I.itemTypeID = T.itemTypeID
            WHERE T.typeName = 'annotation'
        """)
        results['annotation_count'] = cursor.fetchone()[0]

        conn.close()
        return results

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    data = investigate(DB_PATH)
    print(json.dumps(data, indent=2))