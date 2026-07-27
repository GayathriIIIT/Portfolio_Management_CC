# Buy Flow & Security Management Guide

## Understanding How Buying Works

### 1. **Security Table (Master Data)**
The `security` table stores master data about every tradable instrument:
- **Columns:** `symbol`, `name`, `type` (STOCK/BOND/CASH), `exchange`, `currency`, `sector`
- **Key Point:** Securities are auto-created on first purchase—you don't need to pre-populate them

### 2. **Buy Flow (Step-by-Step)**

When a user clicks "Buy" with symbol **AAPL**:

```
User enters "AAPL" in BuyModal
         ↓
Frontend sends: { symbol: "AAPL", quantity: 10, price: 150.25 }
         ↓
Backend POST /api/portfolios/{id}/buy
         ↓
Server calls _get_or_create_security("AAPL")
         ├─ Check: Does "AAPL" exist in security table?
         │
         ├─ YES → Return existing security row
         │
         └─ NO → Fetch from yfinance (name, exchange, sector, etc.)
                └─ Create new security row
                └─ Return new security
         ↓
Create/Update SecurityHolding:
  • If first purchase of AAPL → Create new holding (qty=10, avg_cost=150.25)
  • If already own AAPL → Update qty & recalculate weighted avg cost
         ↓
Record PortfolioTransaction (immutable ledger)
  • Log: BUY 10 shares @ $150.25
         ↓
Return success + updated holdings to frontend
```

### 3. **Key Tables**

| Table | Purpose | Notes |
|-------|---------|-------|
| `security` | Master data (one row per symbol) | Auto-created on first buy |
| `security_holding` | Current position (aggregate) | Updated on each buy/sell |
| `portfolio_transaction` | Immutable ledger (each trade) | Never modified, only inserted |
| `portfolio` | Container of holdings | Belongs to an owner |

### 4. **Weighted Average Cost Calculation**

When you buy the same stock twice:

**Example:**
- Buy #1: 10 shares @ $100 → `avg_cost = $100`
- Buy #2: 5 shares @ $120 → `avg_cost = (10×100 + 5×120) / 15 = $106.67`

This is automatically calculated in the backend.

---

## Recommended Securities Dropdown Feature

### How It Works

**File:** `frontend/src/data/recommendedSecurities.js`
- Contains 40+ popular companies (Tech, Finance, Healthcare, Consumer, Energy, etc.)
- Format: `{ symbol, name, type }`
- Easy to add more companies

**Frontend BuyModal enhancements:**
1. **Search/Filter:** Type symbol (e.g., "APP") or company name (e.g., "Apple")
2. **Dropdown:** Shows up to 8 matching suggestions
3. **Click to Select:** Populates the symbol field
4. **Custom Entry:** Users can type any symbol not in the list

### Example Search Results

When user types **"apple"**:
```
AAPL — Apple Inc.
```

When user types **"bank"**:
```
BAC  — Bank of America
JPM  — JPMorgan Chase & Co.
WFC  — Wells Fargo & Company
```

### Adding More Companies

Edit `recommendedSecurities.js`:

```javascript
{ symbol: "NEWCO", name: "New Company Inc.", type: "STOCK" },
```

No database changes needed—it's a frontend-only list.

---

## No Pre-Population Required

✅ **You do NOT need to:**
- Pre-fill the security table
- Create security records in advance
- Register securities before buying

✅ **The system automatically:**
- Detects unknown symbols
- Fetches company info from yfinance
- Creates security rows on demand
- Looks up yfinance for live prices

---

## Summary

| Aspect | Details |
|--------|---------|
| **Does symbol need to exist?** | No—auto-created on first buy |
| **Where does company info come from?** | yfinance (live fetch on first buy) |
| **Can users buy any symbol?** | Yes—dropdown is just a helper, not a restriction |
| **Where are recommendations stored?** | Frontend only (`recommendedSecurities.js`) |
| **Can I add more companies?** | Yes—just edit the JavaScript list |
| **What if yfinance has no data?** | Buy fails with an error message (symbol doesn't exist) |

