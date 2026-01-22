# Stack Research: Progressive Zotero-Obsidian Bridge

**Project:** Progressive Zotero-Obsidian Bridge
**Researched:** 2026-01-22
**Research Mode:** Ecosystem (Stack dimension)
**Overall Confidence:** MEDIUM-HIGH

## Executive Summary

Building an Obsidian plugin with SQLite access and large dataset handling requires careful stack selection due to Electron's environment constraints. The standard 2025 stack converges on **esbuild** for bundling, **sql.js** for WebAssembly-based SQLite access (avoiding native module complexities), and **async/await patterns** for UI-non-blocking operations (since worker threads aren't supported). The ecosystem is mature for basic plugin development but has documented limitations around concurrency and native modules.

---

## Recommended Core Stack

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| **TypeScript** | 5.8+ | Language, type safety | HIGH |
| **Node.js** | 22 LTS | Development runtime | HIGH |
| **esbuild** | Latest (0.24+) | Bundler | HIGH |
| **Obsidian API** | Latest (via obsidian package) | Plugin framework | HIGH |
| **sql.js** | 1.13.0 | SQLite access (WebAssembly) | MEDIUM-HIGH |

### Rationale

**TypeScript 5.8+**: Released February 2025, includes improved type inference for conditional returns, better Node.js module support, and performance optimizations for large projects. Essential for Obsidian plugin development as all official tooling expects TypeScript.

