import { type NextRequest, NextResponse } from "next/server";
import { getServices } from "@/lib/services";

/** GET /api/plans?projectId=xxx */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  try {
    const { config, planService } = await getServices();

    const project = config.projects[projectId];
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
    }

    const planIds = planService.listPlans(projectId);
    const plans = [];

    for (const id of planIds) {
      const plan = await planService.getPlan(projectId, id);
      if (plan) {
        plans.push(plan);
      }
    }

    return NextResponse.json({ plans });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list plans" },
      { status: 500 },
    );
  }
}
