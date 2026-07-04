// ─────────────────────────────────────────────────────────────────────────────
// Resilience — Production retry logic, circuit breaker, and error handling
// ─────────────────────────────────────────────────────────────────────────────
// Provides production-grade resilience utilities for critical operations:
//
// Exports:
//   - withRetry(fn, options): retries a function with exponential backoff
//     Options: maxRetries, baseDelayMs, maxDelayMs, onRetry callback, shouldRetry predicate
//   - CircuitBreaker class: circuit breaker pattern for failing endpoints
//     States: CLOSED (normal), OPEN (failing, reject fast), HALF_OPEN (testing)
//   - withTimeout(promise, ms): wraps a promise with a timeout
//   - debounce(fn, ms): standard debounce utility
//
// Used by apiClient, syncEngine, and socket reconnection logic.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Production Resilience Utilities
 * Retry logic, circuit breaker, and error handling for critical operations
 */

// ── Retry with Exponential Backoff ─────────────────────────────────────
export async function withRetry(
  fn,
  { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 10000, onRetry = null, shouldRetry = null } = {}
) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        console.error('[Resilience] Max retries exceeded:', error);
        throw error;
      }

      if (shouldRetry && !shouldRetry(error)) {
        throw error;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      console.warn(`[Resilience] Retry ${attempt + 1}/${maxRetries} after ${delay}ms:`, error.message);

      if (onRetry) {
        onRetry(attempt + 1, error, delay);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// ── Circuit Breaker Pattern ──────────────────────────────────────────────
export class CircuitBreaker {
  constructor({ failureThreshold = 5, resetTimeoutMs = 60000, name = 'CircuitBreaker' } = {}) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.name = name;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`);
      } else {
        throw new Error(`[CircuitBreaker:${this.name}] Circuit is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.error(`[CircuitBreaker:${this.name}] Circuit OPENED after ${this.failureCount} failures`);
    }
  }

  getState() {
    return this.state;
  }

  reset() {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED';
    console.log(`[CircuitBreaker:${this.name}] Circuit reset`);
  }
}

// ── Background Queue with Locks ───────────────────────────────────────────
export class BackgroundQueue {
  constructor(name = 'BackgroundQueue') {
    this.name = name;
    this.queue = [];
    this.isProcessing = false;
  }

  async add(task) {
    this.queue.push(task);
    console.log(`[BackgroundQueue:${this.name}] Task added, queue size: ${this.queue.length}`);
    await this.process();
  }

  async process() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    console.log(`[BackgroundQueue:${this.name}] Processing ${this.queue.length} tasks`);

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      try {
        // Try to acquire lock for this task
        if (navigator.locks) {
          const lockName = `${this.name}-lock-${Date.now()}`;
          await navigator.locks.request(lockName, async (lock) => {
            await task();
          });
        } else {
          // Fallback if locks not supported
          await task();
        }
      } catch (error) {
        console.error(`[BackgroundQueue:${this.name}] Task failed:`, error);
        // Re-queue for retry (limit retries)
        if (task.retryCount < 3) {
          task.retryCount = (task.retryCount || 0) + 1;
          this.queue.push(task);
        }
      }
    }

    this.isProcessing = false;
    console.log(`[BackgroundQueue:${this.name}] Processing complete`);
  }

  getQueueSize() {
    return this.queue.length;
  }
}

// ── Optimistic UI with Rollback ─────────────────────────────────────────
export async function withOptimisticUpdate({
  optimisticFn,
  rollbackFn,
  commitFn,
  onError = null
}) {
  try {
    // Execute optimistic update
    const optimisticResult = optimisticFn();
    
    // Execute commit (API call)
    await commitFn();
    
    return optimisticResult;
  } catch (error) {
    console.error('[OptimisticUpdate] Commit failed, rolling back:', error);
    
    // Rollback optimistic update
    try {
      rollbackFn();
    } catch (rollbackError) {
      console.error('[OptimisticUpdate] Rollback failed:', rollbackError);
    }
    
    if (onError) {
      onError(error);
    }
    
    throw error;
  }
}

// ── Error Logging with Context ───────────────────────────────────────────
export function logCriticalError(context, error, additionalContext = {}) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    context,
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
    },
    ...additionalContext,
  };
  
  console.error('[CriticalError]', JSON.stringify(errorLog, null, 2));
  
  // Could also send to error tracking service here
  // e.g., Sentry, LogRocket, etc.
}

// ── Retry Configuration for Different Operations ─────────────────────────
export const RETRY_CONFIG = {
  SETTLE: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 },
  PRINT_BILL: { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 },
  KOT: { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 5000 },
  TABLE_UPDATE: { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 2000 },
  INVENTORY: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 },
  TRANSACTIONS: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 },
};
