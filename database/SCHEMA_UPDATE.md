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
