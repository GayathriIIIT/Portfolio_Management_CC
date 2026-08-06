-- 20260806: add missing `wallet` table required by backend/app/models/wallet.py
CREATE TABLE IF NOT EXISTS wallet (
    currency   CHAR(3)         PRIMARY KEY,
    balance    NUMERIC(20,4)   NOT NULL DEFAULT 0
);
