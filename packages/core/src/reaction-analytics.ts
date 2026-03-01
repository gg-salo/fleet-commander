/**
 * Reaction Analytics — compute effectiveness metrics for CI fix reactions.
 *
 * Queries ci.fix_sent + ci.passing/ci.fix_failed events from the event store,
 * groups by session, and computes resolution rates.
 */

import type { EventStore } from "./types.js";

export interface ReactionEffectiveness {
  reactionKey: string;
  totalAttempts: number;
  successCount: number;
  successRate: number;
  avgAttemptsToResolve: number;
}

/** Compute CI fix effectiveness from event store data. */
export function getReactionEffectiveness(
  eventStore: EventStore,
  projectId: string,
): ReactionEffectiveness[] {
  // Query all CI fix events
  const fixSentEvents = eventStore.query({
    projectId,
    types: ["ci.fix_sent"],
  });

  const passingEvents = eventStore.query({
    projectId,
    types: ["ci.passing"],
  });

  const fixFailedEvents = eventStore.query({
    projectId,
    types: ["ci.fix_failed"],
  });

  // Group by session
  const sessionAttempts = new Map<string, number>();
  for (const event of fixSentEvents) {
    const current = sessionAttempts.get(event.sessionId) ?? 0;
    sessionAttempts.set(event.sessionId, current + 1);
  }

  // Track resolutions per session
  const resolvedSessions = new Set<string>();
  for (const event of passingEvents) {
    if (event.data["resolved"] === true) {
      resolvedSessions.add(event.sessionId);
    }
  }

  // Also check fix_failed events with resolved: true (legacy compatibility)
  for (const event of fixFailedEvents) {
    if (event.data["resolved"] === true) {
      resolvedSessions.add(event.sessionId);
    }
  }

  const totalAttempts = fixSentEvents.length;
  const successCount = resolvedSessions.size;
  const sessionsWithAttempts = sessionAttempts.size;
  const successRate = sessionsWithAttempts > 0 ? successCount / sessionsWithAttempts : 0;

  // Average attempts to resolve (for successful sessions only)
  let totalAttemptsForResolved = 0;
  for (const sessionId of resolvedSessions) {
    totalAttemptsForResolved += sessionAttempts.get(sessionId) ?? 0;
  }
  const avgAttemptsToResolve =
    successCount > 0 ? totalAttemptsForResolved / successCount : 0;

  return [
    {
      reactionKey: "ci-failed",
      totalAttempts,
      successCount,
      successRate,
      avgAttemptsToResolve,
    },
  ];
}
