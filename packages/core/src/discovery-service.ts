/**
 * Discovery Service — orchestrates the discovery workflow.
 *
 * Flow:
 *   create()  → spawns discovery agent → agent writes output JSON
 *   get()     → checks if output file exists → transitions status
 *   list()    → returns all discovery IDs for a project
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getDiscoveriesDir,
  readDiscovery,
  writeDiscovery,
  generateDiscoveryId,
  listDiscoveries,
} from "./discovery-store.js";
import {
  generateUXAuditPrompt,
  generateCompetitorResearchPrompt,
  generateCodeHealthPrompt,
} from "./discovery-prompts.js";
import type {
  OrchestratorConfig,
  SessionManager,
  PluginRegistry,
  Discovery,
  DiscoveryId,
  DiscoveryType,
  DiscoveryFinding,
  ProjectConfig,
} from "./types.js";

export interface DiscoveryServiceDeps {
  config: OrchestratorConfig;
  sessionManager: SessionManager;
  registry: PluginRegistry;
}

export interface DiscoveryService {
  create(projectId: string, type: DiscoveryType, context?: string): Promise<Discovery>;
  get(projectId: string, discoveryId: DiscoveryId): Promise<Discovery | null>;
  list(projectId: string): DiscoveryId[];
}

const PROMPT_GENERATORS: Record<
  DiscoveryType,
  (opts: { projectId: string; project: ProjectConfig; outputPath: string; context?: string }) => string
> = {
  "ux-audit": generateUXAuditPrompt,
  "competitor-research": generateCompetitorResearchPrompt,
  "code-health": generateCodeHealthPrompt,
};

export function createDiscoveryService(deps: DiscoveryServiceDeps): DiscoveryService {
  const { config, sessionManager } = deps;

  function resolveProject(projectId: string): ProjectConfig {
    const project = config.projects[projectId];
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }
    return project;
  }

  async function create(
    projectId: string,
    type: DiscoveryType,
    context?: string,
  ): Promise<Discovery> {
    const project = resolveProject(projectId);
    const discoveryId = generateDiscoveryId();
    const discoveriesDir = getDiscoveriesDir(config.configPath, project.path);
    const outputPath = join(discoveriesDir, `${discoveryId}-output.json`);

    // Create initial discovery record
    const now = new Date().toISOString();
    const discovery: Discovery = {
      id: discoveryId,
      projectId,
      type,
      status: "discovering",
      createdAt: now,
      updatedAt: now,
      findings: [],
    };

    writeDiscovery(config.configPath, project.path, discovery);

    // Generate prompt based on type
    const generatePrompt = PROMPT_GENERATORS[type];
    const prompt = generatePrompt({
      projectId,
      project,
      outputPath,
      context,
    });

    // Spawn agent on the default branch (read-only analysis)
    const session = await sessionManager.spawn({
      projectId,
      prompt,
      branch: project.defaultBranch,
    });

    // Update discovery with session ID
    discovery.sessionId = session.id;
    discovery.updatedAt = new Date().toISOString();
    writeDiscovery(config.configPath, project.path, discovery);

    return discovery;
  }

  async function get(
    projectId: string,
    discoveryId: DiscoveryId,
  ): Promise<Discovery | null> {
    const project = resolveProject(projectId);
    const discovery = readDiscovery(config.configPath, project.path, discoveryId);
    if (!discovery) return null;

    // If still discovering, check if output file exists
    if (discovery.status === "discovering") {
      const discoveriesDir = getDiscoveriesDir(config.configPath, project.path);
      const outputPath = join(discoveriesDir, `${discoveryId}-output.json`);

      if (existsSync(outputPath)) {
        // Agent finished — parse the output
        try {
          const raw = readFileSync(outputPath, "utf-8");
          const output = JSON.parse(raw) as { findings?: unknown[] };

          if (Array.isArray(output.findings) && output.findings.length > 0) {
            discovery.findings = output.findings.map((raw: unknown, i: number) => {
              const f = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
                string,
                unknown
              >;
              return {
                id: String(f.id ?? i + 1),
                title: String(f.title ?? ""),
                description: String(f.description ?? ""),
                category: String(f.category ?? "general"),
                priority: validatePriority(f.priority),
                effort: validateEffort(f.effort),
              } satisfies DiscoveryFinding;
            });
            discovery.status = "ready";
            discovery.updatedAt = new Date().toISOString();
            writeDiscovery(config.configPath, project.path, discovery);
          }
        } catch {
          discovery.status = "failed";
          discovery.error = "Failed to parse discovery agent output";
          discovery.updatedAt = new Date().toISOString();
          writeDiscovery(config.configPath, project.path, discovery);
        }
      } else if (discovery.sessionId) {
        // Check if session exited without producing output
        try {
          const session = await sessionManager.get(discovery.sessionId);
          if (session && session.activity === "exited") {
            discovery.status = "failed";
            discovery.error = "Discovery agent exited without producing findings";
            discovery.updatedAt = new Date().toISOString();
            writeDiscovery(config.configPath, project.path, discovery);
          }
        } catch {
          // Session lookup failed — leave as discovering
        }
      }
    }

    return discovery;
  }

  function listIds(projectId: string): DiscoveryId[] {
    const project = resolveProject(projectId);
    return listDiscoveries(config.configPath, project.path);
  }

  return {
    create,
    get,
    list: listIds,
  };
}

function validatePriority(value: unknown): "high" | "medium" | "low" {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function validateEffort(value: unknown): "small" | "medium" | "large" {
  if (value === "small" || value === "medium" || value === "large") return value;
  return "medium";
}
