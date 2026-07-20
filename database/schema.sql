
-- =========================================================================
-- Portfolio Insight Service — Final Schema (6 tables)
-- Tables: portfolio, security, security_holding,
--         portfolio_transaction, market_price, whatif_price
-- Supports asset types: STOCK, BOND, CASH  (via `security.type`)
-- Principle: store INPUTS only; P/L and market value are computed on read.
-- =========================================================================


-- =========================================================================
-- 1. PORTFOLIO
--    A named container of holdings owned by someone.
-- =========================================================================
CREATE TABLE portfolio (
    id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
    owner          VARCHAR(128) NOT NULL,                       -- free-text owner (no auth in app today)
    name           VARCHAR(128) NOT NULL,                       -- e.g. "Retirement", "Trading"
    base_currency  CHAR(3)      NOT NULL DEFAULT 'USD',         -- reporting currency for this portfolio
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================================
-- 2. SECURITY  (master data — one row per tradable instrument)
--    Single-table inheritance: `type` column distinguishes asset classes.
--    Common columns are always populated; type-specific columns are nullable
--    and used only when relevant (e.g. coupon_rate only for BOND).
-- =========================================================================
CREATE TABLE security (
    id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
    symbol         VARCHAR(32)  NOT NULL UNIQUE,                -- AAPL, US10Y-2030, USD-CASH ...
    name           VARCHAR(255),                                -- human-readable name
    type           VARCHAR(16)  NOT NULL,                       -- STOCK | BOND | CASH  (discriminator)
    exchange       VARCHAR(32),                                 -- NASDAQ, NSE, OTC ... (NULL for CASH)
    currency       CHAR(3)      NOT NULL DEFAULT 'USD',         -- currency the instrument trades in
    sector         VARCHAR(64),                                 -- classification (mainly for STOCK)
    isin           VARCHAR(12),                                 -- optional ISO identifier
    -- BOND-specific (nullable; only populated when type = 'BOND')
    coupon_rate    NUMERIC(6,4),                                -- e.g. 0.0525 for 5.25%
    maturity_date  DATE,                                        -- bond maturity
    face_value     NUMERIC(18,4),                               -- par value per unit
    -- CASH-specific (nullable; only populated when type = 'CASH')
    interest_rate  NUMERIC(6,4),                                -- e.g. 0.0400 for 4%
    CONSTRAINT chk_security_type CHECK (type IN ('STOCK','BOND','CASH'))
);
CREATE INDEX ix_security_type ON security(type);


-- =========================================================================
-- 3. SECURITY_HOLDING
--    Current aggregate position of a security in a portfolio.
--    Derived from portfolio_transaction; kept for fast reads.
--    INPUTS ONLY — never store P/L or market value here.
-- =========================================================================
CREATE TABLE security_holding (
    id            BIGINT        PRIMARY KEY AUTO_INCREMENT,
    portfolio_id  BIGINT        NOT NULL,
    security_id   BIGINT        NOT NULL,                       -- FK to security regardless of type
    quantity      NUMERIC(18,4) NOT NULL,                       -- shares / face-value units / cash units
    avg_cost      NUMERIC(18,4) NOT NULL,                       -- weighted avg cost basis per unit
    CONSTRAINT fk_hold_portfolio
        FOREIGN KEY (portfolio_id) REFERENCES portfolio(id) ON DELETE CASCADE,
    CONSTRAINT fk_hold_security
        FOREIGN KEY (security_id)  REFERENCES security(id),
    CONSTRAINT uq_hold UNIQUE (portfolio_id, security_id)       -- one aggregate row per (portfolio, security)
);
CREATE INDEX ix_hold_portfolio ON security_holding(portfolio_id);


-- =========================================================================
-- 4. PORTFOLIO_TRANSACTION
--    Immutable ledger of BUY / SELL (and cash DEPOSIT / WITHDRAW) events.
--    Source of truth — security_holding can be rebuilt from this table.
-- =========================================================================
CREATE TABLE portfolio_transaction (
    id            BIGINT        PRIMARY KEY AUTO_INCREMENT,
    portfolio_id  BIGINT        NOT NULL,
    security_id   BIGINT        NOT NULL,
    txn_type      VARCHAR(16)   NOT NULL,                       -- BUY | SELL | DEPOSIT | WITHDRAW
    quantity      NUMERIC(18,4) NOT NULL,                       -- units transacted
    price         NUMERIC(18,4) NOT NULL,                       -- per-unit price (1.0 for CASH deposit)
    fees          NUMERIC(18,4) DEFAULT 0,                      -- brokerage / commission
    executed_at   TIMESTAMP     NOT NULL,                       -- when the trade happened
    CONSTRAINT fk_txn_portfolio
        FOREIGN KEY (portfolio_id) REFERENCES portfolio(id) ON DELETE CASCADE,
    CONSTRAINT fk_txn_security
        FOREIGN KEY (security_id)  REFERENCES security(id),
    CONSTRAINT chk_txn_type CHECK (txn_type IN ('BUY','SELL','DEPOSIT','WITHDRAW'))
);
CREATE INDEX ix_txn_portfolio ON portfolio_transaction(portfolio_id, executed_at);


-- =========================================================================
-- 5. MARKET_PRICE
--    Append-only time-series of quotes per security.
--    STOCK/BOND → observed market price; CASH → typically 1.0 or omitted.
--    Enables historical charts and reproducible analytics.
-- =========================================================================
CREATE TABLE market_price (
    id           BIGINT        PRIMARY KEY AUTO_INCREMENT,
    security_id  BIGINT        NOT NULL,
    price        NUMERIC(18,4) NOT NULL,                        -- quoted price per unit
    as_of        TIMESTAMP     NOT NULL,                        -- when this price was observed
    source       VARCHAR(32),                                   -- yahoo | mock | manual | ...
    CONSTRAINT fk_price_security
        FOREIGN KEY (security_id) REFERENCES security(id),
    CONSTRAINT uq_price UNIQUE (security_id, as_of)             -- prevent duplicate ticks
);
CREATE INDEX ix_price_security_time ON market_price(security_id, as_of DESC);


-- =========================================================================
-- 6. WHATIF_PRICE
--    Hypothetical price per security for a named what-if scenario.
--    No separate scenario header table — a scenario is identified by the
--    combination (portfolio_id, scenario_name). All rows sharing that pair
--    belong to the same scenario.
-- =========================================================================
CREATE TABLE whatif_price (
    id                  BIGINT        PRIMARY KEY AUTO_INCREMENT,
    portfolio_id        BIGINT        NOT NULL,                 -- scenario belongs to this portfolio
    scenario_name       VARCHAR(128)  NOT NULL,                 -- e.g. "Tech crash", "Rate cut"
    security_id         BIGINT        NOT NULL,                 -- which instrument the assumption applies to
    hypothetical_price  NUMERIC(18,4) NOT NULL,                 -- assumed price for this scenario
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wp_portfolio
        FOREIGN KEY (portfolio_id) REFERENCES portfolio(id) ON DELETE CASCADE,
    CONSTRAINT fk_wp_security
        FOREIGN KEY (security_id)  REFERENCES security(id),
    CONSTRAINT uq_wp UNIQUE (portfolio_id, scenario_name, security_id)  -- one hypothetical price per security per scenario
);
CREATE INDEX ix_wp_scenario ON whatif_price(portfolio_id, scenario_name);