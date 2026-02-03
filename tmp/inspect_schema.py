import sqlite3

# Run this script in your terminal to check the Zotero column names: 
# python tmp/inspect_schema.py

# --- CONFIGURATION ---
# UPDATE THIS PATH to your snapshot location
DB_PATH = r"C:\Users\Biaou\Downloads\TMP\zotero.sqlite"

# ---------------------

def inspect():
    try:
        conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
        cursor = conn.cursor()
        
        print("--- COLUMNS IN 'items' TABLE ---")
        cursor.execute("PRAGMA table_info(items)")
        for row in cursor.fetchall():
            print(row[1]) # Print column name
            
        print("\n--- COLUMNS IN 'itemAttachments' TABLE ---")
        cursor.execute("PRAGMA table_info(itemAttachments)")
        for row in cursor.fetchall():
            print(row[1])

        print("\n--- ALL TABLE NAMES ---")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        print(tables)
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect()