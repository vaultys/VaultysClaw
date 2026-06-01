/**
 * Template for a new control-plane API route.
 * Replace <Resource>, <resource>, and <TABLE> with your resource name.
 *
 * Collection route: app/api/<resource>/route.ts
 * Item route:       app/api/<resource>/[id]/route.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

// ─── Collection: GET (list) ─────────────────────────────────────────────────

/**
 * GET /api/<resource>
 * Query params: page, pageSize, q (search)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? undefined;
    const page = Math.max(
      1,
      parseInt(searchParams.get("page") ?? "1", 10) || 1
    );
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20)
    );
    const offset = (page - 1) * pageSize;

    const db = getDb();

    const whereClause = q ? "WHERE name LIKE ?" : "";
    const params = q ? [`%${q}%`, pageSize, offset] : [pageSize, offset];

    const rows = db
      .prepare(
        `SELECT * FROM <TABLE> ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params);

    const { total } = db
      .prepare(`SELECT COUNT(*) as total FROM <TABLE> ${whereClause}`)
      .get(...(q ? [`%${q}%`] : [])) as { total: number };

    return NextResponse.json({
      items: rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.error("GET /api/<resource> error:", err);
    return NextResponse.json(
      { error: "Failed to fetch <resource>s" },
      { status: 500 }
    );
  }
}

// ─── Collection: POST (create) ──────────────────────────────────────────────

/**
 * POST /api/<resource>
 * Body: { name: string, ... }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();
    // Restrict creation to admins if needed:
    // if (!auth.isGlobalAdmin) return forbidden();

    const body = (await request.json()) as { name?: string };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const db = getDb();
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO <TABLE> (id, name, created_by, created_at) VALUES (?, ?, ?, datetime('now'))"
    ).run(id, body.name.trim(), auth.did);

    const created = db.prepare("SELECT * FROM <TABLE> WHERE id = ?").get(id);
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    console.error("POST /api/<resource> error:", err);
    return NextResponse.json(
      { error: "Failed to create <resource>" },
      { status: 500 }
    );
  }
}

// ─── Item: GET (detail) — use in [id]/route.ts ─────────────────────────────

type Params = { id: string };

/**
 * GET /api/<resource>/[id]
 */
export async function GET_ITEM(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await params;
    const db = getDb();
    const item = db.prepare("SELECT * FROM <TABLE> WHERE id = ?").get(id);
    if (!item)
      return NextResponse.json(
        { error: "<Resource> not found" },
        { status: 404 }
      );

    return NextResponse.json({ item });
  } catch (err) {
    console.error("GET /api/<resource>/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch <resource>" },
      { status: 500 }
    );
  }
}

// ─── Item: DELETE — use in [id]/route.ts ────────────────────────────────────

/**
 * DELETE /api/<resource>/[id]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await params;
    const db = getDb();
    const result = db.prepare("DELETE FROM <TABLE> WHERE id = ?").run(id);
    if (result.changes === 0)
      return NextResponse.json(
        { error: "<Resource> not found" },
        { status: 404 }
      );

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/<resource>/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete <resource>" },
      { status: 500 }
    );
  }
}
