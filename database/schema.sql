-- Portfolio Manager — MySQL schema
--
-- Staged on purpose: start at STAGE 0, get the API working end-to-end,
-- then move to STAGE 1, then STAGE 2. Don't jump straight to the bottom.
-- To advance a stage: comment out the current CREATE TABLE block below,
-- uncomment the next one, and re-run this file in Workbench.
--
-- Run once per environment:
--   CREATE DATABASE IF NOT EXISTS portfoliomanager
--     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE portfoliomanager;

-- =====================================================================
-- STAGE 0 — bare minimum. Get "add a holding" / "list holdings" working.
-- (superseded below — kept only for reference)
-- =====================================================================

-- CREATE TABLE holding (
--     id       BIGINT AUTO_INCREMENT PRIMARY KEY,
--     ticker   VARCHAR(10) NOT NULL,
--     quantity DECIMAL(18,4) NOT NULL
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =====================================================================
-- STAGE 1 — reference data + positions
--
-- `security` is NOT a user's holding — it's master/reference data about
-- a tradable instrument (one row per ticker). It gets populated either
-- by dummy/seed rows (database/seed_data.sql) or synced from the price
-- API (docs/ARCHITECTURE.md), and caches the last price so you don't
-- have to hit the API on every read.
--
-- `holding` is the user's actual position. STOCK/BOND rows point at a
-- `security` row; CASH has no ticker, so security_id is left NULL.
-- =====================================================================

CREATE TABLE security (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticker        VARCHAR(10) NOT NULL UNIQUE,
    name          VARCHAR(150) NULL,             -- e.g. "Apple Inc."
    asset_type    ENUM('STOCK','BOND') NOT NULL,  -- CASH has no security row
    exchange      VARCHAR(20) NULL,               -- e.g. "NASDAQ"
    currency      CHAR(3) NOT NULL DEFAULT 'USD',
    last_price    DECIMAL(18,4) NULL,             -- cached: dummy seed or API sync
    last_price_at TIMESTAMP NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE holding (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    security_id BIGINT NULL,                      -- NULL only for CASH
    asset_type  ENUM('STOCK','BOND','CASH') NOT NULL,
    quantity    DECIMAL(18,4) NOT NULL,
    cost_basis  DECIMAL(18,4) NOT NULL,            -- price paid per unit
    acquired_on DATE NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (security_id) REFERENCES security(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =====================================================================
-- STAGE 2 — performance-over-time tracking, for the "graphical
-- performance" UI goal.
-- =====================================================================

-- periodic price checks pulled from Yahoo / the sample API, kept as a
-- time series per security (separate from security.last_price, which
-- is just the latest value).
CREATE TABLE price_snapshot (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    security_id BIGINT NOT NULL,
    price      DECIMAL(18,4) NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (security_id) REFERENCES security(id),
    INDEX idx_security_time (security_id, fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- whole-portfolio value at a point in time, for the performance chart
CREATE TABLE portfolio_snapshot (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    total_value DECIMAL(18,2) NOT NULL,
    snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- audit trail of every add/remove action, independent of `holding`'s
-- current state — a holding row can be deleted once fully sold off,
-- but its transactions stay on record.
CREATE TABLE transaction (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    security_id      BIGINT NULL,                    -- NULL for DEPOSIT/WITHDRAW (cash)
    transaction_type ENUM('BUY','SELL','DEPOSIT','WITHDRAW') NOT NULL,
    quantity         DECIMAL(18,4) NOT NULL,
    price            DECIMAL(18,4) NOT NULL,          -- per-unit price at time of transaction
    transaction_date DATE NOT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (security_id) REFERENCES security(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
