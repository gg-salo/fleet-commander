import { type NextRequest, NextResponse } from "next/server";
import { validateIdentifier } from "@/lib/validation";
import { getServices } from "@/lib/services";

const PLAN_ID_PATTERN = /^plan-[a-zA-Z0-9_-]+$/;

/** POST /api/plan/[id]/approve — Approve plan, create issues, spawn agents */
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
    const { config, planService } = await getServices();

    const project = config.projects[projectId];
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
    }

    const plan = await planService.approvePlan(projectId, planId);
    return NextResponse.json({ plan });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to approve plan" },
      { status: 500 },
    );
  }
}
