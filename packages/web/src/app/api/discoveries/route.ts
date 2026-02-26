import { type NextRequest, NextResponse } from "next/server";
import { validateIdentifier } from "@/lib/validation";
import { getServices } from "@/lib/services";

/** GET /api/discoveries?projectId=xxx — List all discoveries for a project */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");

  const projectErr = validateIdentifier(projectId, "projectId");
  if (projectErr) {
    return NextResponse.json({ error: projectErr }, { status: 400 });
  }

  try {
    const { discoveryService } = await getServices();
    const ids = discoveryService.list(projectId as string);

    // Read each discovery
    const discoveries = [];
    for (const id of ids) {
      const discovery = await discoveryService.get(projectId as string, id);
      if (discovery) {
        discoveries.push(discovery);
      }
    }

    return NextResponse.json({ discoveries });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list discoveries" },
      { status: 500 },
    );
  }
}
