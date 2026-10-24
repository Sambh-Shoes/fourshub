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
