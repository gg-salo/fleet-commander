import { type NextRequest, NextResponse } from "next/server";
import { validateIdentifier } from "@/lib/validation";
import { getServices } from "@/lib/services";
import type { PlanTask } from "@composio/ao-core";

const PLAN_ID_PATTERN = /^plan-[a-zA-Z0-9_-]+$/;

/** PATCH /api/plan/[id]/edit — Edit plan tasks */
export async function PATCH(
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

  if (!Array.isArray(body.tasks)) {
    return NextResponse.json({ error: "tasks must be an array" }, { status: 400 });
  }

  const projectId = body.projectId as string;
  const tasks = body.tasks as PlanTask[];

  try {
    const { config, planService } = await getServices();

    const project = config.projects[projectId];
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
    }

    const plan = await planService.editPlan(projectId, planId, tasks);
    return NextResponse.json({ plan });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to edit plan" },
      { status: 500 },
    );
  }
}
