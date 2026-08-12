DROP TABLE IF EXISTS account_ledger CASCADE;
DROP TABLE IF EXISTS debit_requests CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS unguarded_accounts CASCADE;

-- This control table exists only to demonstrate what the original statement
-- does without a domain constraint or balance predicate.
CREATE TABLE unguarded_accounts
(
    account_id bigint  PRIMARY KEY,
    balance    numeric NOT NULL
);

CREATE TABLE accounts
(
    account_id bigint  PRIMARY KEY,
    balance    numeric NOT NULL,

    CONSTRAINT accounts_balance_nonnegative
        CHECK (balance >= 0)
);

CREATE TABLE debit_requests
(
    request_id       uuid        PRIMARY KEY,
    account_id       bigint      NOT NULL,
    amount           numeric     NOT NULL,
    status           text        NOT NULL,
    balance_after    numeric,
    rejection_reason text,
    created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
    completed_at     timestamptz,

    CONSTRAINT debit_requests_status_valid
        CHECK (status IN ('pending', 'applied', 'rejected')),

    CONSTRAINT debit_requests_result_valid
        CHECK
        (
            (status = 'pending'
                AND balance_after IS NULL
                AND rejection_reason IS NULL
                AND completed_at IS NULL)
            OR
            (status = 'applied'
                AND balance_after IS NOT NULL
                AND rejection_reason IS NULL
                AND completed_at IS NOT NULL)
            OR
            (status = 'rejected'
                AND balance_after IS NULL
                AND rejection_reason IS NOT NULL
                AND completed_at IS NOT NULL)
        )
);

CREATE TABLE account_ledger
(
    ledger_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id    uuid        NOT NULL UNIQUE
                              REFERENCES debit_requests (request_id),
    account_id    bigint      NOT NULL
                              REFERENCES accounts (account_id),
    amount_delta  numeric     NOT NULL CHECK (amount_delta < 0),
    balance_after numeric     NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION apply_debit
(
    p_request_id uuid,
    p_account_id bigint,
    p_amount     numeric
)
RETURNS TABLE
(
    result_status           text,
    result_balance_after    numeric,
    result_rejection_reason text
)
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    v_inserted_id uuid;
    v_existing    debit_requests%ROWTYPE;
    v_balance     numeric;
    v_reason      text;
BEGIN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'apply_debit requires Read Committed isolation';
    END IF;

    IF p_request_id IS NULL
       OR p_account_id IS NULL
       OR p_amount IS NULL THEN
        RAISE EXCEPTION 'request_id, account_id, and amount are required'
            USING ERRCODE = '22004';
    END IF;

    LOOP
        SELECT *
        INTO v_existing
        FROM debit_requests
        WHERE request_id = p_request_id
        FOR UPDATE;

        IF FOUND THEN
            IF v_existing.account_id IS DISTINCT FROM p_account_id
               OR v_existing.amount IS DISTINCT FROM p_amount THEN
                RAISE EXCEPTION
                    'request_id was already used with a different payload'
                    USING ERRCODE = '22023';
            END IF;

            IF v_existing.status = 'pending' THEN
                RAISE EXCEPTION 'request_id has no completed outcome';
            END IF;

            RETURN QUERY
            SELECT
                v_existing.status,
                v_existing.balance_after,
                v_existing.rejection_reason;
            RETURN;
        END IF;

        v_inserted_id := NULL;

        INSERT INTO debit_requests
            (request_id, account_id, amount, status)
        VALUES
            (p_request_id, p_account_id, p_amount, 'pending')
        ON CONFLICT (request_id) DO NOTHING
        RETURNING request_id INTO v_inserted_id;

        EXIT WHEN v_inserted_id IS NOT NULL;

        -- A concurrent insert won. At Read Committed, the next command
        -- gets a fresh snapshot and can load its committed outcome.
    END LOOP;

    IF p_amount <= 0 THEN
        v_reason := 'invalid_amount';
    ELSE
        UPDATE accounts AS a
        SET balance = a.balance - p_amount
        WHERE a.account_id = p_account_id
          AND a.balance >= p_amount
        RETURNING a.balance INTO v_balance;

        IF FOUND THEN
            INSERT INTO account_ledger
                (request_id, account_id, amount_delta, balance_after)
            VALUES
                (p_request_id, p_account_id, -p_amount, v_balance);

            UPDATE debit_requests
            SET status = 'applied',
                balance_after = v_balance,
                completed_at = clock_timestamp()
            WHERE request_id = p_request_id;

            RETURN QUERY
            SELECT 'applied'::text, v_balance, NULL::text;
            RETURN;
        END IF;

        v_reason := 'not_applied';
    END IF;

    UPDATE debit_requests
    SET status = 'rejected',
        rejection_reason = v_reason,
        completed_at = clock_timestamp()
    WHERE request_id = p_request_id;

    RETURN QUERY
    SELECT 'rejected'::text, NULL::numeric, v_reason;
END;
$$;
