# Portfolio Management API - Curl Examples

Base URL:
```bash
http://127.0.0.1:5000
```

## 1. Health check
```bash
curl -X GET "http://127.0.0.1:5000/health"
```

## 2. Create a portfolio
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios" \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "Alice",
    "name": "Retirement",
    "base_currency": "USD"
  }'
```

## 3. List all portfolios
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios"
```

## 4. Get one portfolio by ID
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/1"
```

## 5. Update a portfolio
```bash
curl -X PUT "http://127.0.0.1:5000/api/portfolios/1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Retirement Updated"
  }'
```

## 6. Delete a portfolio
```bash
curl -X DELETE "http://127.0.0.1:5000/api/portfolios/1"
```

## 7. Add a holding to a portfolio
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/holdings" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "quantity": 10,
    "purchase_price": 180.25
  }'
```

## 8. List holdings for a portfolio
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/1/holdings"
```

## 9. Get one holding by ID
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/1/holdings/1"
```

## 10. Update a holding (returns 405)
Corrections must go through a sell + re-buy instead.
```bash
curl -X PUT "http://127.0.0.1:5000/api/portfolios/1/holdings/1" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 15,
    "purchase_price": 185.50
  }'
```

## 11. Set a price override on a holding (e.g. for bonds with stale quotes)
```bash
curl -X PUT "http://127.0.0.1:5000/api/portfolios/1/holdings/1/price-override" \
  -H "Content-Type: application/json" \
  -d '{
    "price": 105.5
  }'
```

## 12. Clear a price override
```bash
curl -X PUT "http://127.0.0.1:5000/api/portfolios/1/holdings/1/price-override" \
  -H "Content-Type: application/json" \
  -d '{
    "price": null
  }'
```

## 13. Delete a holding (liquidates at market price)
```bash
curl -X DELETE "http://127.0.0.1:5000/api/portfolios/1/holdings/1"
```

## 14. Buy a holding (resolves live price automatically)
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/buy" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "quantity": 2
  }'
```

## 15. Buy a holding with a specific price and fees
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/buy" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "quantity": 2,
    "price": 175.00,
    "fees": 1.50
  }'
```

## 16. Sell a holding (resolves live price automatically)
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/sell" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "quantity": 1
  }'
```

## 17. Sell a holding with a specific price and fees
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/sell" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "quantity": 1,
    "price": 180.00,
    "fees": 1.50
  }'
```

## 18. Deposit cash into a portfolio
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/deposit" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000,
    "currency": "USD"
  }'
```

## 19. Withdraw cash from a portfolio
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/withdraw" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "currency": "USD"
  }'
```

## 20. List transactions for a portfolio
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/1/transactions"
```

## 21. Get portfolio analytics (XIRR, P&L, etc.)
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/1/analytics"
```

## 22. Get portfolio chart data
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/1/analytics/chart?range=1m"
```

## 23. Get portfolio risk metrics + recommendation
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/1/analytics/risk?range=1y"
```

## 24. Get portfolio risk metrics excluding cash
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/1/analytics/risk?range=1y&include_cash=false"
```

## 25. Refresh live prices for all holdings
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/refresh-prices" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 26. Refresh live prices for specific symbols
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/refresh-prices" \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["AAPL", "MSFT"]
  }'
```

## 27. Backfill historical prices for all holdings
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/backfill-prices"
```

## 28. What-if: revalue all holdings at a single hypothetical price
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/what-if" \
  -H "Content-Type: application/json" \
  -d '{
    "price": 200,
    "scenario_name": "bull_case"
  }'
```

## 29. What-if: revalue holdings at specific hypothetical prices
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/what-if" \
  -H "Content-Type: application/json" \
  -d '{
    "prices": {"AAPL": 200, "MSFT": 500},
    "scenario_name": "target_prices"
  }'
