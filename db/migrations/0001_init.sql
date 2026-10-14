-- MONETA · Esquema inicial.
-- Reglas del modelo:
--  * El dinero se guarda como INTEGER en la unidad mínima (COP: 1 peso). Nunca REAL.
--  * Los saldos NO se almacenan: se derivan del saldo inicial + movimientos confirmados.
--  * Toda fila de `transactions`/`transfers` es un movimiento CONFIRMADO (fecha <= hoy, validado en servicio).
--    Los pagos futuros viven en `recurring_rules` (previstos) y no afectan saldos hasta registrarse.
--  * Las transferencias y los aportes a metas NO son ingresos ni gastos.
--  * Eliminar movimientos es lógico (deleted_at) para poder deshacer.

CREATE TABLE accounts (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  type            TEXT NOT NULL CHECK (type IN ('cash','bank','wallet','savings')),
  initial_balance INTEGER NOT NULL DEFAULT 0,
  color           TEXT NOT NULL DEFAULT '#6366F1',
  icon            TEXT NOT NULL DEFAULT 'wallet',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  archived_at     TEXT,
  created_at      TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX ux_accounts_name ON accounts (lower(name)) WHERE archived_at IS NULL;

CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  kind        TEXT NOT NULL CHECK (kind IN ('expense','income')),
  icon        TEXT NOT NULL DEFAULT 'tag',
  color       TEXT NOT NULL DEFAULT '#6366F1',
  essential   INTEGER NOT NULL DEFAULT 0 CHECK (essential IN (0,1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at  TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX ux_categories_name ON categories (kind, lower(name)) WHERE archived_at IS NULL;

CREATE TABLE subcategories (
  id          TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  archived_at TEXT,
  created_at  TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX ux_subcategories_name ON subcategories (category_id, lower(name)) WHERE archived_at IS NULL;

CREATE TABLE recurring_rules (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  kind            TEXT NOT NULL CHECK (kind IN ('expense','income')),
  is_subscription INTEGER NOT NULL DEFAULT 1 CHECK (is_subscription IN (0,1)),
  amount          INTEGER NOT NULL CHECK (amount > 0 AND amount <= 9000000000000),
  frequency       TEXT NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly','bimonthly','quarterly','semiannual','yearly')),
  anchor_date     TEXT NOT NULL CHECK (anchor_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  next_due_date   TEXT NOT NULL CHECK (next_due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  category_id     TEXT NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  account_id      TEXT NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  notes           TEXT,
  archived_at     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
) STRICT;

CREATE TABLE transactions (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL CHECK (type IN ('income','expense')),
  amount            INTEGER NOT NULL CHECK (amount > 0 AND amount <= 9000000000000),
  date              TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  account_id        TEXT NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  category_id       TEXT NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  subcategory_id    TEXT REFERENCES subcategories (id) ON DELETE RESTRICT,
  description       TEXT NOT NULL DEFAULT '',
  payment_method    TEXT,
  merchant          TEXT,
  notes             TEXT,
  is_recurring      INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0,1)),
  recurring_rule_id TEXT REFERENCES recurring_rules (id) ON DELETE RESTRICT,
  occurrence_date   TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT
) STRICT;
CREATE INDEX ix_tx_date ON transactions (date) WHERE deleted_at IS NULL;
CREATE INDEX ix_tx_account ON transactions (account_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_tx_category ON transactions (category_id) WHERE deleted_at IS NULL;
-- Un pago recurrente solo puede registrarse una vez por ocurrencia (evita duplicados).
CREATE UNIQUE INDEX ux_tx_occurrence ON transactions (recurring_rule_id, occurrence_date)
  WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER trg_tx_consistency_ins BEFORE INSERT ON transactions
BEGIN
  SELECT RAISE(ABORT, 'La categoría no corresponde al tipo de movimiento')
    WHERE (SELECT kind FROM categories WHERE id = NEW.category_id) IS NOT NEW.type;
  SELECT RAISE(ABORT, 'La subcategoría no pertenece a la categoría')
    WHERE NEW.subcategory_id IS NOT NULL
      AND (SELECT category_id FROM subcategories WHERE id = NEW.subcategory_id) IS NOT NEW.category_id;
END;
CREATE TRIGGER trg_tx_consistency_upd BEFORE UPDATE ON transactions
BEGIN
  SELECT RAISE(ABORT, 'La categoría no corresponde al tipo de movimiento')
    WHERE (SELECT kind FROM categories WHERE id = NEW.category_id) IS NOT NEW.type;
  SELECT RAISE(ABORT, 'La subcategoría no pertenece a la categoría')
    WHERE NEW.subcategory_id IS NOT NULL
      AND (SELECT category_id FROM subcategories WHERE id = NEW.subcategory_id) IS NOT NEW.category_id;
END;

CREATE TABLE tags (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0)
) STRICT;
CREATE UNIQUE INDEX ux_tags_name ON tags (lower(name));

CREATE TABLE transaction_tags (
  transaction_id TEXT NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  tag_id         TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
) STRICT;

CREATE TABLE transfers (
  id              TEXT PRIMARY KEY,
  from_account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  to_account_id   TEXT NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  amount          INTEGER NOT NULL CHECK (amount > 0 AND amount <= 9000000000000),
  date            TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  description     TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  CHECK (from_account_id <> to_account_id)
) STRICT;
CREATE INDEX ix_transfers_date ON transfers (date) WHERE deleted_at IS NULL;

CREATE TABLE savings_goals (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description   TEXT,
  target_amount INTEGER NOT NULL CHECK (target_amount > 0 AND target_amount <= 9000000000000),
  target_date   TEXT CHECK (target_date IS NULL OR target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  account_id    TEXT REFERENCES accounts (id) ON DELETE RESTRICT,
  color         TEXT NOT NULL DEFAULT '#10B981',
  icon          TEXT NOT NULL DEFAULT 'target',
  archived_at   TEXT,
  created_at    TEXT NOT NULL
) STRICT;

-- Aportes/retiros de metas: asignación virtual de dinero que YA es tuyo.
-- No tocan saldos de cuentas ni cuentan como ingreso/gasto.
CREATE TABLE goal_contributions (
  id         TEXT PRIMARY KEY,
  goal_id    TEXT NOT NULL REFERENCES savings_goals (id) ON DELETE RESTRICT,
  kind       TEXT NOT NULL CHECK (kind IN ('deposit','withdrawal')),
  amount     INTEGER NOT NULL CHECK (amount > 0 AND amount <= 9000000000000),
  date       TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  note       TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX ix_goal_contrib_goal ON goal_contributions (goal_id);

CREATE TRIGGER trg_goal_withdraw_ins BEFORE INSERT ON goal_contributions
  WHEN NEW.kind = 'withdrawal'
BEGIN
  SELECT RAISE(ABORT, 'El retiro supera lo ahorrado en la meta')
    WHERE NEW.amount > COALESCE((SELECT SUM(CASE kind WHEN 'deposit' THEN amount ELSE -amount END)
                                   FROM goal_contributions WHERE goal_id = NEW.goal_id), 0);
END;
CREATE TRIGGER trg_goal_contrib_del BEFORE DELETE ON goal_contributions
  WHEN OLD.kind = 'deposit'
BEGIN
  SELECT RAISE(ABORT, 'No se puede eliminar el aporte: la meta quedaría con saldo negativo')
    WHERE COALESCE((SELECT SUM(CASE kind WHEN 'deposit' THEN amount ELSE -amount END)
                      FROM goal_contributions WHERE goal_id = OLD.goal_id AND id <> OLD.id), 0) < 0;
END;

-- month = 'default' (aplica a todos los meses) o 'YYYY-MM' (sobrescribe ese mes).
CREATE TABLE budgets (
  id          TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  month       TEXT NOT NULL CHECK (month = 'default' OR month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  amount      INTEGER NOT NULL CHECK (amount > 0 AND amount <= 9000000000000),
  UNIQUE (category_id, month)
) STRICT;

CREATE TABLE saved_filters (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  scope      TEXT NOT NULL CHECK (scope IN ('expense','income')),
  filter     TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
