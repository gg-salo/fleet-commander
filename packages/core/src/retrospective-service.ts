/**
 * Retrospective Service — spawns lightweight analysis agents for failed sessions.
 *
 * When a session reaches a non-merged terminal state and the "session-failed"
 * reaction is configured with action "spawn-retrospective", this service
 * gathers context and spawns an analysis agent.
 */

import { generateRetrospectivePrompt } from "./retrospective-prompt.js";
import type {
  SessionManager,
  OrchestratorConfig,
  PluginRegistry,
  Runtime,
  EventStore,
} from "./types.js";

export interface RetrospectiveService {
  analyze(sessionId: string): Promise<void>;
}

export interface RetrospectiveServiceDeps {
  config: OrchestratorConfig;
  sessionManager: SessionManager;
  registry: PluginRegistry;
  eventStore?: EventStore;
}

export function createRetrospectiveService(
  deps: RetrospectiveServiceDeps,
): RetrospectiveService {
  const { config, sessionManager, registry, eventStore } = deps;

  return {
    async analyze(sessionId: string): Promise<void> {
      const session = await sessionManager.get(sessionId);
      if (!session) return;

      const project = config.projects[session.projectId];
      if (!project) return;

      // Gather events for this session
      const events = eventStore
        ? eventStore.query({ sessionId, limit: 50 })
        : [];

      // Get terminal output
      let terminalOutput = "";
      if (session.runtimeHandle) {
        const runtime = registry.get<Runtime>(
          "runtime",
          project.runtime ?? config.defaults.runtime,
        );
        if (runtime) {
          try {
            terminalOutput = await runtime.getOutput(session.runtimeHandle, 100);
          } catch {
            // Runtime may be dead
          }
        }
      }

      const prompt = generateRetrospectivePrompt({
        session,
        events,
        terminalOutput,
      });

      // Spawn on a disposable branch
      await sessionManager.spawn({
        projectId: session.projectId,
        prompt,
        branch: `retrospective/${sessionId}`,
      });
    },
  };
}