```

## 30. What-if: revalue holdings at a historical date's close
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/what-if" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-01-15",
    "scenario_name": "jan_review"
  }'
```

## 31. What-if: revalue holdings at a historical date's open price
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/what-if" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-01-15",
    "price_type": "open",
    "scenario_name": "jan_open"
  }'
```

## 32. List saved what-if scenarios
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/1/what-if"
```

## 33. Delete a what-if scenario
```bash
curl -X DELETE "http://127.0.0.1:5000/api/portfolios/1/what-if/1"
```

## 34. Fetch realtime market price from Yahoo Finance
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/market_price/realtime?symbol=TSLA"
```

## 35. Fetch similar stocks recommendation
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/market_price/similar?symbol=AAPL"
```

## 36. Single-stock analytics
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/market_price/analytics?symbol=AAPL&range=1y"
```

## 37. List all wallets
```bash
curl -X GET "http://127.0.0.1:5000/api/wallet"
```

## 38. Deposit into wallet directly
```bash
curl -X POST "http://127.0.0.1:5000/api/wallet/deposit" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000,
    "currency": "USD"
  }'
```

## 39. Withdraw from wallet directly
```bash
curl -X POST "http://127.0.0.1:5000/api/wallet/withdraw" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 2000,
    "currency": "USD"
  }'
```

## 40. Preview FX rate
```bash
curl -X GET "http://127.0.0.1:5000/api/wallet/rate?from=USD&to=EUR"
```

## 41. Exchange between wallet currencies
```bash
curl -X POST "http://127.0.0.1:5000/api/wallet/exchange" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "USD",
    "to": "EUR",
    "amount": 1000
  }'
```

## 42. List all price alerts
```bash
curl -X GET "http://127.0.0.1:5000/api/alerts"
```

## 43. Create a price alert
```bash
curl -X POST "http://127.0.0.1:5000/api/alerts" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "TSLA",
    "target_price": 250,
    "condition": "ABOVE"
  }'
```

## 44. Create a BELOW alert
```bash
curl -X POST "http://127.0.0.1:5000/api/alerts" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "target_price": 150,
    "condition": "BELOW"
  }'
```

## 45. Delete a price alert
```bash
curl -X DELETE "http://127.0.0.1:5000/api/alerts/1"
```

## 46. Force-evaluate all active alerts
```bash
curl -X POST "http://127.0.0.1:5000/api/alerts/check"
```

## 47. Example of an invalid request (missing symbol for realtime price)
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/market_price/realtime"
```

## 48. Example of an invalid symbol
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/market_price/realtime?symbol=NOTAREALSYMBOL123"
```

## Notes
- Replace the portfolio ID, holding ID, and alert ID in the examples based on your created data.
- If the backend is running on a different port, change the base URL accordingly.
- For pretty JSON output, add `| jq` at the end of the curl command when `jq` is installed.
- The `update_holding` endpoint (`PUT /api/portfolios/<id>/holdings/<holding_id>`) returns 405 — corrections must go through a sell + re-buy trade instead.
- Cash positions (`{CCY}-CASH`) are priced at face value and cannot have price overrides.
- The wallet is shared across all portfolios; every buy debits it and every sell credits it.
- The `DEPOSIT`/`WITHDRAW` transaction types are used for cash movements; `BUY`/`SELL` are used for security trades.
- The `DIVIDEND` transaction type exists in the database schema but is not yet exposed through the API.
- Price alerts are evaluated automatically in the background; use `POST /api/alerts/check` to force an immediate evaluation.
- The `what-if` endpoint persists scenario rows to the `whatif_price` table; use `GET /api/portfolios/<id>/what-if` to list them and `DELETE` to remove them.
```

Now update the stale scope notes in README.md too:</think>Now update the stale scope notes at the bottom of README.md
<tool_call>edit
<arg_key>filePath</arg_key>
<arg_value>C:\Users\Administrator\Documents\portfoliomanager\backend/README.md