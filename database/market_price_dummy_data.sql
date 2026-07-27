-- Example seed for the market_price table so the analytics charts have enough history
-- for the 7-day and 1-month views. Replace 1 with the security_id you want to backfill.
-- This inserts four samples per day across the last 180 days.

WITH RECURSIVE
  day_series(day_offset) AS (
    VALUES (0)
    UNION ALL
    SELECT day_offset + 1 FROM day_series WHERE day_offset < 179
  ),
  slot_series(slot) AS (
    VALUES (0), (1), (2), (3)
  )
INSERT INTO market_price (security_id, price, as_of, source)
SELECT
  1 AS security_id,
  ROUND(100 + (day_offset * 0.45) + (slot * 0.12), 4) AS price,
  datetime('now', '-' || day_offset || ' days', '-' || (8 + slot * 2) || ' hours') AS as_of,
  'dummy' AS source
FROM day_series
CROSS JOIN slot_series;
