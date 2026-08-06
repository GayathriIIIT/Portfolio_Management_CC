# Database Schema Migration & Update Guide

This file contains the SQL migration queries required to make the `owner` column optional and set a default value in your MySQL Workbench database for single-user operation.

---

## 🛠 MySQL Migration Queries

Run the following SQL commands in **MySQL Workbench** against your `portfoliomanager` database:

```sql
USE portfoliomanager;

-- 1. Modify the 'owner' column to have a default value for single-user mode
ALTER TABLE portfolio 
  MODIFY COLUMN owner VARCHAR(128) NOT NULL DEFAULT 'Default User';

-- (Optional) Update any existing portfolio owner values to 'Default User' if desired:
-- UPDATE portfolio SET owner = 'Default User';
```

---

## 📝 Notes
- Setting `DEFAULT 'Default User'` ensures that portfolio creation queries without an `owner` parameter will execute cleanly without breaking existing primary/foreign key constraints.
- Existing portfolios (e.g. Alice, Bob, Carol) will remain intact.

---

## 🚀 Migration: Price Alerts, Manual Bond Price Override (2026-08)

Adds schema changes used by the price-alerts, similar-stock recommendations, and
manual bond price-override features:

1. `security_holding.price_override` — a manual current-price override that wins
   over the live quote (used for bonds and any security the user wants to price
   by hand).
2. `price_alert` — user-defined price targets.

(Note: the `watchlist_item` table from the original draft migration was dropped —
the watchlist feature was removed as redundant with the Holdings section.)

Run the following in **MySQL Workbench** against `portfoliomanager`:

```sql
USE portfoliomanager;

-- 1. Manual price override on holdings
ALTER TABLE security_holding
  ADD COLUMN price_override NUMERIC(18,4) NULL COMMENT 'manual price override; NULL = use live quote';

-- 2. Price alerts / price targets
CREATE TABLE price_alert (
    id            BIGINT        PRIMARY KEY AUTO_INCREMENT,
    symbol        VARCHAR(32)   NOT NULL,
    target_price  NUMERIC(18,4) NOT NULL,
    `condition`   VARCHAR(8)    NOT NULL DEFAULT 'ABOVE',
    last_price    NUMERIC(18,4) NULL,
    is_active     TINYINT(1)    NOT NULL DEFAULT 1,
    fired         TINYINT(1)    NOT NULL DEFAULT 0,
    fired_at      TIMESTAMP     NULL,
    created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_price_alert_condition CHECK (`condition` IN ('ABOVE','BELOW'))
);
CREATE INDEX ix_price_alert_symbol ON price_alert(symbol);
```

Notes:
- `price_alert.condition` is backtick-quoted because `CONDITION` is a reserved
  word in MySQL.
- All changes are additive and idempotent-safe to run once on an existing DB.
  Re-running the `ALTER TABLE` will fail (duplicate column) so only run it once.
