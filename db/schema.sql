-- fourshub database schema. Safe to run more than once.

CREATE TABLE IF NOT EXISTS locations (
  id         serial PRIMARY KEY,
  code       text NOT NULL UNIQUE,          -- short code shown on screens, e.g. GRA
  name       text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('shop', 'warehouse')),
  active     boolean NOT NULL DEFAULT true,
  sort       int NOT NULL DEFAULT 0,
  odoo_id    int UNIQUE                     -- stock.location id in Odoo
);

CREATE TABLE IF NOT EXISTS users (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'manager', 'shop', 'warehouse')),
  permissions   text[] NOT NULL DEFAULT '{}',
  location_id   int REFERENCES locations(id),   -- home shop or warehouse
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      text PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id       serial PRIMARY KEY,
  name     text NOT NULL,
  odoo_id  int UNIQUE
);

-- A product is one shoe model (what Odoo calls a product template).
CREATE TABLE IF NOT EXISTS products (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  reference   text,                          -- supplier / internal model reference
  category_id int REFERENCES categories(id),
  material    text,
  price       numeric(10,2) NOT NULL DEFAULT 0,   -- sale price incl. VAT, EUR
  cost        numeric(10,2),
  active      boolean NOT NULL DEFAULT true,
  odoo_id     int UNIQUE,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- A variant is one sellable item: model + colour + size, with its own barcode.
CREATE TABLE IF NOT EXISTS variants (
  id          serial PRIMARY KEY,
  product_id  int NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size        text,
  colour      text,
  barcode     text UNIQUE,
  price       numeric(10,2),                 -- only when different from the product price
  active      boolean NOT NULL DEFAULT true,
  odoo_id     int UNIQUE
);
CREATE INDEX IF NOT EXISTS variants_product_idx ON variants(product_id);

-- Extra barcodes that also find a variant (e.g. old labels from Odoo duplicates).
CREATE TABLE IF NOT EXISTS barcode_aliases (
  barcode    text PRIMARY KEY,
  variant_id int NOT NULL REFERENCES variants(id) ON DELETE CASCADE
);

-- How many pairs of each variant are in each location, and which box they are in.
CREATE TABLE IF NOT EXISTS stock (
  variant_id  int NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  location_id int NOT NULL REFERENCES locations(id),
  qty         int NOT NULL DEFAULT 0,
  box         text,
  PRIMARY KEY (variant_id, location_id)
);

-- Every stock change is logged here, so nothing moves without a trace.
CREATE TABLE IF NOT EXISTS stock_moves (
  id            bigserial PRIMARY KEY,
  variant_id    int NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  from_location int REFERENCES locations(id),
  to_location   int REFERENCES locations(id),
  qty           int NOT NULL,
  reason        text NOT NULL,               -- import, adjust, transfer
  transfer_id   int,
  user_id       int REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transfers (
  id            serial PRIMARY KEY,
  from_location int NOT NULL REFERENCES locations(id),
  to_location   int NOT NULL REFERENCES locations(id),
  status        text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'received', 'cancelled')),
  note          text,
  created_by    int REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  received_by   int REFERENCES users(id),
  received_at   timestamptz
);

CREATE TABLE IF NOT EXISTS transfer_lines (
  transfer_id int NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  variant_id  int NOT NULL REFERENCES variants(id),
  qty         int NOT NULL CHECK (qty > 0),
  PRIMARY KEY (transfer_id, variant_id)
);

