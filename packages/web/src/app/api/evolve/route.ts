import { type NextRequest, NextResponse } from "next/server";
import { validateIdentifier } from "@/lib/validation";
import { getServices } from "@/lib/services";

/** POST /api/evolve — Trigger CLAUDE.md evolution for a project */
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
    const { config, evolveService } = await getServices();

    const project = config.projects[projectId];
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
    }

    if (!evolveService.shouldEvolve(projectId)) {
      return NextResponse.json(
        { error: "Not enough uncodified lessons to trigger evolution (need 3+)" },
        { status: 409 },
      );
    }

    const result = await evolveService.evolve(projectId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to trigger evolution" },
      { status: 500 },
    );
  }
}
