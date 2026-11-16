# fourshub

The shop system for 4 Seasons Shoes: products, sizes, stock in every shop and the warehouse,
transfers between shops, and a personal login for every employee. It replaces Odoo step by step.

Built with Next.js 15 and PostgreSQL (no ORM: plain SQL in `db/schema.sql`).

## What is in version 1

- **Logins**: every employee has their own username and password. Roles (owner, manager,
  shop staff, warehouse staff) come with a default set of permissions that can be ticked on or off per person.
- **Products**: one shoe model with one Size, one Colour and one Material per item, a barcode per size,
  and a size grid showing how many pairs of each size are in each shop and the warehouse.
- **Stock**: pairs per variant per location. The storage box number is a field on the stock row,
  not a variant. Every change is logged in `stock_moves` with who made it.
- **New products in one step**: name, price, colours and a size range (presets like "Women 36–40"),
  with starting pairs per colour and size. Every size gets its own EAN-13 barcode (200… in-store range).
  Missing sizes or a new colour can be added to an existing product the same way.
- **Transfers**: scan the pairs to send, the sending shop's stock goes down, the receiving shop
  confirms and its stock goes up.
- **Working hours**: clock in / clock out from the home page. Managers see everyone's monthly hours,
  correct or add entries (a reason is required and every correction is kept), and download the monthly
  "registro de jornada" as CSV.
- **Locations**: Gracia, Jaume I, Placidia, Shop 4 (opening Nov 2026) and the warehouse.

## Running it

```bash
cp .env.example .env          # set DATABASE_URL and the first admin password
npm install
npm run db:migrate            # create the tables
npm run db:seed               # shops, warehouse, first admin account
npm run dev                   # http://localhost:3000
```

## Loading data from Odoo

The data comes from an Odoo.sh backup (`*_exact_fs.zip`, which contains `dump.sql`). The product
and stock tables are cut out of `dump.sql` into one TSV file per table (PostgreSQL COPY format,
first line = column names) and put in `odoo-data/tsv/` (ignored by git). Tables needed:
`product_template`, `product_product`, `product_attribute`, `product_attribute_value`,
`product_template_attribute_value`, `product_variant_combination`, `product_category`, `stock_quant`.

```bash
npm run mapping:build -- odoo-data/tsv           # writes mapping/attributes.csv
# review mapping/attributes.csv: the "becomes" column is what each Odoo value turns into
npm run import:odoo -- odoo-data/tsv --replace   # wipes products/stock and loads them again
```

`mapping/attributes.csv` is the approved list of how Odoo's messy attributes (SIZES / Size / sizes...,
Color / Colore..., Material / Matreial..., Box) become one clean Size, Colour, Material and box number.
Edit the `becomes` column and re-run the import to change a value.
Odoo stock locations are mapped in `scripts/import-odoo.mjs` (`LOCATION_MAP`).

## Shopify (www.fours.es)

The **Shopify** page (owner only) compares fourshub with the online shop and lists what differs. The
comparison only reads. The online shop sells the **total** of all shops and the warehouse, and Shopify keeps
that total at its "Fours Shoes" location, so totals are compared. Items match by **SKU** (Odoo's variant code, `4SSxxxxx`,
which is also the SKU in Shopify); `variants.sku` is filled by the Odoo import.

Access is an app made in the Shopify **Dev Dashboard** (dev.shopify.com), installed on the store. It
swaps its client id and secret for a token that lasts 24 hours. Set these in Vercel
(Settings → Environment Variables, Production and Preview) and redeploy:

| Variable | Value |
| --- | --- |
| `SHOPIFY_STORE` | the store's own address, `4ea349.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | from the app in the Dev Dashboard |
| `SHOPIFY_CLIENT_SECRET` | from the app in the Dev Dashboard (secret) |

The app needs the read scopes `read_products`, `read_inventory` and `read_locations`.
Shopify locations are linked to shops in `src/lib/shopifyCompare.ts` (`SHOPIFY_LOCATIONS`):
Fours Shoes = Gracia, Fours Jaume = Jaume I, Fours Galla Placidia = Placidia, Warehouse = warehouse.

### Sending stock to Shopify (off by default)

The same page can make Shopify's stock equal fourshub's: each item gets the total at "Fours Shoes" and 0 at
the other Shopify locations. It needs the extra scope `write_inventory` (a new app version in the Dev Dashboard,
approved on the store) and `SHOPIFY_SYNC=on` in Vercel. Leave it off until fourshub's stock is current,
because the numbers replace Shopify's. Shopify only writes an item if its stock is still what was read
(`changeFromQuantity`), so an online sale in between is never overwritten. Items without a SKU, with a SKU used
twice, or not counted by Shopify are skipped. Start with the "how many items" box set to a small number.

