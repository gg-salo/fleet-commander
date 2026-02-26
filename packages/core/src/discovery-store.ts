/**
 * Discovery Store — flat-file JSON CRUD for discovery results.
 *
 * Discoveries are stored as JSON files in ~/.agent-orchestrator/{hash}-{projectId}/discoveries/
 * alongside the existing sessions/ and plans/ directories.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { randomBytes } from "node:crypto";
import { getProjectBaseDir } from "./paths.js";
import type { Discovery, DiscoveryId } from "./types.js";

/**
 * Get the discoveries directory for a project.
 * Format: ~/.agent-orchestrator/{hash}-{projectId}/discoveries
 */
export function getDiscoveriesDir(configPath: string, projectPath: string): string {
  return join(getProjectBaseDir(configPath, projectPath), "discoveries");
}

/**
 * Generate a unique discovery ID.
 * Format: discovery-{timestamp}-{random}
 */
export function generateDiscoveryId(): DiscoveryId {
  const ts = Date.now();
  const rand = randomBytes(4).toString("hex");
  return `discovery-${ts}-${rand}`;
}

/** Validate a discovery ID to prevent path traversal. */
function isValidDiscoveryId(discoveryId: string): boolean {
  return /^discovery-[a-zA-Z0-9_-]+$/.test(discoveryId);
}

/**
 * Read a discovery from disk.
 * Returns null if the discovery doesn't exist.
 */
export function readDiscovery(
  configPath: string,
  projectPath: string,
  discoveryId: DiscoveryId,
): Discovery | null {
  if (!isValidDiscoveryId(discoveryId)) {
    throw new Error(`Invalid discovery ID: ${discoveryId}`);
  }

  const discoveriesDir = getDiscoveriesDir(configPath, projectPath);
  const filePath = join(discoveriesDir, `${discoveryId}.json`);

  // Validate resolved path is inside discoveriesDir (path traversal protection)
  const resolved = join(discoveriesDir, basename(`${discoveryId}.json`));
  if (resolved !== filePath) {
    throw new Error(`Invalid discovery ID: path traversal detected`);
  }

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Discovery;
  } catch {
    return null;
  }
}

/**
 * Write a discovery to disk.
 * Creates the discoveries directory if it doesn't exist.
 */
export function writeDiscovery(
  configPath: string,
  projectPath: string,
  discovery: Discovery,
): void {
  if (!isValidDiscoveryId(discovery.id)) {
    throw new Error(`Invalid discovery ID: ${discovery.id}`);
  }

  const discoveriesDir = getDiscoveriesDir(configPath, projectPath);
  mkdirSync(discoveriesDir, { recursive: true });

  const filePath = join(discoveriesDir, `${discovery.id}.json`);
  writeFileSync(filePath, JSON.stringify(discovery, null, 2), "utf-8");
}

/**
 * List all discovery IDs for a project.
 * Returns an array of discovery IDs sorted by creation time (newest first).
 */
export function listDiscoveries(configPath: string, projectPath: string): DiscoveryId[] {
  const discoveriesDir = getDiscoveriesDir(configPath, projectPath);

  if (!existsSync(discoveriesDir)) {
    return [];
  }

  return readdirSync(discoveriesDir)
    .filter((f) => f.startsWith("discovery-") && f.endsWith(".json") && !f.includes("-output"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort()
    .reverse();
}
