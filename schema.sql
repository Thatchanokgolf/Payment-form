-- =====================================================================
-- Dormitory Rent App — Neon (PostgreSQL) schema
-- Run this once in the Neon SQL Editor (or `psql`) to create the tables.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DATABASE 1: room configuration
-- One row per room: monthly rent + the fixed additional bills.
-- An additional bill is "present" for a room when its value is > 0.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  room_number        TEXT PRIMARY KEY,
  rent               NUMERIC(12,2) NOT NULL DEFAULT 0,
  refrigerator_bill  NUMERIC(12,2) NOT NULL DEFAULT 0,
  microwave_bill     NUMERIC(12,2) NOT NULL DEFAULT 0,
  carpark_bill       NUMERIC(12,2) NOT NULL DEFAULT 0,
  common_fee         NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Up to 4 free-form "other" bills, each annotated with what it is for:
  --   [{"label": "Internet", "amount": 300}, ...]
  other_bills        JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- ---------------------------------------------------------------------
-- DATABASE 3: app users (login)
-- id / password / room number / role (+ a display heading per account).
-- NOTE: passwords here are PLAINTEXT for the demo. For production, store a
-- salted hash (e.g. bcrypt) and verify in the login function instead.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_users (
  user_id      TEXT PRIMARY KEY,
  password     TEXT NOT NULL,
  room_number  TEXT,                       -- NULL for admins; room no. for residents
  role         TEXT NOT NULL DEFAULT 'user', -- 'admin' sees DB1/DB2, 'user' sees only their room
  heading      TEXT NOT NULL DEFAULT ''     -- shown top-left in the nav
);

-- Seed the three demo accounts (safe to re-run).
INSERT INTO app_users (user_id, password, room_number, role, heading) VALUES
  ('Admin', '1234', NULL,   'admin', 'Charal Prasit Management Dashboard'),
  ('201',   '1234', '201',  'user',  'Charal Prasit Lakeview'),
  ('2201',  '1234', '2201', 'user',  'Baan Mae Miw')
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- DATABASE 2: submitted monthly bill records
-- electric_bill = (electric_curr - electric_prev) * 8
-- water_bill    = (water_curr    - water_prev)    * 20
-- Images are stored as base64 data URLs (TEXT).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bill_records (
  id                   SERIAL PRIMARY KEY,
  room_number          TEXT NOT NULL,
  bill_month           TEXT NOT NULL,                 -- e.g. "2026-06"
  rent                 NUMERIC(12,2) NOT NULL DEFAULT 0,

  electric_bill_image  TEXT,                          -- base64 data URL
  electric_prev        NUMERIC(12,2) NOT NULL DEFAULT 0,
  electric_curr        NUMERIC(12,2) NOT NULL DEFAULT 0,
  electric_bill        NUMERIC(12,2) NOT NULL DEFAULT 0,

  water_bill_image     TEXT,                          -- base64 data URL
  water_prev           NUMERIC(12,2) NOT NULL DEFAULT 0,
  water_curr           NUMERIC(12,2) NOT NULL DEFAULT 0,
  water_bill           NUMERIC(12,2) NOT NULL DEFAULT 0,

  refrigerator_bill    NUMERIC(12,2) NOT NULL DEFAULT 0,
  microwave_bill       NUMERIC(12,2) NOT NULL DEFAULT 0,
  carpark_bill         NUMERIC(12,2) NOT NULL DEFAULT 0,
  common_fee           NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_bills          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- snapshot of [{label, amount}]

  bank_slip_image      TEXT,                          -- base64 data URL
  total                NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Speeds up "find the previous month's meter reading for this room".
CREATE INDEX IF NOT EXISTS idx_bill_records_room_created
  ON bill_records (room_number, created_at DESC);

-- Optional sample rooms (uncomment to seed):
-- INSERT INTO rooms (room_number, rent, refrigerator_bill, microwave_bill, carpark_bill, common_fee, other_bills)
-- VALUES ('101', 3000, 50, 30, 200, 150, '[{"label":"Internet","amount":300}]'::jsonb),
--        ('102', 3200, 0, 0, 0, 150, '[]'::jsonb)
-- ON CONFLICT (room_number) DO NOTHING;

-- ---------------------------------------------------------------------
-- Migration helpers — run these instead if the tables already exist
-- with the old single `other_bill` column:
-- ---------------------------------------------------------------------
-- ALTER TABLE rooms        ADD COLUMN IF NOT EXISTS common_fee  NUMERIC(12,2) NOT NULL DEFAULT 0;
-- ALTER TABLE rooms        ADD COLUMN IF NOT EXISTS other_bills JSONB NOT NULL DEFAULT '[]'::jsonb;
-- ALTER TABLE rooms        DROP COLUMN IF EXISTS other_bill;
-- ALTER TABLE bill_records ADD COLUMN IF NOT EXISTS common_fee  NUMERIC(12,2) NOT NULL DEFAULT 0;
-- ALTER TABLE bill_records ADD COLUMN IF NOT EXISTS other_bills JSONB NOT NULL DEFAULT '[]'::jsonb;
-- ALTER TABLE bill_records DROP COLUMN IF EXISTS other_bill;
