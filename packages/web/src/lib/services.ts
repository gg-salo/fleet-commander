/**
 * Server-side singleton for core services.
 *
 * Lazily initializes config, plugin registry, and session manager.
 * Cached in globalThis to survive Next.js HMR reloads in development.
 *
 * NOTE: Plugins are explicitly imported here because Next.js webpack
 * cannot resolve dynamic `import(variable)` expressions used by the
 * core plugin registry's loadBuiltins(). Static imports let webpack
 * bundle them correctly.
 */

import {
  loadConfig,
  createPluginRegistry,
  createSessionManager,
  createPlanService,
  createDiscoveryService,
  createReconciliationService,
  createReviewBatchService,
  createLifecycleManager,
  createEventStore,
  type OrchestratorConfig,
  type PluginRegistry,
  type SessionManager,
  type PlanService,
  type DiscoveryService,
  type ReconciliationService,
  type ReviewBatchService,
  type LifecycleManager,
  type EventStore,
  type SCM,
  type ProjectConfig,
} from "@composio/ao-core";

// Static plugin imports — webpack needs these to be string literals
import pluginRuntimeTmux from "@composio/ao-plugin-runtime-tmux";
import pluginAgentClaudeCode from "@composio/ao-plugin-agent-claude-code";
import pluginWorkspaceWorktree from "@composio/ao-plugin-workspace-worktree";
import pluginScmGithub from "@composio/ao-plugin-scm-github";
import pluginTrackerGithub from "@composio/ao-plugin-tracker-github";
import pluginTrackerLinear from "@composio/ao-plugin-tracker-linear";

export interface Services {
  config: OrchestratorConfig;
  registry: PluginRegistry;
  sessionManager: SessionManager;
  planService: PlanService;
  discoveryService: DiscoveryService;
  reconciliationService: ReconciliationService;
  reviewBatchService: ReviewBatchService;
  lifecycleManager: LifecycleManager;
  getEventStore(projectId: string): EventStore | null;
}

// Cache in globalThis for Next.js HMR stability
const globalForServices = globalThis as typeof globalThis & {
  _aoServices?: Services;
  _aoServicesInit?: Promise<Services>;
};

/** Get (or lazily initialize) the core services singleton. */
export function getServices(): Promise<Services> {
  if (globalForServices._aoServices) {
    return Promise.resolve(globalForServices._aoServices);
  }
  if (!globalForServices._aoServicesInit) {
    globalForServices._aoServicesInit = initServices().catch((err) => {
      // Clear the cached promise so the next call retries instead of
      // permanently returning a rejected promise.
      globalForServices._aoServicesInit = undefined;
      throw err;
    });
  }
  return globalForServices._aoServicesInit;
}

async function initServices(): Promise<Services> {
  const config = loadConfig();
  const registry = createPluginRegistry();

  // Register plugins explicitly (webpack can't handle dynamic import() in core)
  registry.register(pluginRuntimeTmux);
  registry.register(pluginAgentClaudeCode);
  registry.register(pluginWorkspaceWorktree);
  registry.register(pluginScmGithub);
  registry.register(pluginTrackerGithub);
  registry.register(pluginTrackerLinear);

  const sessionManager = createSessionManager({ config, registry });
  const planService = createPlanService({ config, sessionManager, registry });
  const discoveryService = createDiscoveryService({ config, sessionManager, registry });
  const reconciliationService = createReconciliationService({ config, sessionManager, registry });
  const reviewBatchService = createReviewBatchService({ config, sessionManager, registry });

  // Create event stores for each project
  const eventStores = new Map<string, EventStore>();
  for (const [projectId, project] of Object.entries(config.projects)) {
    eventStores.set(projectId, createEventStore(config.configPath, project.path));
  }

  // Pick the first project's event store for the lifecycle manager (it persists all events)
  const firstProjectId = Object.keys(config.projects)[0];
  const firstEventStore = firstProjectId ? eventStores.get(firstProjectId) : undefined;

  // Start lifecycle manager — polls sessions, detects transitions, persists events
  const lifecycleManager = createLifecycleManager({
    config,
    registry,
    sessionManager,
    eventStore: firstEventStore,
    planService,
    reconciliationService,
  });
  lifecycleManager.start(30_000);

  const services: Services = {
    config,
    registry,
    sessionManager,
    planService,
    discoveryService,
    reconciliationService,
    reviewBatchService,
    lifecycleManager,
    getEventStore(projectId: string): EventStore | null {
      return eventStores.get(projectId) ?? null;
    },
  };
  globalForServices._aoServices = services;
  return services;
}

/** Resolve the SCM plugin for a project. Returns null if not configured. */
export function getSCM(registry: PluginRegistry, project: ProjectConfig | undefined): SCM | null {
  if (!project?.scm) return null;
  return registry.get<SCM>("scm", project.scm.plugin);
}

