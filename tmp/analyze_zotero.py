import sqlite3
import json
import os

# Run this script in your terminal: 
# python tmp/analyze_zotero.py

# --- CONFIGURATION ---
# UPDATE THIS PATH to your snapshot location
DB_PATH = r"C:\Users\Biaou\Downloads\TMP\zotero.sqlite"
# ---------------------

def analyze_library(db_path):
    if not os.path.exists(db_path):
        return {"error": f"Database file not found at {db_path}"}

    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()
    except Exception as e:
        return {"error": f"Connection failed: {e}"}

    results = {}

    try:
        # 1. Library Composition (Item Types)
        # Exclude 'note' and 'attachment' to count only bibliographic items
        cursor.execute("""
            SELECT T.typeName, COUNT(I.itemID)
            FROM items I
            JOIN itemTypes T ON I.itemTypeID = T.itemTypeID
            WHERE T.typeName NOT IN ('note', 'attachment')
            GROUP BY T.typeName
            ORDER BY COUNT(I.itemID) DESC
        """)
        results['composition'] = dict(cursor.fetchall())

        # 2. Total Bibliographic Items
        cursor.execute("""
            SELECT COUNT(I.itemID)
            FROM items I
            JOIN itemTypes T ON I.itemTypeID = T.itemTypeID
            WHERE T.typeName NOT IN ('note', 'attachment')
        """)
        total_items = cursor.fetchone()[0]
        results['total_items'] = total_items

        # 3. Attachment Coverage (FIXED for Zotero 7)
        # We check 'itemAttachments' table for the link to the parent
        cursor.execute("""
            SELECT COUNT(DISTINCT IA.parentItemID)
            FROM itemAttachments IA
            JOIN items I ON IA.parentItemID = I.itemID
            JOIN itemTypes T ON I.itemTypeID = T.itemTypeID
            WHERE T.typeName NOT IN ('note', 'attachment')
        """)
        items_with_attachments = cursor.fetchone()[0]
        results['attachment_stats'] = {
            'with_attachments': items_with_attachments,
            'without_attachments': total_items - items_with_attachments
        }

        # 4. Attachment Types Breakdown
        cursor.execute("""
            SELECT contentType, COUNT(*)
            FROM itemAttachments
            GROUP BY contentType
        """)
        results['attachment_types'] = dict(cursor.fetchall())

        # 5. Metadata Completeness
        fields_to_check = ['title', 'date', 'DOI', 'abstractNote', 'url', 'ISBN']
        field_stats = {}
        
        for field in fields_to_check:
            cursor.execute(f"""
                SELECT COUNT(DISTINCT ID.itemID)
                FROM itemData ID
                JOIN fields F ON ID.fieldID = F.fieldID
                JOIN items I ON ID.itemID = I.itemID
                JOIN itemTypes T ON I.itemTypeID = T.itemTypeID
                WHERE F.fieldName = ?
                  AND T.typeName NOT IN ('note', 'attachment')
            """, (field,))
            count = cursor.fetchone()[0]
            field_stats[field] = count
            
        results['metadata_presence'] = field_stats

        # 6. Temporal Distribution
        cursor.execute("""
            SELECT SUBSTR(V.value, 1, 4) as year, COUNT(*)
            FROM itemData D
            JOIN itemDataValues V ON D.valueID = V.valueID
            JOIN fields F ON D.fieldID = F.fieldID
            JOIN items I ON D.itemID = I.itemID
            JOIN itemTypes T ON I.itemTypeID = T.itemTypeID
            WHERE F.fieldName = 'date'
              AND T.typeName NOT IN ('note', 'attachment')
            GROUP BY year
            ORDER BY year DESC
        """)
        raw_years = cursor.fetchall()
        clean_years = {y: c for y, c in raw_years if y and y.isdigit() and len(y)==4}
        results['years'] = clean_years

    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

    return results

if __name__ == "__main__":
    data = analyze_library(DB_PATH)
    print(json.dumps(data, indent=2))