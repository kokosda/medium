# Safe SQL debit integration results

Generated: 2026-08-12T05:33:55.603Z

Server: PostgreSQL 18.4 (Debian 18.4-1.pgdg13+1) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit

Result: 11/11 scenarios passed.

## PASS — original statement permits invalid state and zero rows is not an error

- balance 50 - 100 committed as -50 on the unconstrained control table
- missing account completed successfully with rowCount=0
- the protected table rejected the same negative balance with CHECK violation SQLSTATE 23514

## PASS — relative UPDATE is atomic and does not inherently lose an update

- second updater observed in pg_stat_activity waiting on Lock/transactionid
- returned balances were 200 and 100; committed final balance was 100

## PASS — guarded UPDATE re-evaluates the predicate after the row-lock wait

- second updater observed waiting on Lock/transactionid
- first rowCount=1, second rowCount=0, final balance=50

## PASS — concurrent duplicate request identifiers produce one debit

- duplicate caller observed waiting on Lock/transactionid
- both callers received {status: applied, balance_after: 900}
- ledger stored request_id, account 42, amount_delta -100, and balance_after 900
- a duplicate journal insert failed with unique-constraint SQLSTATE 23505

## PASS — a committed debit survives an ambiguous response without repeating

- first result was discarded after COMMIT; replay returned the stored balance 900
- durable state remained 1 request, 1 ledger row, balance 900

## PASS — a reused request identifier with a different payload is rejected

- PostgreSQL returned SQLSTATE 22023
- durable state remained 1 request, 1 ledger row, balance 900

## PASS — a stored rejection remains stable after the account changes

- request was rejected at balance 50, then the account was credited to 200
- replay returned the same rejection; balance stayed 200 and no ledger row appeared

## PASS — invalid, excessive, and missing-account requests are durable rejections

- zero and negative amounts returned invalid_amount
- an excessive debit and a missing account returned not_applied
- durable state: 4 rejected requests, 0 ledger rows, unchanged balance 150

## PASS — an error after the balance UPDATE rolls back the whole debit

- test trigger raised “forced ledger failure” before the ledger INSERT
- after ROLLBACK: 0 requests, 0 ledger rows, balance 1000

## PASS — the example function refuses untested isolation semantics

- Repeatable Read call failed with “apply_debit requires Read Committed isolation”
- no persistent state changed

## PASS — the stronger protocol performs more durable work

- this isolated run inserted 112 WAL bytes for the guarded UPDATE
- the request + UPDATE + ledger + stored outcome inserted 1216 WAL bytes
- the exact byte counts are environment-specific; the extra request and ledger rows are not free
