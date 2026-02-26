import { type NextRequest, NextResponse } from "next/server";
import { validateIdentifier } from "@/lib/validation";
import { getServices } from "@/lib/services";

/** GET /api/discover/:id?projectId=xxx — Poll a discovery's status */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: discoveryId } = await params;
  const projectId = request.nextUrl.searchParams.get("projectId");

  const projectErr = validateIdentifier(projectId, "projectId");
  if (projectErr) {
    return NextResponse.json({ error: projectErr }, { status: 400 });
  }

  try {
    const { discoveryService } = await getServices();
    const discovery = await discoveryService.get(projectId as string, discoveryId);

    if (!discovery) {
      return NextResponse.json({ error: "Discovery not found" }, { status: 404 });
    }

    return NextResponse.json({ discovery });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get discovery" },
      { status: 500 },
    );
  }
}
