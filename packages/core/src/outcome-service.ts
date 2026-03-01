/**
 * Outcome Service — captures structured outcome records when sessions reach terminal state.
 *
 * Derives metrics from the event store + session metadata to produce a SessionOutcome
 * record that can be used for historical analysis and project lessons.
 */

import { appendOutcome } from "./outcome-store.js";
import type { Session, SessionOutcome, EventStore } from "./types.js";

export interface OutcomeService {
  captureOutcome(session: Session): void;
}

export interface OutcomeServiceDeps {
  configPath: string;
  projectPath: string;
  eventStore?: EventStore;
}

function mapStatusToOutcome(
  status: string,
): "merged" | "killed" | "stuck" | "errored" {
  switch (status) {
    case "merged":
      return "merged";
    case "stuck":
      return "stuck";
    case "errored":
      return "errored";
    default:
      return "killed";
  }
}

export function createOutcomeService(deps: OutcomeServiceDeps): OutcomeService {
  const { configPath, projectPath, eventStore } = deps;

  return {
    captureOutcome(session: Session): void {
      const outcome = mapStatusToOutcome(session.status);
      const durationMs = Date.now() - session.createdAt.getTime();

      let ciRetries = 0;
      let reviewRounds = 0;
      const failingChecks: string[] = [];

      if (eventStore) {
        // Count CI failures
        ciRetries = eventStore.count({
          sessionId: session.id,
          types: ["ci.failing"],
        });

        // Count review rounds
        reviewRounds = eventStore.count({
          sessionId: session.id,
          types: ["review.changes_requested"],
        });

        // Extract failing check names from most recent ci.failing event
        const ciEvents = eventStore.query({
          sessionId: session.id,
          types: ["ci.failing"],
          limit: 1,
        });
        if (ciEvents.length > 0) {
          const checks = ciEvents[0].data["failingChecks"];
          if (Array.isArray(checks)) {
            for (const check of checks) {
              if (typeof check === "string") {
                failingChecks.push(check);
              }
            }
          }
        }
      }

      const record: SessionOutcome = {
        sessionId: session.id,
        projectId: session.projectId,
        planId: session.metadata["planId"],
        outcome,
        durationMs,
        ciRetries,
        reviewRounds,
        cost: session.agentInfo?.cost,
        failingChecks: failingChecks.length > 0 ? failingChecks : undefined,
        timestamp: new Date().toISOString(),
      };

      appendOutcome(configPath, projectPath, record);
    },
  };
}
