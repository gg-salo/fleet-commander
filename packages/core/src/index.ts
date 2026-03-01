/**
 * @composio/ao-core
 *
 * Core library for the Agent Orchestrator.
 * Exports all types, config loader, and service implementations.
 */

// Types — everything plugins and consumers need
export * from "./types.js";

// Config — YAML loader + validation
export {
  loadConfig,
  loadConfigWithPath,
  validateConfig,
  getDefaultConfig,
  findConfig,
  findConfigFile,
} from "./config.js";

// Plugin registry
export { createPluginRegistry } from "./plugin-registry.js";

// Metadata — flat-file session metadata read/write
export {
  readMetadata,
  readMetadataRaw,
  writeMetadata,
  updateMetadata,
  deleteMetadata,
  listMetadata,
} from "./metadata.js";

// tmux — command wrappers
export {
  isTmuxAvailable,
  listSessions as listTmuxSessions,
  hasSession as hasTmuxSession,
  newSession as newTmuxSession,
  sendKeys as tmuxSendKeys,
  capturePane as tmuxCapturePane,
  killSession as killTmuxSession,
  getPaneTTY as getTmuxPaneTTY,
} from "./tmux.js";

// Session manager — session CRUD
export { createSessionManager } from "./session-manager.js";
export type { SessionManagerDeps } from "./session-manager.js";

// Lifecycle manager — state machine + reaction engine
export { createLifecycleManager } from "./lifecycle-manager.js";
export type { LifecycleManagerDeps } from "./lifecycle-manager.js";

// Prompt builder — layered prompt composition
export { buildPrompt, BASE_AGENT_PROMPT } from "./prompt-builder.js";
export type { PromptBuildConfig } from "./prompt-builder.js";

// Orchestrator prompt — generates orchestrator context for `ao start`
export { generateOrchestratorPrompt } from "./orchestrator-prompt.js";
export type { OrchestratorPromptConfig } from "./orchestrator-prompt.js";

// CI setup prompt — generates prompt for setting up CI + baseline tests
export { generateCISetupPrompt } from "./ci-setup-prompt.js";
export type { CISetupPromptConfig } from "./ci-setup-prompt.js";

// Planning prompt — generates prompt for feature planning agent
export { generatePlanningPrompt } from "./planning-prompt.js";
export type { PlanningPromptConfig } from "./planning-prompt.js";

// Review prompt — generates prompt for PR review agent
export { generateReviewPrompt, generateBatchReviewPrompt } from "./review-prompt.js";
export type { ReviewPromptConfig, BatchReviewPromptConfig } from "./review-prompt.js";

// Plan store — flat-file JSON CRUD for plans
export { readPlan, writePlan, listPlans, generatePlanId, getPlansDir } from "./plan-store.js";

// Event store — JSONL-backed persistent event storage
export { createEventStore } from "./event-store.js";

// Plan service — planning workflow orchestration
export { createPlanService } from "./plan-service.js";
export type { PlanService, PlanServiceDeps } from "./plan-service.js";

// Discovery prompts — generates prompts for discovery agents
export {
  generateUXAuditPrompt,
  generateCompetitorResearchPrompt,
  generateCodeHealthPrompt,
} from "./discovery-prompts.js";
export type { DiscoveryPromptConfig } from "./discovery-prompts.js";

// CLAUDE.md generator prompt
export { generateClaudeMdPrompt } from "./claudemd-prompt.js";
export type { ClaudeMdPromptConfig } from "./claudemd-prompt.js";

// Discovery store — flat-file JSON CRUD for discoveries
export {
  readDiscovery,
  writeDiscovery,
  listDiscoveries,
  generateDiscoveryId,
  getDiscoveriesDir,
} from "./discovery-store.js";

// Discovery service — discovery workflow orchestration
export { createDiscoveryService } from "./discovery-service.js";
export type { DiscoveryService, DiscoveryServiceDeps } from "./discovery-service.js";

// Reconciliation prompt — generates prompt for cross-PR reconciliation agent
export { generateReconciliationPrompt } from "./reconciliation-prompt.js";
export type { ReconciliationPromptConfig } from "./reconciliation-prompt.js";

// Reconciliation store — flat-file JSON CRUD for reconciliations
export {
  readReconciliation,
  writeReconciliation,
  listReconciliations,
  generateReconciliationId,
  getReconciliationsDir,
} from "./reconciliation-store.js";

// Reconciliation service — cross-PR reconciliation workflow orchestration
export { createReconciliationService } from "./reconciliation-service.js";
export type {
  ReconciliationService,
  ReconciliationServiceDeps,
} from "./reconciliation-service.js";

// Review batch store — flat-file JSON CRUD for review batches
export {
  readReviewBatch,
  writeReviewBatch,
  listReviewBatches,
  generateReviewBatchId,
  getReviewBatchesDir,
} from "./review-batch-store.js";

// Review batch service — batch PR review workflow orchestration
export { createReviewBatchService } from "./review-batch-service.js";
export type { ReviewBatchService, ReviewBatchServiceDeps } from "./review-batch-service.js";

// Shared utilities
export { shellEscape, escapeAppleScript, validateUrl, readLastJsonlEntry } from "./utils.js";

// Path utilities — hash-based directory structure
export {
  generateConfigHash,
  generateProjectId,
  generateInstanceId,
  generateSessionPrefix,
  getProjectBaseDir,
  getSessionsDir,
  getWorktreesDir,
  getArchiveDir,
  getOriginFilePath,
  generateSessionName,
  generateTmuxName,
  parseTmuxName,
  expandHome,
  validateAndStoreOrigin,
} from "./paths.js";
