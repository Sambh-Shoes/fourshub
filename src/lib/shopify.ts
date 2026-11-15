// Reads the Shopify store (www.fours.es). Read-only for now: nothing here changes anything in Shopify.
//
// Shopify now gives access through an app made in the Shopify Dev Dashboard. The app swaps its
// client id and client secret for an access token that lasts 24 hours ("client credentials grant").
// Settings live in Vercel environment variables:
//   SHOPIFY_STORE          the store's own address, like 4ea349.myshopify.com
//   SHOPIFY_CLIENT_ID      from the app in the Dev Dashboard
//   SHOPIFY_CLIENT_SECRET  from the app in the Dev Dashboard (keep it secret)

const API_VERSION = "2026-10";

export type ShopifyConfig = { store: string; clientId: string; clientSecret: string };

export type ShopifyVariant = {
  id: string;
  sku: string | null;
  title: string;
  barcode: string | null;
  productTitle: string;
  status: string; // ACTIVE, DRAFT or ARCHIVED
  tracked: boolean;
  stock: Record<string, number>; // Shopify location name -> pairs available
};

export function shopifyConfig(env: Record<string, string | undefined> = process.env): ShopifyConfig | null {
  const store = env.SHOPIFY_STORE?.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const clientId = env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!store || !clientId || !clientSecret) return null;
  return { store, clientId, clientSecret };
}

const globalForToken = globalThis as unknown as { shopifyToken?: { token: string; expiresAt: number } };

async function getToken(cfg: ShopifyConfig) {
  const cached = globalForToken.shopifyToken;
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
  const res = await fetch(`https://${cfg.store}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: cfg.clientId, client_secret: cfg.clientSecret }),
  });
  if (!res.ok) {
    throw new Error(`Shopify did not give a token (${res.status}). Check SHOPIFY_STORE, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, and that the app is installed on the store.`);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  globalForToken.shopifyToken = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

async function gql<T>(cfg: ShopifyConfig, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://${cfg.store}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await getToken(cfg) },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify answered ${res.status}.`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(`Shopify: ${body.errors.map((e) => e.message).join("; ")}`);
  return body.data as T;
}

// One bulk job reads every variant with its barcode, product and stock per location,
// without hitting Shopify's request limits.
const BULK_QUERY = `{
  productVariants {
    edges { node {
      id sku title
      barcodes { edges { node { value } } }
      product { id title status }
      inventoryItem { id tracked
        inventoryLevels { edges { node { id location { id name } quantities(names: ["available"]) { name quantity } } } }
      }
    } }
  }
}`;

type BulkLine = {
  id?: string;
  __parentId?: string;
  sku?: string | null;
  title?: string;
  value?: string;
  product?: { title?: string; status?: string };
  inventoryItem?: { id?: string; tracked?: boolean };
  location?: { name?: string };
  quantities?: { name: string; quantity: number }[];
};

/** Turns the bulk job's result (one JSON object per line, children point at their parent) into variants. */
export function parseBulkJsonl(text: string): ShopifyVariant[] {
  const variants = new Map<string, ShopifyVariant>();
  const byItem = new Map<string, string>(); // inventory item id -> variant id
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    const line = JSON.parse(raw) as BulkLine;
    if (!line.__parentId) {
      if (!line.id?.includes("/ProductVariant/")) continue;
      variants.set(line.id, {
        id: line.id,
        sku: line.sku?.trim() || null,
        title: line.title ?? "",
        barcode: null,
        productTitle: line.product?.title ?? "",
        status: line.product?.status ?? "",
        tracked: line.inventoryItem?.tracked ?? false,
        stock: {},
      });
      if (line.inventoryItem?.id) byItem.set(line.inventoryItem.id, line.id);
      continue;
    }
    const variant = variants.get(line.__parentId) ?? variants.get(byItem.get(line.__parentId) ?? "");
    if (!variant) continue;
    if (line.location?.name) {
      const available = line.quantities?.find((q) => q.name === "available")?.quantity ?? 0;
      variant.stock[line.location.name] = available;
    } else if (line.value && !variant.barcode) {
      variant.barcode = line.value;
    }
  }
  return [...variants.values()];
}

export async function fetchShopifyVariants(cfg: ShopifyConfig, timeoutMs = 180_000): Promise<ShopifyVariant[]> {
  const started = await gql<{
    bulkOperationRunQuery: { bulkOperation: { id: string } | null; userErrors: { message: string }[] };
  }>(
    cfg,
    `mutation($q: String!) { bulkOperationRunQuery(query: $q, groupObjects: false) { bulkOperation { id status } userErrors { message } } }`,
    { q: BULK_QUERY },
  );
  const { bulkOperation, userErrors } = started.bulkOperationRunQuery;
  if (!bulkOperation) {
    throw new Error(`Shopify could not start the export: ${userErrors.map((e) => e.message).join("; ") || "unknown reason"}. If another export is running, try again in a minute.`);
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const { bulkOperation: op } = await gql<{
      bulkOperation: { status: string; errorCode: string | null; url: string | null } | null;
    }>(cfg, `query($id: ID!) { bulkOperation(id: $id) { status errorCode url } }`, { id: bulkOperation.id });
    if (!op) throw new Error("Shopify lost track of the export.");
    if (op.status === "COMPLETED") {
      if (!op.url) return []; // nothing in the store
      const file = await fetch(op.url);
      if (!file.ok) throw new Error(`Could not download the export (${file.status}).`);
      return parseBulkJsonl(await file.text());
    }
    if (["FAILED", "CANCELED", "EXPIRED"].includes(op.status)) {
      throw new Error(`The Shopify export ${op.status.toLowerCase()}${op.errorCode ? ` (${op.errorCode})` : ""}.`);
    }
  }
  throw new Error("The Shopify export is taking too long. Try again in a minute.");
}
