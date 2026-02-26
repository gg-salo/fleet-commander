import { type NextRequest, NextResponse } from "next/server";
import { getServices } from "@/lib/services";

/** GET /api/notifications?projectId=&limit=50&since= */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get("projectId") ?? undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);
  const sinceParam = searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;

  try {
    const { config, getEventStore } = await getServices();

    // If projectId specified, query that store; otherwise merge all
    const projectIds = projectId ? [projectId] : Object.keys(config.projects);

    const allEvents: Array<{
      id: string;
      type: string;
      priority: string;
      sessionId: string;
      projectId: string;
      timestamp: string;
      message: string;
      data: Record<string, unknown>;
    }> = [];

    for (const pid of projectIds) {
      const store = getEventStore(pid);
      if (!store) continue;

      const events = store.query({
        projectId: pid,
        since,
        limit,
      });
      for (const e of events) {
        allEvents.push({
          id: e.id,
          type: e.type,
          priority: e.priority,
          sessionId: e.sessionId,
          projectId: e.projectId,
          timestamp: e.timestamp.toISOString(),
          message: e.message,
          data: e.data,
        });
      }
    }

    // Sort newest first and apply limit
    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const sliced = allEvents.slice(0, limit);

    const total = projectIds.reduce((sum, pid) => {
      const store = getEventStore(pid);
      return sum + (store?.count({ projectId: pid }) ?? 0);
    }, 0);

    return NextResponse.json({ events: sliced, total });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch notifications" },
      { status: 500 },
    );
  }
}
