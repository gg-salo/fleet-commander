import { type NextRequest, NextResponse } from "next/server";
import { validateIdentifier } from "@/lib/validation";
import { getServices } from "@/lib/services";
import { readLessons } from "@composio/ao-core";

const PLAN_ID_PATTERN = /^plan-[a-zA-Z0-9_-]+$/;

/** POST /api/plan/[id]/retrospective — Trigger plan retrospective analysis */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectErr = validateIdentifier(body.projectId, "projectId");
  if (projectErr) {
    return NextResponse.json({ error: projectErr }, { status: 400 });
  }

  if (!PLAN_ID_PATTERN.test(planId)) {
    return NextResponse.json({ error: "Invalid plan ID format" }, { status: 400 });
  }

  const projectId = body.projectId as string;

  try {
    const { config, planRetrospectiveService } = await getServices();

    const project = config.projects[projectId];
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
    }

    await planRetrospectiveService.analyze(projectId, planId);
    return NextResponse.json({ status: "analyzing" }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start plan retrospective" },
      { status: 500 },
    );
  }
}

/** GET /api/plan/[id]/retrospective — View lessons learned from plan */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params;
  const projectId = _request.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId query param required" }, { status: 400 });
  }

  if (!PLAN_ID_PATTERN.test(planId)) {
    return NextResponse.json({ error: "Invalid plan ID format" }, { status: 400 });
  }

  try {
    const { config } = await getServices();

    const project = config.projects[projectId];
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
    }

    const lessons = readLessons(config.configPath, project.path)
      .filter((l) => l.planId === planId);

    return NextResponse.json({ lessons });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read plan lessons" },
      { status: 500 },
    );
  }
}
