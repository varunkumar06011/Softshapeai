PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS local_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS outlet (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  restaurant_code TEXT,
  gstin TEXT,
  address TEXT,
  phone TEXT,
  prices_include_gst INTEGER NOT NULL DEFAULT 0,
  gst_category TEXT NOT NULL DEFAULT 'NON_AC',
  gst_rate REAL,
  gst_registered INTEGER NOT NULL DEFAULT 1,
  service_charge_percent REAL NOT NULL DEFAULT 0,
  printer_config TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY NOT NULL,
  restaurant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  pin_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS local_device (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS category (
  id TEXT PRIMARY KEY NOT NULL,
  restaurant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  printer_target TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_item (
  id TEXT PRIMARY KEY NOT NULL,
  restaurant_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  base_price REAL NOT NULL DEFAULT 0,
  menu_type TEXT NOT NULL DEFAULT 'FOOD',
  printer_target TEXT,
  printer_name TEXT,
  gst_enabled INTEGER NOT NULL DEFAULT 1,
  is_available INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_item_variant (
  id TEXT PRIMARY KEY NOT NULL,
  restaurant_id TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_available INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_item_addon (
  id TEXT PRIMARY KEY NOT NULL,
  restaurant_id TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  is_available INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS venue (
  id TEXT PRIMARY KEY NOT NULL,
  restaurant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  venue_type TEXT NOT NULL DEFAULT 'DINE_IN',
  price_profile_id TEXT,
  tax_profile_id TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS section (
  id TEXT PRIMARY KEY NOT NULL,
  restaurant_id TEXT NOT NULL,
  venue_id TEXT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "table" (
  id TEXT PRIMARY KEY NOT NULL,
  restaurant_id TEXT NOT NULL,
  section_id TEXT,
  number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  guests INTEGER NOT NULL DEFAULT 0,
  current_bill REAL NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_record (
  id TEXT PRIMARY KEY NOT NULL,
  restaurant_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  platform TEXT NOT NULL DEFAULT 'DINE_IN',
  total_amount REAL NOT NULL DEFAULT 0,
  discount_percent REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  service_charge_amount REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  round_off REAL NOT NULL DEFAULT 0,
  bill_number TEXT,
  transaction_number TEXT,
  payment_method TEXT,
  cash_amount REAL NOT NULL DEFAULT 0,
  card_amount REAL NOT NULL DEFAULT 0,
  upi_amount REAL NOT NULL DEFAULT 0,
  other_amount REAL NOT NULL DEFAULT 0,
  tip_amount REAL NOT NULL DEFAULT 0,
  paid_at INTEGER,
  billing_requested INTEGER NOT NULL DEFAULT 0,
  captain_id TEXT,
  created_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  last_request_id TEXT UNIQUE,
  cloud_synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_item (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  notes TEXT,
  menu_type TEXT NOT NULL DEFAULT 'FOOD',
  gst_enabled INTEGER NOT NULL DEFAULT 1,
  cancelled_quantity INTEGER NOT NULL DEFAULT 0,
  removed_from_bill INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  cloud_synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kot (
  id TEXT PRIMARY KEY NOT NULL,
  restaurant_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  kot_number INTEGER NOT NULL,
  counter_date TEXT NOT NULL,
  captain_id TEXT,
  created_at INTEGER NOT NULL,
  cloud_synced INTEGER NOT NULL DEFAULT 0,
  UNIQUE(restaurant_id, kot_number, counter_date)
);

CREATE TABLE IF NOT EXISTS kot_item (
  id TEXT PRIMARY KEY NOT NULL,
  kot_id TEXT NOT NULL,
  order_item_id TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  notes TEXT,
  printer_name TEXT,
  status TEXT NOT NULL DEFAULT 'SENT',
  created_at INTEGER NOT NULL,
  cloud_synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_counter (
  id TEXT PRIMARY KEY NOT NULL,
  restaurant_id TEXT NOT NULL,
  counter_date TEXT NOT NULL,
  kot_count INTEGER NOT NULL DEFAULT 0,
  bill_count INTEGER NOT NULL DEFAULT 0,
  txn_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(restaurant_id, counter_date)
);

CREATE TABLE IF NOT EXISTS print_job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  restaurant_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  kot_id TEXT,
  type TEXT NOT NULL,
  target_printer TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  printed_at INTEGER
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_id TEXT,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  synced_at INTEGER,
  last_attempt_at INTEGER,
  next_attempt_at INTEGER,
  dead_lettered INTEGER NOT NULL DEFAULT 0,
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS command_log (
  restaurant_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL,
  response_json TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (restaurant_id, request_id, command_type)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_category ON menu_item(category_id, is_available, is_deleted);
CREATE INDEX IF NOT EXISTS idx_table_restaurant_status ON "table"(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_order_table_status ON order_record(table_id, status);
CREATE INDEX IF NOT EXISTS idx_order_unsynced ON order_record(cloud_synced, updated_at);
CREATE INDEX IF NOT EXISTS idx_kot_order ON kot(order_id);
CREATE INDEX IF NOT EXISTS idx_print_job_pending ON print_job(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_ready ON sync_queue(status, dead_lettered, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_command_log_entity ON command_log(restaurant_id, entity_id);

