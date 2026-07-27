# Portfolio Management System — Buy Flow Architecture

## 🎯 What Just Changed

You now have a **recommended securities dropdown** that helps users select stocks without memorizing symbols. Users can still type any custom symbol.

---

## 📊 How the System Works (Technical Overview)

```
┌─────────────────────────────────────────────────────────────────┐
│                       BUY FLOW DIAGRAM                          │
└─────────────────────────────────────────────────────────────────┘

Frontend (BuyModal)
┌──────────────────────────────────────────────────┐
│ 1. User types symbol or selects from dropdown   │
│    - Input: "AAPL" or "Apple Inc."             │
│    - Suggestions shown (searchable)             │
├──────────────────────────────────────────────────┤
│ 2. User enters Quantity (e.g., 10)             │
├──────────────────────────────────────────────────┤
│ 3. Fetch live price from yfinance              │
│    - Display current market price              │
├──────────────────────────────────────────────────┤
│ 4. Submit: POST /api/portfolios/{id}/buy       │
│    Payload: {                                   │
│      symbol: "AAPL",                           │
│      quantity: 10,                             │
│      price: 150.25                             │
│    }                                            │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
Backend (buy_holding endpoint)
┌──────────────────────────────────────────────────┐
│ 1. Receive symbol "AAPL"                        │
├──────────────────────────────────────────────────┤
│ 2. Call _get_or_create_security("AAPL")        │
│    ├─ Query: SELECT * FROM security            │
│    │         WHERE symbol = "AAPL"             │
│    │                                            │
│    ├─ If EXISTS: Return existing row            │
│    │                                            │
│    └─ If NOT EXISTS:                           │
│       ├─ Call yfinance.Ticker("AAPL")          │
│       ├─ Fetch: name, exchange, sector         │
│       ├─ INSERT into security table            │
│       └─ Return new security row               │
├──────────────────────────────────────────────────┤
│ 3. Update SecurityHolding:                      │
│    ├─ Query existing holding in portfolio      │
│    │                                            │
│    ├─ If NOT found:                            │
│    │  INSERT: qty=10, avg_cost=150.25          │
│    │                                            │
│    └─ If found:                                │
│       └─ RECALCULATE weighted average cost     │
├──────────────────────────────────────────────────┤
│ 4. Record Transaction (immutable ledger):       │
│    INSERT into portfolio_transaction            │
│    (BUY, 10 shares, $150.25, timestamp)        │
├──────────────────────────────────────────────────┤
│ 5. Return success + updated holdings           │
└──────────────────────────────────────────────────┘
```

---

## 🗂️ Key Database Tables

### `security` — Master Data (One Row Per Symbol)
```sql
id   | symbol | name              | type  | exchange | currency | sector
─────┼────────┼──────────────────┼───────┼──────────┼──────────┼────────
1    | AAPL   | Apple Inc.       | STOCK | NASDAQ   | USD      | Tech
2    | MSFT   | Microsoft Corp.  | STOCK | NASDAQ   | USD      | Tech
3    | JNJ    | Johnson & Johnson| STOCK | NYSE     | USD      | Health
```

**Auto-Created?** ✅ YES — On first buy with that symbol

---

### `security_holding` — Current Positions (Aggregate)
```sql
id | portfolio_id | security_id | quantity | avg_cost
───┼──────────────┼─────────────┼──────────┼─────────
1  | 42           | 1           | 10.0     | 150.25
2  | 42           | 2           | 5.0      | 400.00
```

**Updated How?**
- First buy of AAPL → INSERT new row
- Second buy of AAPL → UPDATE quantity + recalculate avg_cost

**Example:**
```
First:  10 @ $150 = avg $150
Second: 5 @ $160  = new avg = (10*150 + 5*160) / 15 = $153.33
```

---

