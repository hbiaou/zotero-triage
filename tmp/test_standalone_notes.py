import sqlite3
import json
import os

# Test script to analyze standalone notes vs child notes
# Run: python tmp/test_standalone_notes.py

DB_PATH = r"C:\Users\Biaou\Downloads\TMP\zotero.sqlite"

def analyze_notes(db_path):
    if not os.path.exists(db_path):
        return {"error": f"Database not found at {db_path}"}

    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()

        results = {}

        print("=" * 70)
        print("STANDALONE NOTES vs CHILD NOTES ANALYSIS")
        print("=" * 70)

        # 1. Count all notes in personal library
        cursor.execute("""
            SELECT COUNT(*)
            FROM items i
            JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            WHERE it.typeName = 'note'
              AND l.type = 'user'
              AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
        """)
        total_notes = cursor.fetchone()[0]
        results['total_notes_personal_library'] = total_notes

        # 2. Count child notes (attached to parent items)
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
        results['child_notes'] = child_notes

        # 3. Count standalone notes (no parent)
        cursor.execute("""
            SELECT COUNT(*)
            FROM items i
            JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            LEFT JOIN itemNotes n ON i.itemID = n.itemID
            WHERE it.typeName = 'note'
              AND l.type = 'user'
              AND (n.parentItemID IS NULL OR n.itemID IS NULL)
              AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
        """)
        standalone_notes = cursor.fetchone()[0]
        results['standalone_notes'] = standalone_notes

        # 4. Verify the split adds up
        results['note_breakdown_check'] = {
            'child_notes': child_notes,
            'standalone_notes': standalone_notes,
            'sum': child_notes + standalone_notes,
            'total_notes': total_notes,
            'matches': (child_notes + standalone_notes) == total_notes
        }

        # 5. Get sample standalone note titles (first 10)
        cursor.execute("""
            SELECT i.itemID, n.title
            FROM items i
            JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            LEFT JOIN itemNotes n ON i.itemID = n.itemID
            WHERE it.typeName = 'note'
              AND l.type = 'user'
              AND (n.parentItemID IS NULL OR n.itemID IS NULL)
              AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
            LIMIT 10
        """)
        standalone_samples = cursor.fetchall()
        results['standalone_note_samples'] = [
            {'itemID': row[0], 'title': (row[1][:80] + '...') if row[1] and len(row[1]) > 80 else row[1]}
            for row in standalone_samples
        ]

        # 6. Count attachments (for completeness)
        cursor.execute("""
            SELECT COUNT(DISTINCT ia.parentItemID)
            FROM itemAttachments ia
            JOIN items i ON ia.parentItemID = i.itemID
            JOIN libraries l ON i.libraryID = l.libraryID
            WHERE l.type = 'user'
              AND ia.parentItemID IS NOT NULL
        """)
        items_with_attachments = cursor.fetchone()[0]

        cursor.execute("""
            SELECT COUNT(*)
            FROM items i
            JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            LEFT JOIN itemAttachments ia ON i.itemID = ia.itemID
            WHERE it.typeName = 'attachment'
              AND l.type = 'user'
              AND (ia.parentItemID IS NULL OR ia.itemID IS NULL)
              AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
        """)
        standalone_attachments = cursor.fetchone()[0]

        results['attachment_info'] = {
            'items_with_child_attachments': items_with_attachments,
            'standalone_attachments': standalone_attachments
        }

        conn.close()
        return results

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    data = analyze_notes(DB_PATH)

    # Save to file
    with open('tmp/standalone_notes_analysis.json', 'w') as f:
        json.dump(data, f, indent=2)

    print(json.dumps(data, indent=2))

    # Print summary
    if 'error' not in data:
        print("\n" + "=" * 70)
        print("SUMMARY")
        print("=" * 70)
        print(f"Total notes in personal library:     {data['total_notes_personal_library']}")
        print(f"  - Child notes (attached to items): {data['child_notes']}")
        print(f"  - Standalone notes (independent):  {data['standalone_notes']}")
        print(f"\nBreakdown matches total: {data['note_breakdown_check']['matches']}")

        if data['standalone_notes'] > 0:
            print(f"\nYou have {data['standalone_notes']} standalone notes that are currently EXCLUDED")
            print("by the extension. These might be legitimate research notes you want to")
            print("include in the triage workflow.")
            print("\nSample standalone note titles:")
            for i, note in enumerate(data['standalone_note_samples'], 1):
                title = note['title'] if note['title'] else "(untitled)"
                print(f"  {i}. {title}")

        print("=" * 70)