### Online orders into fourshub (off by default)

The **Online orders** section on the Shopify page takes the pairs of Shopify orders out of fourshub's stock:
from the **warehouse first**, then from the shop with the most pairs of that item (ties by location code).
Stock never goes below zero: pairs no location has are reported as "not found in any location".
A cancelled order, or a returned pair, puts the pairs back where they came from. Every order is applied once
(`online_orders`, `online_order_lines`); each stock change is logged in `stock_moves`.

It needs the read scope `read_orders` (a new app version in the Dev Dashboard, approved on the store) and:

| Variable | Value |
| --- | --- |
| `SHOPIFY_ORDERS_FROM` | the day you stop using Odoo, like `2026-12-01`. Orders before it are ignored: Odoo already counted them (or, for older online orders, never did and the fresh Odoo backup has to be loaded first). |
| `SHOPIFY_ORDERS` | `on` to allow applying. Previewing needs only `SHOPIFY_ORDERS_FROM`. |

Run it from the page (Preview, tick the box, Apply). Do not turn it on while Odoo is still the live system:
a later Odoo import replaces the stock, so applied orders would be counted twice or lost.

## Customers and sales from Odoo

The import page has a second form, **Customers and sales**. It loads, from the same Odoo backup:
- the **named customers** (the walk-in "Simplified Invoice Partner" of Odoo is not one: those tickets have no customer) with their **loyalty points**,
- the shops' **sales history** (tickets, lines and payments) as read-only records. Lines keep the SKU and name as sold, with no link to products, so a new product import never breaks them. Change given back is kept as a negative cash payment, so each ticket's payments add up to its total.

Make both import files from a backup's `dump.sql` (one command, no hidden macOS files):

    node scripts/make-import-files.mjs path/to/dump.sql odoo-files

It writes `odoo-products.tgz` (for "Load products from Odoo") and `odoo-sales.tgz` (for "Customers and sales") into `odoo-files/`. The files hold customer data: git ignores them, keep them off shared drives.

The **Sales** screen (monthly totals per shop, VAT, cash and card, and a CSV per month for the accountant) and the **Customers** screen need the permission `reports.view` (owner always; managers by default).

## The till

The **Till** screen rings up sales in the shop: scan a barcode (or type a name, reference or SKU), set a discount,
attach a customer, take cash and/or card, print the ticket. Prices come from the database, never from the browser.

- **Money:** whole cents, prices include 21% VAT (`src/lib/till.ts`, shared by the screen and the server).
- **Discounts:** quick buttons 5, 10, 15, 20, 30, 40, 50, 70 percent. Above 30% needs a manager: they sign in at the
  till with their own login (permission `discounts.high`), and their id is saved on the ticket.
- **Loyalty ("Fours Loyalty" in Odoo):** a customer earns 0.5 points per euro paid; 100 points take 10 euros off.
  Every change is in `loyalty_moves`.
- **Card:** the customer pays on the separate card terminal and staff record the amount. No terminal link yet.
- **Ticket:** 80 mm, printed through the browser's print dialog. Company name and CIF are Odoo's; set
  `RECEIPT_ADDRESS` (and optionally `RECEIPT_COMPANY`, `RECEIPT_NIF`) in Vercel to change what prints.
- **Ticket numbers:** one run per shop and year, `GRA/2026/000001`, handed out inside the sale's transaction.
  Confirm with the accountant that this series suits the simplified invoices.
- **A sale** is saved in one transaction: ticket, lines, payments, the pairs leaving that shop's stock (never below
  zero; if the system had fewer pairs than were sold the screen says so), and the loyalty points. A double click never
  sells twice (`till_ref`). The ticket as printed is kept in `sales.receipt` for reprints.

**Practice mode.** The till only saves when `TILL_LIVE=on` in Vercel. Without it, everything works and tickets print
marked PRACTICE, but nothing is written. Turn it on the day the shops stop using Odoo.

**After it is live**, loading products or the Odoo sales history again is blocked, because it would delete real sales.

Not built yet: refunds and exchanges, reprinting an old ticket, the end-of-day cash count, gift cards,
the card terminal link, direct thermal-printer drivers.

Permissions: `till.use` (shop staff and managers by default), `discounts.high` (managers by default).
