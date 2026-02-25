import { type NextRequest, NextResponse } from "next/server";
import { validateIdentifier } from "@/lib/validation";
import { getServices } from "@/lib/services";

const PLAN_ID_PATTERN = /^plan-[a-zA-Z0-9_-]+$/;

/** GET /api/plan/[id]?projectId=xxx — Get plan status and data */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params;
  const projectId = request.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId query parameter is required" }, { status: 400 });
  }

  const projectErr = validateIdentifier(projectId, "projectId");
  if (projectErr) {
    return NextResponse.json({ error: projectErr }, { status: 400 });
  }

  if (!PLAN_ID_PATTERN.test(planId)) {
    return NextResponse.json({ error: "Invalid plan ID format" }, { status: 400 });
  }

  try {
    const { config, planService } = await getServices();

    const project = config.projects[projectId];
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
    }

    const plan = await planService.getPlan(projectId, planId);
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json({ plan });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get plan" },
      { status: 500 },
    );
  }
}
