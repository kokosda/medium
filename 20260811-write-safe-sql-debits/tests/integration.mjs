import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client, Pool } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString, max: 20 });
const evidence = [];

function result(name, details) {
  evidence.push({ name, details });
  console.log(`PASS ${name}`);
  for (const detail of details) console.log(`     ${detail}`);
}

async function client(applicationName) {
  const connection = new Client({ connectionString, application_name: applicationName });
  await connection.connect();
  await connection.query("SET statement_timeout = '10s'");
  return connection;
}

async function reset(table, balance) {
  await pool.query('TRUNCATE account_ledger, debit_requests, accounts, unguarded_accounts RESTART IDENTITY CASCADE');
  await pool.query(`INSERT INTO ${table} (account_id, balance) VALUES (42, $1)`, [balance]);
}

async function waitUntilBlocked(applicationName) {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const observation = await pool.query(
      `SELECT state, wait_event_type, wait_event
       FROM pg_stat_activity
       WHERE application_name = $1`,
      [applicationName],
    );

    const row = observation.rows[0];
    if (row?.wait_event_type === 'Lock') return row;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }

  throw new Error(`${applicationName} did not enter a lock wait`);
}

async function countState() {
  const state = await pool.query(
    `SELECT
       (SELECT balance::text FROM accounts WHERE account_id = 42) AS balance,
       (SELECT count(*)::int FROM debit_requests) AS request_count,
       (SELECT count(*)::int FROM account_ledger) AS ledger_count`,
  );
  return state.rows[0];
}

async function originalStatementProof() {
  await reset('unguarded_accounts', 50);

  const negative = await pool.query(
    `UPDATE unguarded_accounts
     SET balance = balance - 100
     WHERE account_id = 42
     RETURNING balance::text`,
  );
  assert.equal(negative.rows[0].balance, '-50');

  const missing = await pool.query(
    `UPDATE unguarded_accounts
     SET balance = balance - 100
     WHERE account_id = 999
     RETURNING balance::text`,
  );
  assert.equal(missing.rowCount, 0);

  await reset('accounts', 50);
  let constraintError;
  try {
    await pool.query(
      `UPDATE accounts
       SET balance = balance - 100
       WHERE account_id = 42`,
    );
  } catch (caught) {
    constraintError = caught;
  }
  assert.equal(constraintError?.code, '23514');
  const protectedBalance = await pool.query('SELECT balance::text FROM accounts WHERE account_id = 42');
  assert.equal(protectedBalance.rows[0].balance, '50');

  result('original statement permits invalid state and zero rows is not an error', [
    'balance 50 - 100 committed as -50 on the unconstrained control table',
    `missing account completed successfully with rowCount=${missing.rowCount}`,
    'the protected table rejected the same negative balance with CHECK violation SQLSTATE 23514',
  ]);
}

async function relativeUpdateProof() {
  await reset('unguarded_accounts', 300);
  const first = await client('relative-first');
  const second = await client('relative-second');

  try {
    await first.query('BEGIN');
    await second.query('BEGIN');

    const firstResult = await first.query(
      `UPDATE unguarded_accounts
       SET balance = balance - 100
       WHERE account_id = 42
       RETURNING balance::text`,
    );
    assert.equal(firstResult.rows[0].balance, '200');

    const secondPromise = second.query(
      `UPDATE unguarded_accounts
       SET balance = balance - 100
       WHERE account_id = 42
       RETURNING balance::text`,
    );
    const wait = await waitUntilBlocked('relative-second');

    await first.query('COMMIT');
    const secondResult = await secondPromise;
    await second.query('COMMIT');

    assert.equal(secondResult.rows[0].balance, '100');
    const final = await pool.query('SELECT balance::text FROM unguarded_accounts WHERE account_id = 42');
    assert.equal(final.rows[0].balance, '100');

    result('relative UPDATE is atomic and does not inherently lose an update', [
      `second updater observed in pg_stat_activity waiting on ${wait.wait_event_type}/${wait.wait_event}`,
      'returned balances were 200 and 100; committed final balance was 100',
    ]);
  } finally {
    await first.query('ROLLBACK').catch(() => {});
    await second.query('ROLLBACK').catch(() => {});
    await first.end();
    await second.end();
  }
}

