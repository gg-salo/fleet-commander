import { type NextRequest, NextResponse } from "next/server";
import { validateIdentifier, validateString } from "@/lib/validation";
import { getServices } from "@/lib/services";
import type { DiscoveryType } from "@composio/ao-core";

const VALID_TYPES: DiscoveryType[] = ["ux-audit", "competitor-research", "code-health"];

/** POST /api/discover — Start a new discovery */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectErr = validateIdentifier(body.projectId, "projectId");
  if (projectErr) {
    return NextResponse.json({ error: projectErr }, { status: 400 });
  }

  const type = body.type as string;
  if (!VALID_TYPES.includes(type as DiscoveryType)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  // context is optional
  if (body.context !== undefined && body.context !== null) {
    const ctxErr = validateString(body.context, "context", 5000);
    if (ctxErr) {
      return NextResponse.json({ error: ctxErr }, { status: 400 });
    }
  }

  const projectId = body.projectId as string;
  const context = body.context as string | undefined;

  try {
    const { config, discoveryService } = await getServices();

    const project = config.projects[projectId];
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
    }

    const discovery = await discoveryService.create(
      projectId,
      type as DiscoveryType,
      context,
    );
    return NextResponse.json({ discovery }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start discovery" },
      { status: 500 },
    );
  }
}
