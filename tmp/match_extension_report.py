import sqlite3
import json
import os
from datetime import datetime

# This script produces output that matches what the extension should report
# Run: python tmp/match_extension_report.py

DB_PATH = r"C:\Users\Biaou\Downloads\TMP\zotero.sqlite"

def match_extension_report(db_path):
    if not os.path.exists(db_path):
        return {"error": f"Database not found at {db_path}"}

    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()

        results = {
            'timestamp': datetime.now().isoformat(),
            'database_path': db_path
        }

        print("=" * 70)
        print("EXTENSION FILTERING REPORT")
        print("=" * 70)

        # 1. What the extension SHOULD report
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM items i
            INNER JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            LEFT JOIN retractedItems ri ON i.itemID = ri.itemID
            WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
              AND it.typeName NOT IN ('attachment', 'note', 'annotation')
              AND l.type = 'user'
              AND ri.itemID IS NULL
        """)
        extension_count = cursor.fetchone()[0]
        results['extension_filtered_count'] = extension_count

        # 2. Check schema version
        cursor.execute("SELECT version FROM version WHERE schema = 'userdata'")
        schema_version = cursor.fetchone()[0]
        results['zotero_schema_version'] = schema_version

        # 3. Check for Zotero 7.x (retractedItems table)
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='retractedItems'")
        has_retracted_table = cursor.fetchone() is not None
        results['has_retracted_items_table'] = has_retracted_table
        results['zotero_version'] = '7.0+' if has_retracted_table else '6.x'

        # 4. Library breakdown
        cursor.execute("""
            SELECT l.type, COUNT(*)
            FROM items i
            JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            WHERE it.typeName NOT IN ('attachment', 'note', 'annotation')
              AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
            GROUP BY l.type
            ORDER BY l.type
        """)
        results['library_breakdown'] = dict(cursor.fetchall())

        # 5. What gets excluded
        cursor.execute("""
            SELECT COUNT(*)
            FROM items i
            JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            WHERE it.typeName = 'attachment'
              AND l.type = 'user'
              AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
        """)
        attachments = cursor.fetchone()[0]

        cursor.execute("""
            SELECT COUNT(*)
            FROM items i
            JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            WHERE it.typeName = 'note'
              AND l.type = 'user'
              AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
        """)
        all_notes = cursor.fetchone()[0]

        cursor.execute("""
            SELECT COUNT(*)
            FROM items i
            JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            WHERE it.typeName = 'annotation'
              AND l.type = 'user'
              AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
        """)
        annotations = cursor.fetchone()[0]

        cursor.execute("""
            SELECT COUNT(*)
            FROM items i
            JOIN libraries l ON i.libraryID = l.libraryID
            WHERE i.itemID IN (SELECT itemID FROM deletedItems)
              AND l.type = 'user'
        """)
        trash = cursor.fetchone()[0]

        retracted = 0
        if has_retracted_table:
            cursor.execute("""
                SELECT COUNT(*)
                FROM retractedItems ri
                JOIN items i ON ri.itemID = i.itemID
                JOIN libraries l ON i.libraryID = l.libraryID
                JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
                WHERE l.type = 'user'
                  AND it.typeName NOT IN ('attachment', 'note', 'annotation')
                  AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
            """)
            retracted = cursor.fetchone()[0]

        results['exclusions_from_personal_library'] = {
            'attachments': attachments,
            'notes_all': all_notes,
            'annotations': annotations,
            'trash': trash,
            'retracted': retracted
        }

        # 6. Standalone vs child notes breakdown
        cursor.execute("""
            SELECT COUNT(*)
            FROM items i
            JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            JOIN itemNotes n ON i.itemID = n.itemID
            WHERE it.typeName = 'note'
              AND l.type = 'user'
              AND n.parentItemID IS NOT NULL
              AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
        """)
        child_notes = cursor.fetchone()[0]

        standalone_notes = all_notes - child_notes

        results['note_breakdown'] = {
            'total_notes': all_notes,
            'child_notes': child_notes,
            'standalone_notes': standalone_notes,
            'note': 'Child notes are attached to items; standalone notes are independent'
        }

        # 7. Item type breakdown (what's included)
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
        results['included_item_types'] = dict(cursor.fetchall())

        conn.close()
        return results

    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}

if __name__ == "__main__":
    data = match_extension_report(DB_PATH)

    # Save to file
    with open('tmp/extension_report.json', 'w') as f:
        json.dump(data, f, indent=2)

    print(json.dumps(data, indent=2))

    # Print user-friendly summary
    if 'error' not in data:
        print("\n" + "=" * 70)
        print("WHAT THE EXTENSION SHOULD REPORT")
        print("=" * 70)
        print(f"\nTotal items available for triage: {data['extension_filtered_count']:,}")
        print(f"Zotero version: {data['zotero_version']} (schema {data['zotero_schema_version']})")

        print(f"\n{'Library Distribution (before filtering):'}")
        for lib_type, count in sorted(data['library_breakdown'].items()):
            print(f"  {lib_type:10} {count:>6,} items")

        print(f"\n{'Excluded from personal library:'}")
        ex = data['exclusions_from_personal_library']
        print(f"  Attachments:        {ex['attachments']:>6,}")
        print(f"  Notes (all):        {ex['notes_all']:>6,}")
        if data['note_breakdown']['standalone_notes'] > 0:
            print(f"    - Child notes:    {data['note_breakdown']['child_notes']:>6,}")
            print(f"    - Standalone:     {data['note_breakdown']['standalone_notes']:>6,} ⚠️")
        print(f"  Annotations:        {ex['annotations']:>6,}")
        print(f"  Trash:              {ex['trash']:>6,}")
        print(f"  Retracted:          {ex['retracted']:>6,}")

        print(f"\n{'Top item types (included):'}")
        for item_type, count in list(data['included_item_types'].items())[:10]:
            print(f"  {item_type:20} {count:>6,}")

        if data['note_breakdown']['standalone_notes'] > 0:
            print("\n" + "=" * 70)
            print("⚠️  IMPORTANT: STANDALONE NOTES EXCLUDED")
            print("=" * 70)
            print(f"\nYou have {data['note_breakdown']['standalone_notes']} standalone notes that are being excluded.")
            print("These may be legitimate research notes you want to include in triage.")
            print("\nTo include them, the extension's queries.ts needs to be modified to")
            print("exclude only child notes (notes with parentItemID) and keep standalone notes.")
            print(f"\nThis would add {data['note_breakdown']['standalone_notes']} items to your triage workflow.")

        print("=" * 70)
        print(f"\n📊 Compare this count ({data['extension_filtered_count']:,}) with what the extension shows")
        print("=" * 70)