async function guardedConcurrencyProof() {
  await reset('accounts', 150);
  const first = await client('guarded-first');
  const second = await client('guarded-second');

  try {
    await first.query('BEGIN');
    await second.query('BEGIN');

    const firstResult = await first.query(
      `UPDATE accounts
       SET balance = balance - 100
       WHERE account_id = 42 AND balance >= 100
       RETURNING balance::text`,
    );
    assert.equal(firstResult.rows[0].balance, '50');

    const secondPromise = second.query(
      `UPDATE accounts
       SET balance = balance - 100
       WHERE account_id = 42 AND balance >= 100
       RETURNING balance::text`,
    );
    const wait = await waitUntilBlocked('guarded-second');

    await first.query('COMMIT');
    const secondResult = await secondPromise;
    await second.query('COMMIT');

    const final = await pool.query('SELECT balance::text FROM accounts WHERE account_id = 42');
    assert.equal(secondResult.rowCount, 0);
    assert.equal(final.rows[0].balance, '50');

    result('guarded UPDATE re-evaluates the predicate after the row-lock wait', [
      `second updater observed waiting on ${wait.wait_event_type}/${wait.wait_event}`,
      `first rowCount=${firstResult.rowCount}, second rowCount=${secondResult.rowCount}, final balance=50`,
    ]);
  } finally {
    await first.query('ROLLBACK').catch(() => {});
    await second.query('ROLLBACK').catch(() => {});
    await first.end();
    await second.end();
  }
}

async function concurrentIdempotencyProof() {
  await reset('accounts', 1000);
  const requestId = '10000000-0000-4000-8000-000000000001';
  const first = await client('idempotency-first');
  const second = await client('idempotency-second');

  try {
    await first.query('BEGIN');
    const a = await first.query('SELECT * FROM apply_debit($1, 42, 100)', [requestId]);

    const secondPromise = second.query('SELECT * FROM apply_debit($1, 42, 100)', [requestId]);
    const wait = await waitUntilBlocked('idempotency-second');
    await first.query('COMMIT');
    const b = await secondPromise;

    assert.deepEqual(a.rows, b.rows);
    assert.equal(a.rows[0].result_status, 'applied');
    assert.equal(a.rows[0].result_balance_after, '900');
    assert.deepEqual(await countState(), { balance: '900', request_count: 1, ledger_count: 1 });

    const ledger = await pool.query(
      `SELECT request_id::text, account_id::text, amount_delta::text, balance_after::text
       FROM account_ledger`,
    );
    assert.deepEqual(ledger.rows[0], {
      request_id: requestId,
      account_id: '42',
      amount_delta: '-100',
      balance_after: '900',
    });

    let duplicateLedgerError;
    try {
      await pool.query(
        `INSERT INTO account_ledger
           (request_id, account_id, amount_delta, balance_after)
         VALUES ($1, 42, -100, 900)`,
        [requestId],
      );
    } catch (caught) {
      duplicateLedgerError = caught;
    }
    assert.equal(duplicateLedgerError?.code, '23505');

    result('concurrent duplicate request identifiers produce one debit', [
      `duplicate caller observed waiting on ${wait.wait_event_type}/${wait.wait_event}`,
      'both callers received {status: applied, balance_after: 900}',
      'ledger stored request_id, account 42, amount_delta -100, and balance_after 900',
      'a duplicate journal insert failed with unique-constraint SQLSTATE 23505',
    ]);
  } finally {
    await first.query('ROLLBACK').catch(() => {});
    await first.end();
    await second.end();
  }
}

async function rejectionMatrixProof() {
  await reset('accounts', 150);

  const cases = [
    ['70000000-0000-4000-8000-000000000001', 42, 0, 'invalid_amount'],
    ['70000000-0000-4000-8000-000000000002', 42, -10, 'invalid_amount'],
    ['70000000-0000-4000-8000-000000000003', 42, 200, 'not_applied'],
    ['70000000-0000-4000-8000-000000000004', 999, 10, 'not_applied'],
  ];

  for (const [requestId, accountId, amount, expectedReason] of cases) {
    const response = await pool.query(
      'SELECT * FROM apply_debit($1, $2, $3)',
      [requestId, accountId, amount],
    );
    assert.deepEqual(response.rows[0], {
      result_status: 'rejected',
      result_balance_after: null,
      result_rejection_reason: expectedReason,
    });
  }

  assert.deepEqual(await countState(), { balance: '150', request_count: 4, ledger_count: 0 });

  result('invalid, excessive, and missing-account requests are durable rejections', [
    'zero and negative amounts returned invalid_amount',
    'an excessive debit and a missing account returned not_applied',
    'durable state: 4 rejected requests, 0 ledger rows, unchanged balance 150',
  ]);
}

