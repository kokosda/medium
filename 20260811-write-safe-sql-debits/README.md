# Safe SQL debits: executable PostgreSQL proof

This lab supports the article *3 Lines of SQL Passed Review. A Senior Engineer Sees 4 Problems*. It executes the claims against PostgreSQL instead of treating them as a checklist.

The suite proves:

- the original unconditional statement can create a negative balance and a zero-row update is not an SQL error;
- concurrent relative updates to one row serialize rather than inherently losing an update;
- at Read Committed, a waiting guarded update re-evaluates `balance >= amount` against the committed row version;
- concurrent calls with one `request_id` create one request, one debit, and one ledger row;
- replay after a lost response returns the stored outcome without another debit;
- a duplicate identifier with a different payload is rejected;
- a stored rejection stays rejected even when the account later receives funds;
- zero, negative, excessive, and missing-account requests leave the balance unchanged;
- a forced failure between balance mutation and ledger insertion rolls everything back;
- the illustrative function refuses isolation levels whose retry behavior it does not implement;
- the full protocol writes more WAL than one guarded `UPDATE` in the isolated test run.

## Run with Docker

Requirements: Docker with the Compose plugin.

```bash
./run-docker.sh
```

The script starts `postgres:18`, runs the Node integration suite in a second container, and removes the lab containers and volume afterward.

## Files

- `sql/schema.sql` contains the control table, protected schema, ledger, request table, and `apply_debit` function.
- `sql/test-failpoint.sql` installs a test-only trigger used to prove atomic rollback.
- `tests/integration.mjs` controls concurrent sessions and asserts persistent database state.
- `artifacts/test-results.md` is generated only after every scenario passes.

The test runner rebuilds the lab schema at startup. Do not point `DATABASE_URL` at a database containing data you care about.

The test runner is built as a Docker image. Only the generated evidence report is mounted back into the workspace; running this lab does not install Node or PostgreSQL packages on the host.
