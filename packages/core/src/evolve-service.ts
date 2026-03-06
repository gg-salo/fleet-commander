/**
 * Evolve Service — proposes CLAUDE.md updates based on learned lessons.
 *
 * Flow:
 *   shouldEvolve()  → checks if enough uncodified lessons exist
 *   evolve()        → spawns agent to update CLAUDE.md → marks lessons as codified
 */

import { readClaudeMd } from "./context-enrichment.js";
import { readLessons, markLessonsCodified } from "./lesson-store.js";
import { readRetrospectives } from "./retrospective-store.js";
import { generateEvolvePrompt } from "./evolve-prompt.js";
import type {
  OrchestratorConfig,
  SessionManager,
  PluginRegistry,
} from "./types.js";

export interface EvolveService {
  evolve(projectId: string): Promise<{ sessionId: string }>;
  shouldEvolve(projectId: string): boolean;
}

export interface EvolveServiceDeps {
  config: OrchestratorConfig;
  sessionManager: SessionManager;
  registry: PluginRegistry;
}

const MIN_UNCODIFIED_LESSONS = 3;

export function createEvolveService(deps: EvolveServiceDeps): EvolveService {
  const { config, sessionManager } = deps;

  function shouldEvolve(projectId: string): boolean {
    const project = config.projects[projectId];
    if (!project) return false;

    const lessons = readLessons(config.configPath, project.path);
    const uncodified = lessons.filter((l) => !l.codified);
    return uncodified.length >= MIN_UNCODIFIED_LESSONS;
  }

  async function evolve(projectId: string): Promise<{ sessionId: string }> {
    const project = config.projects[projectId];
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    const lessons = readLessons(config.configPath, project.path);
    const uncodified = lessons.filter((l) => !l.codified);
    if (uncodified.length === 0) {
      throw new Error("No uncodified lessons to evolve from");
    }

    const claudeMdContent = readClaudeMd(project.path);
    const retrospectives = readRetrospectives(config.configPath, project.path, 20);
    const branch = "chore/evolve-claude-md";

    const prompt = generateEvolvePrompt({
      projectId,
      claudeMdContent,
      lessons: uncodified,
      retrospectives,
      branch,
    });

    const session = await sessionManager.spawn({
      projectId,
      prompt,
      branch,
    });

    // Mark consumed lessons as codified
    const lessonIds = uncodified.map((l) => l.id);
    markLessonsCodified(config.configPath, project.path, lessonIds);

    return { sessionId: session.id };
  }

  return { evolve, shouldEvolve };
}
