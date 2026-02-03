import sqlite3
import json
import os

# Comprehensive filtering test - compares different strategies
# Run: python tmp/test_all_filtering_strategies.py

DB_PATH = r"C:\Users\Biaou\Downloads\TMP\zotero.sqlite"

def test_filtering_strategies(db_path):
    if not os.path.exists(db_path):
        return {"error": f"Database not found at {db_path}"}

    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()

        results = {}

        print("=" * 70)
        print("FILTERING STRATEGY COMPARISON")
        print("=" * 70)

        # Strategy 1: CURRENT EXTENSION LOGIC
        # Excludes: attachments, all notes (child + standalone), annotations
        print("\n1. Current Extension (excludes ALL notes) ...")
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
        current_count = cursor.fetchone()[0]
        results['strategy_1_current_extension'] = {
            'count': current_count,
            'excludes': ['attachments', 'all notes (child + standalone)', 'annotations', 'group libraries', 'feeds', 'trash', 'retracted items']
        }

        # Strategy 2: EXCLUDE ONLY CHILD NOTES
        # Excludes: attachments, child notes, annotations
        # Includes: standalone notes
        print("2. Alternative (only excludes child notes, keeps standalone) ...")
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM items i
            INNER JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            LEFT JOIN retractedItems ri ON i.itemID = ri.itemID
            LEFT JOIN itemNotes n ON i.itemID = n.itemID AND it.typeName = 'note'
            WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
              AND it.typeName NOT IN ('attachment', 'annotation')
              AND (it.typeName != 'note' OR n.parentItemID IS NULL OR n.itemID IS NULL)
              AND l.type = 'user'
              AND ri.itemID IS NULL
        """)
        alternative_count = cursor.fetchone()[0]
        results['strategy_2_exclude_child_notes_only'] = {
            'count': alternative_count,
            'excludes': ['attachments', 'child notes only', 'annotations', 'group libraries', 'feeds', 'trash', 'retracted items'],
            'includes': ['standalone notes']
        }

        # Strategy 3: MINIMAL FILTERING (baseline)
        # Only excludes: attachments, annotations
        # Includes: all notes (child + standalone)
        print("3. Minimal (keeps all notes) ...")
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM items i
            INNER JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            LEFT JOIN retractedItems ri ON i.itemID = ri.itemID
            WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
              AND it.typeName NOT IN ('attachment', 'annotation')
              AND l.type = 'user'
              AND ri.itemID IS NULL
        """)
        minimal_count = cursor.fetchone()[0]
        results['strategy_3_minimal'] = {
            'count': minimal_count,
            'excludes': ['attachments', 'annotations', 'group libraries', 'feeds', 'trash', 'retracted items'],
            'includes': ['all notes (child + standalone)']
        }

        # Calculate differences
        standalone_notes_count = alternative_count - current_count
        child_notes_count = minimal_count - alternative_count

        results['impact_analysis'] = {
            'current_extension_count': current_count,
            'with_standalone_notes': alternative_count,
            'standalone_notes_excluded': standalone_notes_count,
            'child_notes_excluded': child_notes_count,
            'all_notes_excluded': standalone_notes_count + child_notes_count
        }

        # Get breakdown by item type for alternative strategy
        print("4. Item type breakdown (with standalone notes) ...")
        cursor.execute("""
            SELECT it.typeName, COUNT(*) as count
            FROM items i
            INNER JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            LEFT JOIN retractedItems ri ON i.itemID = ri.itemID
            LEFT JOIN itemNotes n ON i.itemID = n.itemID AND it.typeName = 'note'
            WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
              AND it.typeName NOT IN ('attachment', 'annotation')
              AND (it.typeName != 'note' OR n.parentItemID IS NULL OR n.itemID IS NULL)
              AND l.type = 'user'
              AND ri.itemID IS NULL
            GROUP BY it.typeName
            ORDER BY count DESC
        """)
        results['item_types_with_standalone_notes'] = dict(cursor.fetchall())

        # Summary stats
        cursor.execute("""
            SELECT
                COUNT(CASE WHEN it.typeName = 'note' AND (n.parentItemID IS NULL OR n.itemID IS NULL) THEN 1 END) as standalone_notes,
                COUNT(CASE WHEN it.typeName = 'note' AND n.parentItemID IS NOT NULL THEN 1 END) as child_notes,
                COUNT(CASE WHEN it.typeName = 'annotation' THEN 1 END) as annotations,
                COUNT(CASE WHEN it.typeName = 'attachment' THEN 1 END) as attachments
            FROM items i
            INNER JOIN libraries l ON i.libraryID = l.libraryID
            JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
            LEFT JOIN itemNotes n ON i.itemID = n.itemID AND it.typeName = 'note'
            WHERE l.type = 'user'
              AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
        """)
        stats = cursor.fetchone()
        results['personal_library_stats'] = {
            'standalone_notes': stats[0],
            'child_notes': stats[1],
            'annotations': stats[2],
            'attachments': stats[3]
        }

        conn.close()
        return results

    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}

if __name__ == "__main__":
    data = test_filtering_strategies(DB_PATH)

    # Save to file
    with open('tmp/filtering_strategies_comparison.json', 'w') as f:
        json.dump(data, f, indent=2)

    print(json.dumps(data, indent=2))

    # Print summary
    if 'error' not in data:
        print("\n" + "=" * 70)
        print("FILTERING COMPARISON SUMMARY")
        print("=" * 70)

        stats = data['personal_library_stats']
        print(f"\nPersonal Library Composition:")
        print(f"  Standalone notes: {stats['standalone_notes']}")
        print(f"  Child notes:      {stats['child_notes']}")
        print(f"  Annotations:      {stats['annotations']}")
        print(f"  Attachments:      {stats['attachments']}")

        print(f"\n{'Strategy':<40} {'Count':>8} {'Difference':>12}")
        print("-" * 70)

        current = data['strategy_1_current_extension']['count']
        alternative = data['strategy_2_exclude_child_notes_only']['count']
        minimal = data['strategy_3_minimal']['count']

        print(f"{'1. Current (excludes ALL notes)':<40} {current:>8,} {'(baseline)':>12}")
        print(f"{'2. Alternative (only child notes)':<40} {alternative:>8,} {'+' + str(alternative - current):>12}")
        print(f"{'3. Minimal (keeps all notes)':<40} {minimal:>8,} {'+' + str(minimal - current):>12}")

        print("\n" + "=" * 70)
        print("RECOMMENDATION")
        print("=" * 70)

        if stats['standalone_notes'] > 0:
            print(f"\nYou have {stats['standalone_notes']} standalone notes currently EXCLUDED.")
            print("\nStandalone notes in Zotero are often legitimate research artifacts")
            print("(reading notes, literature summaries, etc.) that users create manually.")
            print("\nConsider using Strategy 2 (exclude only child notes) to include these")
            print("in your triage workflow.")
            print(f"\nThis would add {alternative - current} items to process.")
        else:
            print("\nYou have no standalone notes. Current filtering is optimal.")

        print("=" * 70)
