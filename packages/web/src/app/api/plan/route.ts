import { type NextRequest, NextResponse } from "next/server";
import { validateIdentifier, validateString } from "@/lib/validation";
import { getServices } from "@/lib/services";

/** POST /api/plan — Create a new feature plan */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectErr = validateIdentifier(body.projectId, "projectId");
  if (projectErr) {
    return NextResponse.json({ error: projectErr }, { status: 400 });
  }

  const descErr = validateString(body.description, "description", 5000);
  if (descErr) {
    return NextResponse.json({ error: descErr }, { status: 400 });
  }

  const projectId = body.projectId as string;
  const description = body.description as string;

  try {
    const { config, planService } = await getServices();

    const project = config.projects[projectId];
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
    }

    const plan = await planService.createPlan(projectId, description);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create plan" },
      { status: 500 },
    );
  }
}
