import { type NextRequest, NextResponse } from "next/server";
import { validateIdentifier } from "@/lib/validation";
import { getServices } from "@/lib/services";

/** GET /api/review-prs/:id?projectId=xxx — Poll a review batch's status */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: batchId } = await params;
  const projectId = request.nextUrl.searchParams.get("projectId");

  const projectErr = validateIdentifier(projectId, "projectId");
  if (projectErr) {
    return NextResponse.json({ error: projectErr }, { status: 400 });
  }

  try {
    const { reviewBatchService } = await getServices();
    const batch = await reviewBatchService.get(projectId as string, batchId);

    if (!batch) {
      return NextResponse.json({ error: "Review batch not found" }, { status: 404 });
    }

    return NextResponse.json({ batch });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get review batch" },
      { status: 500 },
    );
  }
}