### `portfolio_transaction` — Immutable Ledger (Every Trade)
```sql
id | portfolio_id | security_id | txn_type | quantity | price | executed_at
───┼──────────────┼─────────────┼──────────┼──────────┼───────┼──────────────
1  | 42           | 1           | BUY      | 10       | 150   | 2024-01-15
2  | 42           | 1           | BUY      | 5        | 160   | 2024-01-20
3  | 42           | 1           | SELL     | 3        | 165   | 2024-01-25
```

**Important:** Never modified—pure audit trail

---

## ✅ New Feature: Recommended Securities Dropdown

### Where It's Stored
📁 **File:** `frontend/src/data/recommendedSecurities.js`
- 40+ popular companies
- JavaScript array (frontend only—no database needed)
- Easily searchable

### How It Works
1. User types in the symbol field
2. As they type, real-time filter shows matches
3. Search works on: symbol (e.g., "APP") OR company name (e.g., "Apple")
4. Max 8 suggestions shown
5. Click to select, or continue typing custom symbol

### Example
```
User types: "tech"
Results:
├─ AAPL — Apple Inc.
├─ MSFT — Microsoft Corporation
├─ NVDA — NVIDIA Corporation
└─ INTC — Intel Corporation
```

---

## 🔑 Key Points to Remember

| Question | Answer |
|----------|--------|
| Do I need to pre-populate the security table? | ❌ **NO** — It's auto-created |
| Does the symbol need to exist before buying? | ❌ **NO** — First buy creates it |
| Where does company info come from? | 📡 **yfinance** (fetched on first buy) |
| Can users buy symbols NOT in the dropdown? | ✅ **YES** — It's just a helper |
| Where are recommended securities stored? | 💾 **Frontend only** (`recommendedSecurities.js`) |
| Can I add more companies to the list? | ✅ **YES** — Just edit the JavaScript array |
| What happens if yfinance doesn't know the symbol? | ❌ **Buy fails** — "Unable to resolve ticker" |

---

## 🚀 How to Add More Recommended Securities

### Edit this file:
```
frontend/src/data/recommendedSecurities.js
```

### Add a new company:
```javascript
// Energy
{ symbol: "COP", name: "ConocoPhillips", type: "STOCK" },
{ symbol: "MPC", name: "Marathon Petroleum", type: "STOCK" },
```

### No other changes needed!
- Restart frontend dev server
- New suggestions appear immediately

---

## 💡 Example: Buying Tesla (TSLA)

### Scenario 1: From Dropdown
```
User opens Buy modal
  ↓
Types: "tesla"
  ↓
Sees: "TSLA — Tesla Inc."
  ↓
Clicks to select
  ↓
Input shows: "TSLA"
  ↓
Enters quantity: 5
  ↓
Clicks "Fetch live quote"
  ↓
Backend calls _get_or_create_security("TSLA")
  ├─ TSLA not in database
  ├─ Calls yfinance for TSLA info
  ├─ Creates security row
  └─ Returns price
  ↓
User confirms & clicks "Buy"
  ↓
Backend creates transaction + updates holding
  ↓
Success! ✅
```

### Scenario 2: Custom Symbol (Not in Dropdown)
```
User opens Buy modal
  ↓
Types: "PLTR" (not in recommendations)
  ↓
No dropdown suggestions (or just "PLTR" if exists)
  ↓
Enters quantity: 10
  ↓
Clicks "Fetch live quote"
  ↓
yfinance returns price for PLTR
  ↓
User confirms & clicks "Buy"
  ↓
First buy creates PLTR in security table
  ↓
Success! ✅
```

---

## 📝 FAQ

**Q: What if I buy AAPL, then buy AAPL again?**  
A: Second purchase updates the existing holding with new weighted-average cost. The transaction is logged separately in the ledger.

**Q: Can I manually add securities to the database?**  
A: Yes, but it's not needed. They're auto-created. The dropdown is just a UX helper.

**Q: What if someone searches for "bank" in the dropdown?**  
A: They'll see all companies with "bank" in the name: BAC, JPM, WFC, etc.

**Q: Is the dropdown list maintained by you or the user?**  
A: You control it. It's a static JavaScript file in the frontend. Users can't modify it, but you can add/remove companies anytime.

