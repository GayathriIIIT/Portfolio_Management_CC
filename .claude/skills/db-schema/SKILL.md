---
name: db-schema
description: Check and sync the local MySQL database schema with what the Flask app requires. Use when asked to inspect the current DB schema, compare the database to the application's models, or generate and run ALTER TABLE / CREATE TABLE / DROP / migration SQL against the local MySQL database.
---

# Database schema check & sync (MySQL)

This repo is a Flask app (Flask-SQLAlchemy models in `backend/app/models/`) backed by a local MySQL database. The canonical DDL lives in `database/schema.sql`. When schema and code drift apart, agents must detect the drift and migrate the database.

The MySQL client is NOT on `PATH`; use the one bundled with MySQL Workbench:

```powershell
$MYSQL = "C:\Program Files\MySQL\MySQL Workbench 8.0\mysql.exe"
```

## Connection setup (run once per session)

Credentials come from `backend/.env` (`DATABASE_URL`), e.g. `mysql+pymysql://user:pass@host:port/dbname`. Never hardcode credentials. Parse them and keep them in variables:

```powershell
$line = (Select-String -Path backend\.env -Pattern '^\s*DATABASE_URL\s*=\s*(.+)$').Matches.Groups[1].Value.Trim()
$m = [regex]::Match($line, '^mysql\+pymysql://([^:@]+):([^@]*)@([^:]+)(?::(\d+))?/([^?]+)')
$DB_USER = $m.Groups[1].Value
$DB_PASS = $m.Groups[2].Value
$DB_HOST = $m.Groups[3].Value
$DB_PORT = if ($m.Groups[4].Value) { $m.Groups[4].Value } else { "3306" }
$DB_NAME = $m.Groups[5].Value
$MYSQL   = "C:\Program Files\MySQL\MySQL Workbench 8.0\mysql.exe"
$env:MYSQL_PWD = $DB_PASS   # avoids the "password on command line" warning
```

Always clear it when done: `Remove-Item Env:MYSQL_PWD`.

## Step 1 — Check the CURRENT database schema

Run these read-only queries against the live MySQL. This step is safe and never modifies anything.

```powershell
# confirm connectivity + list databases
& $MYSQL -h $DB_HOST -P $DB_PORT -u $DB_USER -e "SHOW DATABASES;"

# list tables in the app's database
& $MYSQL -h $DB_HOST -P $DB_PORT -u $DB_USER -e "SHOW TABLES;" $DB_NAME

# full DDL (columns, types, PK, FKs, indexes) for one table
& $MYSQL -h $DB_HOST -P $DB_PORT -u $DB_USER -e "SHOW CREATE TABLE portfolio\G" $DB_NAME

# quick column list for one table
& $MYSQL -h $DB_HOST -P $DB_PORT -u $DB_USER -e "SHOW COLUMNS FROM portfolio;" $DB_NAME

# every column in the whole schema (best for diffing against the models)
& $MYSQL -h $DB_HOST -P $DB_PORT -u $DB_USER -N -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$DB_NAME' ORDER BY TABLE_NAME, ORDINAL_POSITION;" $DB_NAME
```

## Step 2 — Determine what the APPLICATION requires

The code is the source of truth for what the schema must provide:

- `backend/app/models/*.py` — one Flask-SQLAlchemy model per table. `__tablename__` is the table name; each `db.Column` has name, type, `nullable`, `default`, `unique`, and `db.ForeignKey`/`db.CheckConstraint`/`db.UniqueConstraint`/indexes via `__table_args__`.
- `database/schema.sql` — the canonical DDL (7 tables: `portfolio`, `security`, `security_holding`, `portfolio_transaction`, `market_price`, `whatif_price`, `wallet`). Keep it in sync with any change.

For each model, list its required columns, then compare against the live `information_schema` output. Report every mismatch:
- table exists in models but missing in MySQL → `CREATE TABLE` needed;
- table exists in MySQL but has no model → probably stale/legacy;
- column missing in MySQL → `ALTER TABLE ... ADD COLUMN`;
- column missing in the model → decide whether to drop or to add it to the model;
- type differs (e.g. `VARCHAR(3)` vs `CHAR(3)`, `DATETIME` vs `TIMESTAMP`, `NUMERIC(18,4)` vs `DECIMAL(18,4)`) → `ALTER TABLE ... MODIFY COLUMN`;
- nullability differs → `MODIFY COLUMN` with/without `NOT NULL`.

## Step 3 — Generate and RUN the migration

Write the migration as a `.sql` file (e.g. `database/migrations/YYYYMMDD_short_description.sql`), then execute it. Do not paste multi-statement DDL into `-e` blindly; a file is easier to review and re-run.

PowerShell 5.1 cannot use `<` input redirection, so read the file and pass its content to `-e` instead:

```powershell
$sql = Get-Content "database\migrations\20260806_fix_wallet.sql" -Raw
& $MYSQL -h $DB_HOST -P $DB_PORT -u $DB_USER $DB_NAME -e $sql
```

### Required migration SQL patterns

```sql
-- new table (copy shape from database/schema.sql, or use the model as a guide)
CREATE TABLE wallet (
    currency CHAR(3) PRIMARY KEY,
    balance  NUMERIC(20,4) NOT NULL DEFAULT 0
);

-- add a column
ALTER TABLE portfolio ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;

-- change a column's type / nullability / default
ALTER TABLE portfolio MODIFY COLUMN owner VARCHAR(128) NOT NULL DEFAULT 'Default User';

-- add / drop an index
ALTER TABLE security ADD INDEX ix_security_type (type);

-- add a foreign key
ALTER TABLE security_holding ADD CONSTRAINT fk_hold_portfolio
    FOREIGN KEY (portfolio_id) REFERENCES portfolio(id) ON DELETE CASCADE;

-- drop a column (destructive — only with explicit user confirmation)
ALTER TABLE portfolio DROP COLUMN is_active;
```

## Safety invariants (do not skip)

1. **Back up before any DDL.** MySQL DDL auto-commits — there is no rollback. Before running the migration, snapshot every table you will touch:
   ```powershell
   & $MYSQL -h $DB_HOST -P $DB_PORT -u $DB_USER -e "CREATE TABLE portfolio_bak_20260806 AS SELECT * FROM portfolio;" $DB_NAME
   ```
   You can reuse the same backup table to restore with `INSERT INTO portfolio SELECT * FROM portfolio_bak_20260806;` if a change needs to be reverted.

2. **Never `DROP COLUMN`/`DROP TABLE`/`TRUNCATE` without the user explicitly confirming** the data loss.

3. **Additive changes are safe; destructive ones need confirmation.** Adding tables/columns/indexes is expected; removing data is not.

4. **Verify after migrating.** Re-run Step 1 (`SHOW CREATE TABLE`) for each changed table and confirm it now matches the model. Do not tell the user it's done until the diff is empty.

5. **Keep the three sources in sync.** After a migration that succeeded, update `database/schema.sql` and the corresponding model in `backend/app/models/` so the code and DDL don't drift again. If instead the code changed, the DB (and `schema.sql`) must be migrated to match.

## Reference

- `database/SCHEMA_UPDATE.md` documents the repo's existing manual migration pattern (the `portfolio.owner` default) — follow the same style.
- `database/market_price_dummy_data.sql` shows how the repo writes data fixtures in SQL.
- `database/schema.sql` is the current intended schema — when in doubt, treat it as the spec and migrate the live DB toward it, then update it if the models have moved ahead.
