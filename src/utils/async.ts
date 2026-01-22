/**
 * Async utilities for chunked processing
 *
 * Obsidian plugins run on the main thread without Web Workers.
 * Processing large datasets (5000+ items) synchronously freezes the UI.
 * These utilities enable chunked async processing with event loop yields.
 */

/**
 * Process items in chunks with event loop yields between chunks.
 * Prevents UI freezing when processing large arrays.
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param chunkSize - Number of items per chunk (default 50)
 *
 * @example
 * ```typescript
 * await processInChunks(
 *   zoteroItems,
 *   async (item, index) => {
 *     // Process each item
 *     await saveItem(item);
 *   },
 *   50
 * );
 * ```
 */
export async function processInChunks<T>(
  items: T[],
  processor: (item: T, index: number) => Promise<void>,
  chunkSize: number = 50
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    // Process all items in this chunk
    for (let j = 0; j < chunk.length; j++) {
      await processor(chunk[j], i + j);
    }

    // Yield to event loop between chunks
    // This allows UI updates and prevents "Not Responding"
    await yieldToEventLoop();
  }
}

/**
 * Process items in chunks with parallel execution within each chunk.
 * Faster than sequential but may use more memory.
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param chunkSize - Number of items per chunk (default 50)
 */
export async function processInChunksParallel<T>(
  items: T[],
  processor: (item: T, index: number) => Promise<void>,
  chunkSize: number = 50
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    // Process all items in chunk in parallel
    await Promise.all(
      chunk.map((item, j) => processor(item, i + j))
    );

    // Yield to event loop between chunks
    await yieldToEventLoop();
  }
}

/**
 * Yield to the event loop.
 * Allows pending UI updates and user interactions to process.
 *
 * Uses setTimeout(0) which puts the continuation at the end
 * of the macrotask queue.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Simple promise-based delay utility.
 *
 * @param ms - Milliseconds to delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a debounced version of an async function.
 * Only the last call within the delay window will execute.
 *
 * @param fn - Async function to debounce
 * @param delayMs - Delay in milliseconds
 * @returns Debounced function
 */
export function debounceAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
}

/**
 * Retry an async operation with exponential backoff.
 *
 * @param operation - Async function to retry
 * @param maxRetries - Maximum number of retry attempts
 * @param baseDelayMs - Initial delay between retries (default 100ms)
 * @returns Result of the operation
 * @throws Last error if all retries fail
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 100
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        // Exponential backoff: 100ms, 200ms, 400ms, ...
        const delayTime = baseDelayMs * Math.pow(2, attempt);
        await delay(delayTime);
      }
    }
  }

  throw lastError;
}

/**
 * Execute a batch of operations with a concurrency limit.
 * Useful for rate-limited APIs or resource-constrained operations.
 *
 * @param items - Items to process
 * @param operation - Async operation to perform on each item
 * @param concurrency - Maximum concurrent operations (default 5)
 * @returns Array of results in same order as items
 */
export async function batchWithConcurrency<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await operation(items[index]);
    }
  }

  // Create worker pool
  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}
