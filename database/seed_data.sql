-- Sample rows for local testing.
-- Tickers below (C, AMZN, TSLA, FB, AAPL) are the ones already supported
-- by the sample price API in docs/ARCHITECTURE.md, so you can wire up
-- live prices without extra setup.
--
-- Order matters: security rows must exist before holding rows reference them.

INSERT INTO security (ticker, name, asset_type, exchange, currency, last_price, last_price_at) VALUES
    ('AAPL', 'Apple Inc.',      'STOCK', 'NASDAQ', 'USD', 195.00, NOW()),
    ('TSLA', 'Tesla Inc.',      'STOCK', 'NASDAQ', 'USD', 250.00, NOW()),
    ('AMZN', 'Amazon.com Inc.', 'STOCK', 'NASDAQ', 'USD', 135.00, NOW()),
    ('C',    'Citigroup Inc.',  'STOCK', 'NYSE',   'USD', 60.00,  NOW()),
    ('FB',   'Meta Platforms',  'STOCK', 'NASDAQ', 'USD', 320.00, NOW());

INSERT INTO holding (security_id, asset_type, quantity, cost_basis, acquired_on)
SELECT id, 'STOCK', 10, 150.00, '2025-01-15' FROM security WHERE ticker = 'AAPL'
UNION ALL
SELECT id, 'STOCK', 5,  220.00, '2025-02-10' FROM security WHERE ticker = 'TSLA'
UNION ALL
SELECT id, 'STOCK', 2,  130.00, '2025-03-01' FROM security WHERE ticker = 'AMZN'
UNION ALL
SELECT id, 'STOCK', 20, 55.00,  '2025-01-20' FROM security WHERE ticker = 'C'
UNION ALL
SELECT id, 'STOCK', 8,  310.00, '2025-02-25' FROM security WHERE ticker = 'FB';

-- CASH has no security row — security_id stays NULL
INSERT INTO holding (security_id, asset_type, quantity, cost_basis, acquired_on) VALUES
    (NULL, 'CASH', 2500, 1.00, '2025-01-01');

-- transaction history matching the holdings above (each acquisition was a BUY;
-- the cash balance came from an initial DEPOSIT)
INSERT INTO transaction (security_id, transaction_type, quantity, price, transaction_date)
SELECT id, 'BUY', 10, 150.00, '2025-01-15' FROM security WHERE ticker = 'AAPL'
UNION ALL
SELECT id, 'BUY', 5,  220.00, '2025-02-10' FROM security WHERE ticker = 'TSLA'
UNION ALL
SELECT id, 'BUY', 2,  130.00, '2025-03-01' FROM security WHERE ticker = 'AMZN'
UNION ALL
SELECT id, 'BUY', 20, 55.00,  '2025-01-20' FROM security WHERE ticker = 'C'
UNION ALL
SELECT id, 'BUY', 8,  310.00, '2025-02-25' FROM security WHERE ticker = 'FB';

INSERT INTO transaction (security_id, transaction_type, quantity, price, transaction_date) VALUES
    (NULL, 'DEPOSIT', 2500, 1.00, '2025-01-01');
