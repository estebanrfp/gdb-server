/**
 * Resolves conflicts between `currentNode` and `incomingChange` using HLC timestamps.
 * Prioritizes physical time, then logical time.
 * Caps far-future `incomingChange.timestamp.physical` to `Date.now() + MAX_FUTURE_DRIFT_MS`
 * before comparison and potential update.
 * If `currentNode` is null/undefined or lacks a timestamp, `incomingChange` (potentially capped) wins.
 *
 * @param {Object | null | undefined} currentNode - The current node, expected to have `.value` and `.timestamp` (HLC).
 * @param {Object} incomingChange - The incoming change, expected to have `.value` and `.timestamp` (HLC).
 * @param {HybridClock} hybridClock - The HybridClock instance for HLC operations.
 * @returns {{resolved: boolean, value?: any, timestamp?: {physical: number, logical: number}}}
 *   - `resolved: true` if `incomingChange` (possibly capped) is applied, `value` and `timestamp` included.
 *   - `resolved: false` if `currentNode` is kept.
 */

const MAX_FUTURE_DRIFT_MS = 7200000; // 2 hours (adjust as needed)

export const resolveConflict = (currentNode, incomingChange, hybridClock) => {
  let incomingTimestampToUse = incomingChange.timestamp;
  if (incomingChange.timestamp && typeof incomingChange.timestamp.physical === 'number') {
    const limit = Date.now() + MAX_FUTURE_DRIFT_MS;
    if (incomingChange.timestamp.physical > limit) {
      incomingTimestampToUse = {
        physical: limit,
        logical: incomingChange.timestamp.logical
      };
    }
  }

  if (!currentNode || !currentNode.timestamp) {
    return { resolved: true, value: incomingChange.value, timestamp: incomingTimestampToUse };
  }

  const currentTimestamp = currentNode.timestamp;
  const comparison = hybridClock.compare(currentTimestamp, incomingTimestampToUse);

  if (comparison < 0) {
    return { resolved: true, value: incomingChange.value, timestamp: incomingTimestampToUse };
  }

  return { resolved: false };
};