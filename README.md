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
