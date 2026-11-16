import { getUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/** A shoe picture by Odoo product id. Only for signed-in people. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response("Sign in first", { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const rows = await query<{ mime: string; data: Buffer }>("SELECT mime, data FROM product_images WHERE odoo_id = $1", [id]);
  if (!rows[0]) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(rows[0].data), {
    headers: { "Content-Type": rows[0].mime, "Cache-Control": "private, max-age=86400" },
  });
}