**Node.js 22 LTS**: Entered LTS October 2024, supported until April 2027. Active LTS status provides stability for plugin development. Node.js 23 is current as of Jan 2025 but will become unsupported in April 2025 (odd-numbered releases don't go to LTS).

**esbuild**: De facto standard for Obsidian plugins as of 2025. The official sample plugin uses esbuild. Benchmarks show 10-100x faster bundling than Webpack/Rollup. Configured with CommonJS format, ES2018 target, tree-shaking, and minification for production.

**Obsidian API**: Distributed as TypeScript definitions (`obsidian.d.ts`). Follows Obsidian desktop app release cycle. Core plugin lifecycle (`onload`, `onLayoutReady`, `onunload`) and UI primitives (Modal, Setting) are stable.

**sql.js 1.13.0**: WebAssembly-based SQLite implementation. Published May 2025 with SQLite 3.49 core, Emscripten 4.x upgrade, and **Node.js worker thread compatibility**. Critical advantage: no native bindings = no Electron rebuild issues.

---

## SQLite Access: The Critical Decision

### Why sql.js (RECOMMENDED)

**Confidence:** MEDIUM-HIGH

```bash
npm install sql.js
```

**Why this works:**
- WebAssembly-based, no native dependencies
- Integrates with Obsidian's vault adapter: `readBinary()` loads database, `writeBinary()` for persistence (though we're read-only)
- Community-verified: Forum discussion explicitly recommends sql.js for Obsidian plugins after better-sqlite3 failures
- Latest version (1.13.0) includes worker thread compatibility (though Obsidian doesn't support workers yet, future-proofing)

**Tradeoffs:**
- Slightly slower than native better-sqlite3 (but negligible for 5000-item queries)
- Database loaded into memory (acceptable for Zotero's typically <100MB SQLite files)

**Usage pattern for read-only Zotero access:**
```typescript
import initSqlJs from 'sql.js';

// Initialize SQL.js with WASM
const SQL = await initSqlJs({
  locateFile: file => `path/to/sql-wasm.wasm`
});

// Read Zotero database
const buffer = await this.app.vault.adapter.readBinary(zoteroDbPath);
const db = new SQL.Database(new Uint8Array(buffer));

// Execute queries
const results = db.exec("SELECT * FROM items LIMIT 10");
```

### Why NOT better-sqlite3

**Confidence:** HIGH (negative claim verified by official forum discussion)

```bash
# DO NOT USE
npm install better-sqlite3
```

**Why this fails in Obsidian:**
- Requires native Node.js addons (`.node` files)
- Obsidian's Electron environment breaks `bindings` package: stack trace parsing incompatibility triggers `"Cannot read properties of undefined (reading 'indexOf')"`
- Requires electron-rebuild, which adds build complexity
- Forum evidence: Multiple developers tried and abandoned better-sqlite3 for Obsidian plugins

**Only consider if:** You're willing to manually manage platform-specific `.node` binaries and use `module-alias` to remap module resolution (complex, fragile, not recommended for MVP).

### Alternative: libsql

**Confidence:** LOW (community solution, limited documentation)

Fork of SQLite with manual `.node` binding management. Requires:
- Downloading platform-specific binaries (darwin-arm64, win32-x64, etc.)
- Using `module-alias` package to redirect module resolution
- Distributing binaries with plugin

**Verdict:** Added complexity without clear benefits over sql.js for read-only access.

---

## UI Components and State Management

### Obsidian Built-in UI

**Confidence:** HIGH

| Component | Use Case | API |
|-----------|----------|-----|
| **Modal** | Triage dashboard container | Extend `Modal` class |
| **Setting** | Settings panel | `addSetting()` on container |
| **ButtonComponent** | Card actions (Accept/Reject/Defer) | `new ButtonComponent(container)` |
| **DropdownComponent** | Filter options | `new DropdownComponent(container)` |

**Official documentation:** Modals have dedicated developer docs. No need for external UI frameworks for MVP card UI.

**Card-based UI pattern:**
- Obsidian plugins typically build custom card UIs with DOM manipulation
- Example plugins: Card View Mode plugin (renders notes as resizable cards), Banyan plugin (card-based browsing with previews)
- Pattern: Render cards in Modal, use ButtonComponent for actions, debounce state updates

### State Persistence

**Confidence:** HIGH

Obsidian provides `loadData()` and `saveData()` methods that automatically serialize/deserialize JSON to `data.json` in plugin directory.

```typescript
// Processing registry pattern
interface ProcessingRegistry {
  [zoteroId: string]: {
    state: 'unseen' | 'proposed' | 'accepted' | 'rejected' | 'imported';
    timestamp: number;
    batchId?: string;
  }
}

// Load
const registry: ProcessingRegistry = await this.loadData() || {};

// Save (debounced to avoid excessive writes)
await this.saveData(registry);
```

**Best practice from community:** Use debounced save function to prevent excessive disk writes during rapid state changes (e.g., user swiping through cards quickly).

### Debouncing Library

**Confidence:** MEDIUM

| Library | Size | Features | Recommendation |
|---------|------|----------|----------------|
| **lodash.debounce** | ~2KB | Industry standard | Safe choice |
| **throttle-debounce** | Minimal | Both throttle & debounce | Lightweight alternative |
| **es-toolkit** | ~88 bytes (96% smaller than lodash) | Modern, TypeScript-first | Emerging option |
| **Native implementation** | 0 bytes | Custom utility function | DIY for simple cases |

**Recommendation:** Use **lodash.debounce** for MVP (proven, well-tested). Consider es-toolkit for v2 if bundle size becomes a concern.

**Warning:** Obsidian's built-in `debounce` function has been reported to behave like throttle (calls every ~1000ms instead of waiting for quiet period). Bring your own debounce.

```bash
npm install lodash.debounce
npm install --save-dev @types/lodash.debounce
```

---

## Performance Considerations: Handling 5000+ Items

### The Worker Thread Problem

**Confidence:** HIGH

**Critical limitation:** Obsidian does NOT support Web Workers or Node.js worker_threads as of 2025. Attempts to use `new Worker()` fail with "Worker is not a constructor" error.

**Implications:**
- All processing must happen on main thread
- Cannot offload SQLite queries or batch scoring to background threads
- Must rely on async/await patterns to yield control back to UI

### Non-Blocking Patterns

**Confidence:** HIGH

**Strategy 1: Async/await with chunked processing**

```typescript
async function processBatchInChunks(items: ZoteroItem[], chunkSize = 50) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    // Process chunk synchronously
    const processed = chunk.map(scoreItem);

    // Yield to event loop
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
```

**Strategy 2: RequestAnimationFrame for UI updates**

For drag-and-drop or scroll updates:
```typescript
import rafThrottle from 'raf-throttle'; // RequestAnimationFrame-based throttle

const throttledUpdate = rafThrottle((position) => {
  updateCardPosition(position);
});
```

**Strategy 3: Lazy loading with pagination**

Only render 10-20 cards in DOM at once, use virtual scrolling pattern if needed (though unlikely for 5-10 item daily batches).

### Database Query Optimization

**Confidence:** MEDIUM

Since sql.js loads entire database into memory:
- Query all 5000 items once at startup: acceptable (likely <100ms for well-indexed queries)
- Cache results in plugin state, filter in memory
- Use SQL indexes wisely (Zotero's schema includes indexes on itemTypeID, dateAdded)

**Critical queries to optimize:**
```sql
-- Get unprocessed items with metadata
SELECT i.itemID, i.dateAdded, i.dateModified,
       (SELECT value FROM itemDataValues WHERE valueID =
         (SELECT valueID FROM itemData WHERE itemID = i.itemID AND fieldID = 1)) as title
FROM items i
WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
  AND i.itemTypeID = 2 -- journalArticle
ORDER BY i.dateAdded DESC
LIMIT 5000;
```

**Performance target:** Initial load <500ms for 5000-item library on modern hardware.

---

## Build Configuration

### esbuild Setup

**Confidence:** HIGH

Official Obsidian sample plugin includes `esbuild.config.mjs`:

```javascript
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

esbuild.build({
  entryPoints: ["main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    // ... other Obsidian internals
    ...builtins
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
  outfile: "main.js",
}).catch(() => process.exit(1));
```

**Key settings:**
- `format: "cjs"` - Obsidian expects CommonJS
- `target: "es2018"` - Compatible with Electron version Obsidian uses
- `external: ["obsidian"]` - Don't bundle Obsidian API (provided at runtime)
- `treeShaking: true` - Remove unused code

### Helper Plugin: esbuild-plugin-obsidian

**Confidence:** MEDIUM

```bash
npm install --save-dev esbuild-plugin-obsidian
```

Automates:
- Manifest generation from `package.json`
- Automatic versioning (`versions.json` updates)
- Field mapping (extracts name, version, description, author, funding)

**Usage:**
```javascript
import obsidianPlugin from "esbuild-plugin-obsidian";

esbuild.build({
  // ... existing config
  plugins: [obsidianPlugin()]
});
```

**Optional but recommended** for reducing boilerplate manifest management.

---

## Supporting Libraries

### Async Utilities

**Confidence:** MEDIUM-HIGH

For batch processing 5-10 items/day with async operations:

| Library | Purpose | Version |
|---------|---------|---------|
| **async-promise-batch** | Batch promise execution with concurrency control | Latest |
| **p-queue** | Promise queue with concurrency | Latest |
| **Native async/await** | Built-in TypeScript | N/A |

**Recommendation:** Start with native async/await + manual chunking. Add p-queue if you need rate limiting for future API calls.

### TypeScript Utilities (Optional)

**Confidence:** LOW (nice-to-have, not critical)

| Library | Purpose | When to Use |
|---------|---------|-------------|
| **type-fest** | Advanced TypeScript types | If complex type transformations needed |
| **zod** | Runtime validation | If validating Zotero schema at runtime |

**Verdict:** Likely unnecessary for MVP. TypeScript 5.8's built-in utilities (Partial, Pick, Omit) cover most needs.

---

## Development Tooling

### Essential Dev Dependencies

**Confidence:** HIGH

```json
{
  "devDependencies": {
    "typescript": "^5.8.0",
    "esbuild": "^0.24.0",
    "@types/node": "^22.0.0",
    "obsidian": "latest",
    "builtin-modules": "^4.0.0",
    "esbuild-plugin-obsidian": "^1.0.0",
    "lodash.debounce": "^4.0.8",
    "@types/lodash.debounce": "^4.0.9"
  },
  "dependencies": {
    "sql.js": "^1.13.0"
  }
}
```

### Linting and Formatting

**Confidence:** MEDIUM

Official sample plugin includes ESLint preconfigured:

```bash
npm run lint  # Run ESLint
```

**Recommendation:** Keep default ESLint config from sample plugin. Obsidian community expects standard JavaScript/TypeScript conventions.

### Testing

**Confidence:** LOW (no community standard for Obsidian plugins)

Obsidian plugin testing is under-documented. No official testing framework recommendation. Options:

- **Vitest** - Modern, fast, TypeScript-first
- **Jest** - Industry standard but slower
- **Manual testing** - Load plugin in Obsidian dev vault

**Verdict:** Manual testing sufficient for MVP. Defer automated testing until Phase 2.

---

## Obsidian-Specific Considerations

### Type Definitions

**Confidence:** HIGH

Two packages for TypeScript types:

1. **obsidian** (official) - Core API types
   ```bash
   npm install --save-dev obsidian
   ```

2. **obsidian-typings** (community) - Undocumented/internal APIs
   ```bash
   npm install --save-dev obsidian-typings
   ```
   Add to `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "types": ["obsidian-typings"]
     }
   }
   ```

**Recommendation:** Start with official `obsidian` package. Only add `obsidian-typings` if you need access to internal APIs (e.g., custom view types).

**Warning from maintainers:** obsidian-typings is based on reverse engineering, may be inaccurate or unstable. Not affiliated with Obsidian team.

### Plugin Lifecycle Hooks

**Confidence:** HIGH

Critical hooks for performance:

| Hook | When | Use for ZotBridge |
|------|------|-------------------|
| `onload()` | Plugin loads | Initialize settings, register commands |
| `onLayoutReady()` | UI ready | Load Zotero database, build registry (async operations) |
| `unload()` | Plugin unloads | Save state, cleanup |

**Best practice:** Heavy operations (like reading 5000-item SQLite database) should happen in `onLayoutReady()` to avoid blocking startup.

```typescript
export default class ZotBridgePlugin extends Plugin {
  async onload() {
    // Lightweight: register commands, UI elements
    this.addCommand({
      id: 'open-triage-dashboard',
      name: 'Open Triage Dashboard',
      callback: () => this.openDashboard()
    });
  }

  async onLayoutReady() {
    // Heavy: load Zotero database
    await this.loadZoteroDatabase();
    await this.buildProcessingRegistry();
  }
}
```

---

## What NOT to Use

### Anti-Recommendations

| Technology | Why Avoid | Alternative |
|------------|-----------|-------------|
| **better-sqlite3** | Native modules fail in Obsidian's Electron environment | sql.js (WebAssembly) |
| **Web Workers** | Not supported in Obsidian as of 2025 | async/await + chunking |
| **Webpack** | 10-100x slower than esbuild, unnecessary | esbuild |
| **React/Vue/Svelte** | Adds bundle size, Obsidian's DOM API is sufficient | Native DOM + Obsidian API |
| **Heavy vector DBs** | Out of scope for MVP (embeddings deferred to Phase 2) | Simple keyword/tag matching |
| **SQLite for plugin state** | Overkill for MVP, JSON is simpler | Obsidian's loadData/saveData (JSON) |
| **Node.js 23** | Becomes unsupported April 2025 | Node.js 22 LTS |
| **Obsidian's built-in debounce** | Reported to behave like throttle | lodash.debounce |

---

## Installation Commands

### Initial Setup

```bash
# Clone Obsidian sample plugin (optional starting point)
git clone https://github.com/obsidianmd/obsidian-sample-plugin.git zotbridge
cd zotbridge

# Install core dependencies
npm install --save sql.js lodash.debounce

# Install dev dependencies
npm install --save-dev \
  typescript@^5.8.0 \
  esbuild@^0.24.0 \
  @types/node@^22.0.0 \
  @types/lodash.debounce@^4.0.9 \
  obsidian@latest \
  builtin-modules@^4.0.0 \
  esbuild-plugin-obsidian

# Development mode (watch)
npm run dev

# Production build
npm run build
```

### WASM File Distribution

sql.js requires distributing the WebAssembly file:

```bash
# Copy sql-wasm.wasm to plugin directory
cp node_modules/sql.js/dist/sql-wasm.wasm .
```

Include in `manifest.json` (handled by esbuild-plugin-obsidian):
```json
{
  "id": "zotbridge",
  "name": "Progressive Zotero-Obsidian Bridge",
  "version": "0.1.0",
  "minAppVersion": "1.0.0",
  "description": "Progressive Zotero import with batch-based triage",
  "author": "Your Name",
  "isDesktopOnly": true
}
```

**Critical:** Set `"isDesktopOnly": true` since SQLite file access requires Node.js environment (mobile Obsidian uses Capacitor, different filesystem APIs).

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|------------|-----------|
| **Core Stack (TS, esbuild, Node.js)** | HIGH | Official Obsidian tooling, widely adopted, stable |
| **SQLite Access (sql.js)** | MEDIUM-HIGH | Community-verified, but edge cases (large DB performance) less documented |
| **Performance Patterns** | MEDIUM | Async patterns well-known, but worker thread limitation is constraint |
| **UI Components** | HIGH | Obsidian API is stable for Modals and Settings |
| **State Management** | HIGH | loadData/saveData pattern is standard across plugins |
| **Debouncing** | MEDIUM | Multiple library options, community reports on Obsidian's built-in quirks |

---

## Open Questions and Gaps

### Needs Phase-Specific Research

1. **Zotero schema stability across versions**
   - Current research: Structure CAN change between Zotero releases
   - Gap: Which fields are stable? How to version-detect schema changes?
   - Resolution: Test against Zotero 6.x and 7.x databases, document field mappings

2. **sql.js performance with 5000+ item queries**
   - Current research: Theoretical acceptable, but no benchmarks found
   - Gap: Real-world performance data for in-memory SQLite with large datasets
   - Resolution: Prototype and benchmark during implementation

3. **Obsidian's Electron version and ES target compatibility**
   - Current research: Official config uses ES2018
   - Gap: Current Obsidian desktop Electron version? Any ES2020+ features safe?
   - Resolution: Check Obsidian release notes for Electron version

4. **Best practice for card-based UI rendering**
   - Current research: Examples exist (Card View Mode, Banyan), but no canonical pattern
   - Gap: Accessibility, keyboard navigation, performance for scrollable cards
   - Resolution: Study existing plugin implementations during UI phase

### Low-Priority Uncertainties

- **Testing frameworks for Obsidian plugins**: No community standard identified
- **CI/CD for plugin releases**: GitHub Actions patterns for Obsidian releases
- **Obsidian's plugin review requirements**: Submission checklist and timelines

---

## Sources

### Official Documentation
- [Obsidian Plugin Build Guide](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Obsidian Modals Documentation](https://docs.obsidian.md/Plugins/User+interface/Modals)
- [TypeScript 5.8 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html)
- [Node.js Releases](https://nodejs.org/en/about/previous-releases)
- [Zotero Direct SQLite Database Access](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)

### Community Resources
- [Obsidian Forum: SQLite Integration Challenges](https://forum.obsidian.md/t/adding-sqlite-database-integration-to-an-obsidian-plugin/88272)
- [Obsidian Forum: Worker Threads Not Supported](https://forum.obsidian.md/t/how-to-speed-up-cpu-intensive-tasks-in-an-obsidian-plugin-workers-not-supported/103392)
- [Obsidian Forum: Debounce API Behavior](https://forum.obsidian.md/t/the-debounce-function-provided-by-the-api-is-actually-a-throttle-function/79147)
- [SQL.js npm Package](https://www.npmjs.com/package/sql.js/v/1.13.0)
- [esbuild-plugin-obsidian](https://github.com/eth-p/esbuild-plugin-obsidian)
- [obsidian-typings](https://github.com/Fevol/obsidian-typings)

### Ecosystem Analysis
- [Modern JavaScript Bundlers Comparison 2025](https://strapi.io/blog/modern-javascript-bundlers-comparison-2025)
- [Node.js in 2025: Modern Features That Matter](https://medium.com/@uyanhewagetr/node-js-in-2025-modern-features-that-matter-7e0e6eca581d)
- [TypeScript Async/Await Complete Guide](https://www.ceos3c.com/web-development/typescript-asyncawait/)
- [es-toolkit: Lodash Alternative](https://blog.logrocket.com/es-toolkit-lodash-alternative/)
- [Zotero Database Schema Exploration](https://gist.github.com/pchemguy/19fa69fb4e74ef0cca0026aa0dbf5f42)

---

## Roadmap Implications

### Phase Structure Recommendations

**Phase 1: Foundation (SQLite + State)**
- **Stack impact:** sql.js integration is critical path, must be validated early
- **Risk:** Performance unknowns with 5000-item queries need prototyping
- **Mitigation:** Build POC that loads real Zotero database and benchmarks query time

**Phase 2: UI (Triage Dashboard)**
- **Stack impact:** Obsidian's Modal API is straightforward, low risk
- **Pattern:** Use ButtonComponent for card actions, debounce state saves
- **Defer:** Accessibility and keyboard navigation to Phase 3 polish

**Phase 3: Batch Logic (Recommendation Engine)**
- **Stack impact:** All in-memory processing, async/await chunking sufficient
- **Risk:** No worker threads means must chunk scoring algorithm to avoid UI freeze
- **Pattern:** Process 50 items at a time with `setTimeout(0)` yields

**Phase 4: Quality Gates + Literature Notes**
- **Stack impact:** YAML frontmatter generation is string templating, low complexity
- **Integration:** Use Obsidian's `vault.create()` API for note generation

### Technology Readiness

| Component | Readiness | Risk Level |
|-----------|-----------|------------|
| TypeScript + esbuild build | Ready | LOW - Standard tooling |
| Obsidian Plugin API (Modal, Settings) | Ready | LOW - Stable, documented |
| sql.js for Zotero read | Ready | MEDIUM - Performance unproven |
| Async processing patterns | Ready | MEDIUM - No workers, must chunk manually |
| JSON state persistence | Ready | LOW - Built-in Obsidian API |
| Debouncing utilities | Ready | LOW - Multiple proven options |

### Flagged for Deeper Research

1. **sql.js performance benchmarking** (Phase 1 blocker)
   - Build prototype, test with 5000-item Zotero library
   - Measure query time for scoring algorithm
   - Fallback: Paginate database loading if needed

2. **Zotero schema version detection** (Phase 1 critical)
   - Query Zotero's `version` table for schema version
   - Document field IDs for title, authors, DOI, year across Zotero 6.x/7.x
   - Build compatibility layer if schemas differ

3. **Card UI rendering patterns** (Phase 2)
   - Study Card View Mode plugin source code
   - Test keyboard navigation patterns
   - Determine virtual scrolling necessity (likely not for 5-10 cards)

---

**Research complete. Stack recommendations are prescriptive and ready for roadmap creation. All confidence levels reflect verification status via official docs (HIGH) or community sources (MEDIUM).**
