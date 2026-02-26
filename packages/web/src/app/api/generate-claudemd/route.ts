import { type NextRequest, NextResponse } from "next/server";
import { validateIdentifier } from "@/lib/validation";
import { getServices } from "@/lib/services";
import { sessionToDashboard } from "@/lib/serialize";
import { generateClaudeMdPrompt } from "@composio/ao-core";

/** POST /api/generate-claudemd — Spawn a CLAUDE.md generator agent session */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectErr = validateIdentifier(body.projectId, "projectId");
  if (projectErr) {
    return NextResponse.json({ error: projectErr }, { status: 400 });
  }

  const projectId = body.projectId as string;

  try {
    const { config, sessionManager } = await getServices();

    const project = config.projects[projectId];
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
    }

    const prompt = generateClaudeMdPrompt({ projectId, project });
    const session = await sessionManager.spawn({
      projectId,
      prompt,
      branch: "chore/add-claude-md",
    });

    return NextResponse.json({ session: sessionToDashboard(session) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to spawn CLAUDE.md generator" },
      { status: 500 },
    );
  }
}
