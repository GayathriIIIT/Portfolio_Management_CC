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
curl -X GET "http://127.0.0.1:5000/api/portfolios/2"
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

## 10. Update a holding
```bash
curl -X PUT "http://127.0.0.1:5000/api/portfolios/1/holdings/1" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 15,
    "purchase_price": 185.50
  }'
```

## 11. Delete a holding
```bash
curl -X DELETE "http://127.0.0.1:5000/api/portfolios/1/holdings/1"
```

## 12. Buy a holding
The backend will resolve the current market price automatically; you only provide the symbol and quantity.
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/buy" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "quantity": 2
  }'
```

## 13. Sell a holding
The backend will also resolve the current market price automatically for the sell price.
```bash
curl -X POST "http://127.0.0.1:5000/api/portfolios/1/sell" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "quantity": 1
  }'
```

## 14. Fetch realtime market price from Yahoo Finance
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/market_price/realtime?symbol=TSLA"
```

## 15. Fetch realtime market price for another symbol
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/market_price/realtime?symbol=AAPL"
```

## 16. Example of an invalid request (missing symbol)
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/market_price/realtime"
```

## 17. Example of an invalid symbol
```bash
curl -X GET "http://127.0.0.1:5000/api/portfolios/market_price/realtime?symbol=NOTAREALSYMBOL123"
```

curl -X POST "http://127.0.0.1:5000/api/portfolios/1/what-if" \
  -H "Content-Type: application/json" \
  -d '{"prices":{"AAPL":200,"MSFT":500}}'

## Notes
- Replace the portfolio ID and holding ID in the examples based on your created data.
- If the backend is running on a different port, change the base URL accordingly.
- For pretty JSON output, add `| jq` at the end of the curl command when `jq` is installed.