async function ambiguousResponseProof() {
  await reset('accounts', 1000);
  const requestId = '20000000-0000-4000-8000-000000000002';
  const lostResponse = await client('lost-response');

  try {
    await lostResponse.query('BEGIN');
    await lostResponse.query('SELECT * FROM apply_debit($1, 42, 100)', [requestId]);
    await lostResponse.query('COMMIT');
    // Deliberately discard the first response after its transaction commits.

    const replay = await pool.query('SELECT * FROM apply_debit($1, 42, 100)', [requestId]);
    assert.deepEqual(replay.rows[0], {
      result_status: 'applied',
      result_balance_after: '900',
      result_rejection_reason: null,
    });
    assert.deepEqual(await countState(), { balance: '900', request_count: 1, ledger_count: 1 });

    result('a committed debit survives an ambiguous response without repeating', [
      'first result was discarded after COMMIT; replay returned the stored balance 900',
      'durable state remained 1 request, 1 ledger row, balance 900',
    ]);
  } finally {
    await lostResponse.query('ROLLBACK').catch(() => {});
    await lostResponse.end();
  }
}

async function payloadMismatchProof() {
  await reset('accounts', 1000);
  const requestId = '30000000-0000-4000-8000-000000000003';
  await pool.query('SELECT * FROM apply_debit($1, 42, 100)', [requestId]);

  let error;
  try {
    await pool.query('SELECT * FROM apply_debit($1, 42, 101)', [requestId]);
  } catch (caught) {
    error = caught;
  }

  assert.equal(error?.code, '22023');
  assert.match(error?.message ?? '', /different payload/);
  assert.deepEqual(await countState(), { balance: '900', request_count: 1, ledger_count: 1 });

  result('a reused request identifier with a different payload is rejected', [
    `PostgreSQL returned SQLSTATE ${error.code}`,
    'durable state remained 1 request, 1 ledger row, balance 900',
  ]);
}

async function rejectedReplayProof() {
  await reset('accounts', 50);
  const requestId = '40000000-0000-4000-8000-000000000004';

  const first = await pool.query('SELECT * FROM apply_debit($1, 42, 100)', [requestId]);
  assert.equal(first.rows[0].result_status, 'rejected');
  assert.equal(first.rows[0].result_rejection_reason, 'not_applied');

  await pool.query('UPDATE accounts SET balance = 200 WHERE account_id = 42');
  const replay = await pool.query('SELECT * FROM apply_debit($1, 42, 100)', [requestId]);

  assert.deepEqual(replay.rows, first.rows);
  assert.deepEqual(await countState(), { balance: '200', request_count: 1, ledger_count: 0 });

  result('a stored rejection remains stable after the account changes', [
    'request was rejected at balance 50, then the account was credited to 200',
    'replay returned the same rejection; balance stayed 200 and no ledger row appeared',
  ]);
}

async function rollbackProof() {
  await reset('accounts', 1000);
  const failpoint = await readFile(resolve(root, 'sql/test-failpoint.sql'), 'utf8');
  await pool.query(failpoint);
  const requestId = '50000000-0000-4000-8000-000000000005';
  const connection = await client('rollback-proof');

  try {
    await connection.query('BEGIN');
    await connection.query("SET LOCAL safe_debits.fail_ledger_insert = 'on'");

    let error;
    try {
      await connection.query('SELECT * FROM apply_debit($1, 42, 100)', [requestId]);
    } catch (caught) {
      error = caught;
    }

    assert.match(error?.message ?? '', /forced ledger failure/);
    await connection.query('ROLLBACK');
    assert.deepEqual(await countState(), { balance: '1000', request_count: 0, ledger_count: 0 });

    result('an error after the balance UPDATE rolls back the whole debit', [
      'test trigger raised “forced ledger failure” before the ledger INSERT',
      'after ROLLBACK: 0 requests, 0 ledger rows, balance 1000',
    ]);
  } finally {
    await connection.query('ROLLBACK').catch(() => {});
    await connection.end();
    await pool.query('DROP TRIGGER IF EXISTS fail_ledger_insert_for_test ON account_ledger');
    await pool.query('DROP FUNCTION IF EXISTS fail_ledger_insert_for_test()');
  }
}