-- Working hours: every clock-in / clock-out (Spain requires a daily record, kept 4 years).
CREATE TABLE IF NOT EXISTS time_entries (
  id          serial PRIMARY KEY,
  user_id     int NOT NULL REFERENCES users(id),
  location_id int REFERENCES locations(id),
  clock_in    timestamptz NOT NULL,
  clock_out   timestamptz CHECK (clock_out IS NULL OR clock_out > clock_in),
  created_by  int REFERENCES users(id),        -- someone else when a manager added it by hand
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS time_entries_user_idx ON time_entries(user_id, clock_in);
-- Only one open entry (clocked in, not out) per person.
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_open_idx ON time_entries(user_id) WHERE clock_out IS NULL;

-- Corrections are never silent: the old and new times, who changed them and why.
CREATE TABLE IF NOT EXISTS time_entry_changes (
  id         serial PRIMARY KEY,
  entry_id   int NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  old_in     timestamptz,
  old_out    timestamptz,
  new_in     timestamptz,
  new_out    timestamptz,
  reason     text NOT NULL,
  changed_by int NOT NULL REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_hours numeric(4,1);

-- The SKU is Odoo's variant code (4SSxxxxx). Shopify uses the same value as the variant SKU,
-- so it is the key that matches a fourshub variant to a Shopify variant.
ALTER TABLE variants ADD COLUMN IF NOT EXISTS sku text;
CREATE INDEX IF NOT EXISTS variants_sku_idx ON variants(sku);

-- Online orders from Shopify that have taken pairs out of stock. One row per order, so an order is never
-- applied twice; a later change to the order (cancelled, a pair refunded) returns pairs from the same places.
CREATE TABLE IF NOT EXISTS online_orders (
  shopify_id  text PRIMARY KEY,
  name        text NOT NULL,                  -- the number shown to the customer, e.g. #FOURS1041
  created_at  timestamptz NOT NULL,
  cancelled   boolean NOT NULL DEFAULT false,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS online_order_lines (
  shopify_line_id text PRIMARY KEY,
  order_id        text NOT NULL REFERENCES online_orders(shopify_id) ON DELETE CASCADE,
  sku             text NOT NULL,               -- matched to variants.sku when applied (no link, so a re-import never fails)
  qty             int NOT NULL,                -- pairs the order needs now
  taken           jsonb NOT NULL DEFAULT '[]', -- [["ALM",1],["JAU",2]]: where the pairs came from, in order
  missing         int NOT NULL DEFAULT 0       -- pairs no location had when the order was applied
);

-- Customers with a name (the walk-in "Simplified Invoice Partner" of Odoo is not one: those sales have no customer).
CREATE TABLE IF NOT EXISTS customers (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  email      text,
  phone      text,
  street     text,
  zip        text,
  city       text,
  vat        text,
  points     numeric(10,2) NOT NULL DEFAULT 0,   -- loyalty points ("Fours Loyalty")
  active     boolean NOT NULL DEFAULT true,
  odoo_id    int UNIQUE
);

-- Sales history from the shops (read-only records). Lines carry the SKU and name as sold, with no link to
-- variants, so a new product import never breaks them.
CREATE TABLE IF NOT EXISTS sales (
  id          serial PRIMARY KEY,
  odoo_id     int UNIQUE,
  number      text NOT NULL,                     -- ticket number, e.g. Shop/0251
  reference   text,                              -- POS reference, e.g. Order 00032-001-0001
  location_id int REFERENCES locations(id),
  customer_id int REFERENCES customers(id),
  cashier     text,
  sold_at     timestamptz NOT NULL,
  total       numeric(10,2) NOT NULL,            -- incl. VAT, EUR (negative for a refund)
  tax         numeric(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sales_sold_at_idx ON sales(sold_at);
CREATE INDEX IF NOT EXISTS sales_customer_idx ON sales(customer_id);

CREATE TABLE IF NOT EXISTS sale_lines (
  id         serial PRIMARY KEY,
  sale_id    int NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  sku        text,
  name       text NOT NULL,
  qty        numeric(10,2) NOT NULL,             -- negative for a returned pair
  unit_price numeric(10,2) NOT NULL,
  discount   numeric(5,2) NOT NULL DEFAULT 0,    -- percent
  total      numeric(10,2) NOT NULL,             -- incl. VAT
  cost       numeric(10,2)
);
CREATE INDEX IF NOT EXISTS sale_lines_sale_idx ON sale_lines(sale_id);
CREATE INDEX IF NOT EXISTS sale_lines_sku_idx ON sale_lines(sku);

CREATE TABLE IF NOT EXISTS sale_payments (
  id      serial PRIMARY KEY,
  sale_id int NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method  text NOT NULL,                         -- cash or card
  amount  numeric(10,2) NOT NULL,
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS sale_payments_sale_idx ON sale_payments(sale_id);
