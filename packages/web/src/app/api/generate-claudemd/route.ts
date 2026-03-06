import { type NextRequest, NextResponse } from "next/server";
import { validateIdentifier } from "@/lib/validation";
import { getServices } from "@/lib/services";
import { sessionToDashboard } from "@/lib/serialize";
import { generateClaudeMdPrompt, readLessons, readRetrospectives } from "@composio/ao-core";

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

    // Inject learned patterns if available
    const lessons = readLessons(config.configPath, project.path, 30);
    const retrospectives = readRetrospectives(config.configPath, project.path, 20);

    const prompt = generateClaudeMdPrompt({
      projectId,
      project,
      lessons: lessons.length > 0 ? lessons : undefined,
      retrospectives: retrospectives.length > 0 ? retrospectives : undefined,
    });
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
