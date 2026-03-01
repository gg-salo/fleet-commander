import { type NextRequest, NextResponse } from "next/server";
import { validateIdentifier } from "@/lib/validation";
import { getServices, getSCM } from "@/lib/services";

/** GET /api/review-prs?projectId=xxx — List open PRs for review */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");

  const projectErr = validateIdentifier(projectId, "projectId");
  if (projectErr) {
    return NextResponse.json({ error: projectErr }, { status: 400 });
  }

  try {
    const { config, registry, reviewBatchService } = await getServices();

    const project = config.projects[projectId as string];
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
    }

    const prs = await reviewBatchService.listOpenPRs(projectId as string);
    const scm = getSCM(registry, project);

    // Enrich each PR with CI summary and size
    const enriched = await Promise.all(
      prs.map(async (pr) => {
        let ciStatus = "none";
        let additions = 0;
        let deletions = 0;

        if (scm) {
          try {
            ciStatus = await scm.getCISummary(pr);
          } catch {
            ciStatus = "none";
          }
          try {
            if (scm.getPRSummary) {
              const summary = await scm.getPRSummary(pr);
              additions = summary.additions;
              deletions = summary.deletions;
            }
          } catch {
            // ignore
          }
        }

        return {
          number: pr.number,
          title: pr.title,
          url: pr.url,
          branch: pr.branch,
          ciStatus,
          additions,
          deletions,
        };
      }),
    );

    return NextResponse.json({ prs: enriched });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list open PRs" },
      { status: 500 },
    );
  }
}

/** POST /api/review-prs — Create a review batch */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectErr = validateIdentifier(body.projectId, "projectId");
  if (projectErr) {
    return NextResponse.json({ error: projectErr }, { status: 400 });
  }

  if (!Array.isArray(body.prNumbers) || body.prNumbers.length === 0) {
    return NextResponse.json({ error: "prNumbers must be a non-empty array" }, { status: 400 });
  }

  const prNumbers = (body.prNumbers as unknown[]).map(Number).filter((n) => !isNaN(n));
  if (prNumbers.length === 0) {
    return NextResponse.json({ error: "prNumbers must contain valid numbers" }, { status: 400 });
  }

  const projectId = body.projectId as string;
  const autoFix = body.autoFix !== false; // default true

  try {
    const { config, reviewBatchService } = await getServices();

    const project = config.projects[projectId];
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
    }

    const batch = await reviewBatchService.create(projectId, prNumbers, autoFix);
    return NextResponse.json({ batch }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create review batch" },
      { status: 500 },
    );
  }
}
