import sqlite3
import json
import os

# This script matches the EXACT filtering logic used by the extension
# Run: python tmp/test_extension_filtering.py

DB_PATH = r"C:\Users\Biaou\Downloads\TMP\zotero.sqlite"

def test_extension_filtering(db_path):
    if not os.path.exists(db_path):
        return {"error": f"Database not found at {db_path}"}

    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()

        results = {}

        # 1. Count using EXACT extension logic (ITEM_COUNT_QUERY)
        print("--- Extension Filtering (Exact Match) ---")
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM items i
            INNER JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            LEFT JOIN retractedItems ri ON i.itemID = ri.itemID
            WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
              AND it.typeName != 'attachment'
              AND it.typeName != 'note'
              AND it.typeName != 'annotation'
              AND l.type = 'user'
              AND ri.itemID IS NULL
        """)
        extension_count = cursor.fetchone()[0]
        results['extension_filtered_count'] = extension_count

        # 2. Count personal library items (excluding only note and attachment - like your test script)
        print("--- Test Script Filtering (Missing annotation exclusion) ---")
        cursor.execute("""
            SELECT COUNT(I.itemID)
            FROM items I
            LEFT JOIN libraries L ON I.libraryID = L.libraryID
            JOIN itemTypes T ON I.itemTypeID = T.itemTypeID
            WHERE T.typeName NOT IN ('note', 'attachment')
              AND I.itemID NOT IN (SELECT itemID FROM deletedItems)
              AND L.type = 'user'
        """)
        test_script_count = cursor.fetchone()[0]
        results['test_script_count'] = test_script_count

        # 3. Count annotations in personal library only
        print("--- Annotations in Personal Library ---")
        cursor.execute("""
            SELECT COUNT(*)
            FROM items I
            JOIN libraries L ON I.libraryID = L.libraryID
            JOIN itemTypes T ON I.itemTypeID = T.itemTypeID
            WHERE T.typeName = 'annotation'
              AND L.type = 'user'
              AND I.itemID NOT IN (SELECT itemID FROM deletedItems)
        """)
        personal_annotations = cursor.fetchone()[0]
        results['personal_library_annotations'] = personal_annotations

        # 4. Count retracted items in personal library
        print("--- Retracted Items in Personal Library ---")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='retractedItems'")
        if cursor.fetchone():
            cursor.execute("""
                SELECT COUNT(*)
                FROM retractedItems ri
                JOIN items i ON ri.itemID = i.itemID
                JOIN libraries l ON i.libraryID = l.libraryID
                JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
                WHERE l.type = 'user'
                  AND it.typeName NOT IN ('note', 'attachment', 'annotation')
                  AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
            """)
            personal_retracted = cursor.fetchone()[0]
            results['personal_library_retracted'] = personal_retracted
        else:
            results['personal_library_retracted'] = 0

        # 5. Expected calculation
        results['calculation'] = {
            'test_script_count': test_script_count,
            'minus_annotations': personal_annotations,
            'minus_retracted': results['personal_library_retracted'],
            'expected_extension_count': test_script_count - personal_annotations - results['personal_library_retracted'],
            'actual_extension_count': extension_count,
            'difference': (test_script_count - personal_annotations - results['personal_library_retracted']) - extension_count
        }

        # 6. Breakdown by item type (extension-filtered)
        print("--- Item Types (Extension Filtered) ---")
        cursor.execute("""
            SELECT it.typeName, COUNT(*) as count
            FROM items i
            INNER JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            LEFT JOIN retractedItems ri ON i.itemID = ri.itemID
            WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
              AND it.typeName NOT IN ('attachment', 'note', 'annotation')
              AND l.type = 'user'
              AND ri.itemID IS NULL
            GROUP BY it.typeName
            ORDER BY count DESC
        """)
        results['item_types_breakdown'] = dict(cursor.fetchall())

        conn.close()
        return results

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    data = test_extension_filtering(DB_PATH)
    print(json.dumps(data, indent=2))

    # Save to file
    with open('tmp/extension_filtering_test.json', 'w') as f:
        json.dump(data, f, indent=2)

    # Print summary
    if 'error' not in data:
        print("\n" + "="*60)
        print("SUMMARY")
        print("="*60)
        print(f"Extension count (actual):     {data['extension_filtered_count']}")
        print(f"Test script count:            {data['test_script_count']}")
        print(f"Personal library annotations: {data['personal_library_annotations']}")
        print(f"Personal library retracted:   {data['personal_library_retracted']}")
        print(f"Expected extension count:     {data['calculation']['expected_extension_count']}")
        print(f"Difference:                   {data['calculation']['difference']} items")
        print("="*60)

        if abs(data['calculation']['difference']) < 5:
            print("✅ Filtering logic is correct! Small difference is acceptable.")
        elif data['calculation']['difference'] > 0:
            print("⚠️  Extension is filtering FEWER items than expected")
            print(f"   Missing {data['calculation']['difference']} exclusions")
        else:
            print("⚠️  Extension is filtering MORE items than expected")
            print(f"   Over-excluding {abs(data['calculation']['difference'])} items")
