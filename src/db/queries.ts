/**
 * SQL queries for reading Zotero's EAV (Entity-Attribute-Value) schema
 *
 * Zotero stores item metadata in a normalized EAV pattern:
 * - items: Base item records (itemID, key, dates)
 * - itemData: Links items to fields (itemID -> fieldID -> valueID)
 * - fields: Field definitions (fieldID -> fieldName like 'title', 'DOI')
 * - itemDataValues: Actual values (valueID -> value)
 *
 * These queries pivot the EAV structure into flat rows for easier consumption.
 */

/**
 * Query to get the schema version from the version table.
 * Used to verify database compatibility before querying.
 */
export const VERSION_QUERY = `
SELECT version FROM version WHERE schema = 'userdata'
`;

/**
 * Main items query using CTE to pivot EAV into columns.
 *
 * Excludes:
 * - Items in deletedItems table
 * - Attachments (itemType = 'attachment')
 * - Notes (itemType = 'note')
 * - Annotations (itemType = 'annotation')
 *
 * Returns: itemID, itemKey, dateAdded, dateModified, itemType,
 *          title, doi, date, journal, volume, issue, pages, abstract, publisher, isbn
 */
export const ITEMS_QUERY = `
WITH itemFields AS (
  SELECT
    i.itemID,
    i.key AS itemKey,
    i.dateAdded,
    i.dateModified,
    it.typeName AS itemType,
    f.fieldName,
    idv.value
  FROM items i
  JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
  LEFT JOIN itemData id ON i.itemID = id.itemID
  LEFT JOIN fields f ON id.fieldID = f.fieldID
  LEFT JOIN itemDataValues idv ON id.valueID = idv.valueID
  WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
    AND it.typeName != 'attachment'
    AND it.typeName != 'note'
    AND it.typeName != 'annotation'
)
SELECT
  itemID,
  itemKey,
  dateAdded,
  dateModified,
  itemType,
  MAX(CASE WHEN fieldName = 'title' THEN value END) AS title,
  MAX(CASE WHEN fieldName = 'DOI' THEN value END) AS doi,
  MAX(CASE WHEN fieldName = 'date' THEN value END) AS date,
  MAX(CASE WHEN fieldName = 'publicationTitle' THEN value END) AS journal,
  MAX(CASE WHEN fieldName = 'volume' THEN value END) AS volume,
  MAX(CASE WHEN fieldName = 'issue' THEN value END) AS issue,
  MAX(CASE WHEN fieldName = 'pages' THEN value END) AS pages,
  MAX(CASE WHEN fieldName = 'abstractNote' THEN value END) AS abstract,
  MAX(CASE WHEN fieldName = 'publisher' THEN value END) AS publisher,
  MAX(CASE WHEN fieldName = 'ISBN' THEN value END) AS isbn
FROM itemFields
GROUP BY itemID
ORDER BY dateAdded DESC
`;

/**
 * Query to get creators (authors, editors, etc.) for a specific item.
 * Parameterized with itemID (?).
 *
 * fieldMode:
 * - 0: Two-field mode (firstName + lastName)
 * - 1: Single-field mode (lastName only, used for institutions)
 *
 * Returns: firstName, lastName, fieldMode, creatorType, orderIndex
 * Ordered by orderIndex to preserve author order.
 */
export const CREATORS_QUERY = `
SELECT
  c.firstName,
  c.lastName,
  c.fieldMode,
  ct.creatorType,
  ic.orderIndex
FROM itemCreators ic
JOIN creators c ON ic.creatorID = c.creatorID
JOIN creatorTypes ct ON ic.creatorTypeID = ct.creatorTypeID
WHERE ic.itemID = ?
ORDER BY ic.orderIndex
`;

/**
 * Query to get PDF attachments for a specific item.
 * Parameterized with parentItemID (?).
 *
 * linkMode:
 * - 0: importedFile (stored in storage/{itemKey}/)
 * - 1: importedURL
 * - 2: linkedFile (external file)
 * - 3: linkedURL
 *
 * Returns: itemID, linkMode, path, contentType
 * Filters to only PDF files.
 */
export const ATTACHMENTS_QUERY = `
SELECT
  ia.itemID,
  ia.linkMode,
  ia.path,
  ia.contentType
FROM itemAttachments ia
WHERE ia.parentItemID = ?
  AND ia.contentType = 'application/pdf'
`;

/**
 * Query to get tags for a specific item.
 * Parameterized with itemID (?).
 *
 * Returns: tag names ordered alphabetically.
 */
export const ITEM_TAGS_QUERY = `
SELECT t.name
FROM itemTags it
JOIN tags t ON it.tagID = t.tagID
WHERE it.itemID = ?
ORDER BY t.name
`;

/**
 * Query to get collections for a specific item.
 * Parameterized with itemID (?).
 *
 * Returns: collection names ordered alphabetically.
 */
export const ITEM_COLLECTIONS_QUERY = `
SELECT c.collectionName
FROM collectionItems ci
JOIN collections c ON ci.collectionID = c.collectionID
WHERE ci.itemID = ?
ORDER BY c.collectionName
`;

/**
 * Query to count total items (excluding attachments and notes).
 * Used for progress reporting and validation.
 */
export const ITEM_COUNT_QUERY = `
SELECT COUNT(*) as count
FROM items i
JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
  AND it.typeName != 'attachment'
  AND it.typeName != 'note'
`;

/**
 * Creator row from CREATORS_QUERY result
 */
export interface CreatorRow {
  firstName: string | null;
  lastName: string;
  fieldMode: number;
  creatorType: string;
  orderIndex: number;
}

/**
 * Format a creator row into a display string.
 *
 * Handles two modes:
 * - fieldMode 0: "LastName, FirstName" (standard author)
 * - fieldMode 1: "LastName" only (institution or single-field name)
 *
 * @param row - Creator row from database query
 * @returns Formatted creator string
 */
export function formatCreator(row: CreatorRow): string {
  if (row.fieldMode === 1) {
    // Single field mode - institution name or full name in lastName
    return row.lastName;
  }
  // Two-field mode - standard name format
  if (row.firstName) {
    return `${row.lastName}, ${row.firstName}`;
  }
  return row.lastName;
}

/**
 * Parse a year from Zotero's date field.
 *
 * Zotero stores dates in various formats:
 * - "2024" (year only)
 * - "2024-03" (year-month)
 * - "2024-03-15" (full date)
 * - "March 2024" (text format)
 * - "c. 2024" (circa)
 *
 * @param dateStr - Date string from Zotero database
 * @returns Four-digit year string, or empty string if unparseable
 */
export function parseYear(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  // Try to extract a 4-digit year
  const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    return yearMatch[0];
  }

  return '';
}