async function isolationProof() {
  await reset('accounts', 1000);
  const connection = await client('isolation-proof');

  try {
    await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    let error;
    try {
      await connection.query(
        "SELECT * FROM apply_debit('60000000-0000-4000-8000-000000000006', 42, 100)",
      );
    } catch (caught) {
      error = caught;
    }
    assert.match(error?.message ?? '', /requires Read Committed/);
    await connection.query('ROLLBACK');
    assert.deepEqual(await countState(), { balance: '1000', request_count: 0, ledger_count: 0 });

    result('the example function refuses untested isolation semantics', [
      'Repeatable Read call failed with “apply_debit requires Read Committed isolation”',
      'no persistent state changed',
    ]);
  } finally {
    await connection.query('ROLLBACK').catch(() => {});
    await connection.end();
  }
}

async function walCostProof() {
  await reset('accounts', 1000);

  const guardedStart = await pool.query('SELECT pg_current_wal_insert_lsn() AS lsn');
  await pool.query(
    `UPDATE accounts
     SET balance = balance - 100
     WHERE account_id = 42 AND balance >= 100
     RETURNING balance`,
  );
  const guardedEnd = await pool.query('SELECT pg_current_wal_insert_lsn() AS lsn');
  const guardedWal = await pool.query(
    'SELECT pg_wal_lsn_diff($1, $2)::bigint::text AS bytes',
    [guardedEnd.rows[0].lsn, guardedStart.rows[0].lsn],
  );

  await reset('accounts', 1000);
  const protocolStart = await pool.query('SELECT pg_current_wal_insert_lsn() AS lsn');
  await pool.query(
    "SELECT * FROM apply_debit('80000000-0000-4000-8000-000000000008', 42, 100)",
  );
  const protocolEnd = await pool.query('SELECT pg_current_wal_insert_lsn() AS lsn');
  const protocolWal = await pool.query(
    'SELECT pg_wal_lsn_diff($1, $2)::bigint::text AS bytes',
    [protocolEnd.rows[0].lsn, protocolStart.rows[0].lsn],
  );

  const guardedBytes = BigInt(guardedWal.rows[0].bytes);
  const protocolBytes = BigInt(protocolWal.rows[0].bytes);
  assert(protocolBytes > guardedBytes);
  assert.deepEqual(await countState(), { balance: '900', request_count: 1, ledger_count: 1 });

  result('the stronger protocol performs more durable work', [
    `this isolated run inserted ${guardedBytes} WAL bytes for the guarded UPDATE`,
    `the request + UPDATE + ledger + stored outcome inserted ${protocolBytes} WAL bytes`,
    'the exact byte counts are environment-specific; the extra request and ledger rows are not free',
  ]);
}

async function main() {
  const schema = await readFile(resolve(root, 'sql/schema.sql'), 'utf8');
  await pool.query(schema);

  const version = await pool.query('SELECT version()');
  console.log(version.rows[0].version);

  const tests = [
    originalStatementProof,
    relativeUpdateProof,
    guardedConcurrencyProof,
    concurrentIdempotencyProof,
    ambiguousResponseProof,
    payloadMismatchProof,
    rejectedReplayProof,
    rejectionMatrixProof,
    rollbackProof,
    isolationProof,
    walCostProof,
  ];

  try {
    for (const test of tests) await test();
  } finally {
    await pool.end();
  }

  const generatedAt = new Date().toISOString();
  const report = [
    '# Safe SQL debit integration results',
    '',
    `Generated: ${generatedAt}`,
    '',
    `Server: ${version.rows[0].version}`,
    '',
    `Result: ${evidence.length}/${tests.length} scenarios passed.`,
    '',
    ...evidence.flatMap(({ name, details }) => [
      `## PASS — ${name}`,
      '',
      ...details.map((detail) => `- ${detail}`),
      '',
    ]),
  ].join('\n');

  await mkdir(resolve(root, 'artifacts'), { recursive: true });
  await writeFile(resolve(root, 'artifacts/test-results.md'), report);
  console.log(`\n${evidence.length}/${tests.length} integration scenarios passed.`);
}

await main();
