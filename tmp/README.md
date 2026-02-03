# Zotero Library Filtering Test Scripts

These scripts help analyze how the Zotero Triage plugin filters your Zotero library.

## Prerequisites

1. Create a snapshot of your Zotero database:
   - Close Zotero
   - Copy `zotero.sqlite` from your Zotero data directory to a safe location
   - Update `DB_PATH` in each script to point to your snapshot

2. Have Python 3 installed with sqlite3 (built-in)

## Scripts Overview

### 1. `match_extension_report.py` - START HERE
**Purpose:** Shows exactly what count the extension should report and why.

```bash
python tmp/match_extension_report.py
```

**What it shows:**
- Total items the extension will show you
- Library breakdown (personal/group/feed)
- What gets excluded and why
- Breakdown of included item types
- **Highlights if you have standalone notes being excluded**

**Output:** Console + `tmp/extension_report.json`

---

### 2. `test_standalone_notes.py` - Investigate Notes
**Purpose:** Analyzes the difference between child notes and standalone notes.

```bash
python tmp/test_standalone_notes.py
```

**What it shows:**
- Total notes in your personal library
- How many are child notes (attached to items) - metadata, should exclude
- How many are standalone notes (independent items) - might want to include
- Sample titles from your standalone notes

**Output:** Console + `tmp/standalone_notes_analysis.json`

---

### 3. `test_all_filtering_strategies.py` - Compare Approaches
**Purpose:** Compares three different filtering strategies with counts.

```bash
python tmp/test_all_filtering_strategies.py
```

**What it shows:**
- **Strategy 1 (Current):** Excludes ALL notes → Count A
- **Strategy 2 (Alternative):** Excludes only child notes, keeps standalone → Count B
- **Strategy 3 (Minimal):** Keeps all notes → Count C
- Impact analysis: how many items each strategy includes/excludes

**Output:** Console + `tmp/filtering_strategies_comparison.json`

---

## Understanding the Discrepancy

### Your Situation
- **Zotero reports:** 9,888 items total (includes everything - groups, feeds, notes, attachments)
- **Extension reported:** 9,293 items (filtered)
- **Test shows should be:** 9,392 items (with current filtering)
- **Difference:** ~99 items

### Likely Cause: Standalone Notes

The extension currently excludes **ALL notes** (child + standalone).

- **Child notes** are attached to items (e.g., reading notes for a paper) - should exclude ✓
- **Standalone notes** are independent items you created - might want to include?

If you have ~99 standalone notes, that explains the discrepancy.

### What to Check

1. Run `match_extension_report.py` to see if you have standalone notes
2. If yes, run `test_standalone_notes.py` to see sample titles
3. Decide: Are these notes you want to triage? Or are they just metadata?
4. Run `test_all_filtering_strategies.py` to see the impact of including them

### Next Steps

**If you want to INCLUDE standalone notes:**
The extension needs a code change in `src/db/queries.ts` to:
- Change `it.typeName != 'note'` to a more sophisticated check
- Exclude only notes where `itemNotes.parentItemID IS NOT NULL` (child notes)
- Keep notes where `parentItemID IS NULL` (standalone notes)

**If you want to KEEP EXCLUDING standalone notes:**
The current implementation is correct. The 99-item difference is expected.

---

## Database Path Configuration

Each script has this line near the top:

```python
DB_PATH = r"C:\Users\Biaou\Downloads\TMP\zotero.sqlite"
```

**Update this path** to point to your Zotero database snapshot.

### Finding Your Zotero Database

**Windows:** `C:\Users\[YourName]\Zotero\zotero.sqlite`
**Mac:** `~/Zotero/zotero.sqlite`
**Linux:** `~/Zotero/zotero.sqlite`

Or in Zotero: Edit → Preferences → Advanced → Files and Folders → Data Directory Location

---

## Troubleshooting

### "Database locked" error
- Close Zotero completely
- Use a copy/snapshot instead of the live database

### Different counts between runs
- Database changed between runs (items added/removed)
- Use the same snapshot for all tests
- Create a fresh snapshot: close Zotero, copy `zotero.sqlite` again

### UnicodeEncodeError on Windows
- The scripts handle this - you'll still see JSON output
- Output files won't have encoding issues

---

## Understanding the Queries

All scripts use SQL queries that match the extension's filtering logic:

```sql
-- Extension's core filtering
WHERE it.typeName NOT IN ('attachment', 'note', 'annotation')  -- Exclude types
  AND l.type = 'user'                                          -- Personal library only
  AND ri.itemID IS NULL                                        -- No retracted items
  AND i.itemID NOT IN (SELECT itemID FROM deletedItems)        -- No trash
```

The key question is whether `'note'` exclusion should be more nuanced to keep standalone notes.
