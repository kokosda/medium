CREATE OR REPLACE FUNCTION fail_ledger_insert_for_test()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_setting('safe_debits.fail_ledger_insert', true) = 'on' THEN
        RAISE EXCEPTION 'forced ledger failure';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER fail_ledger_insert_for_test
BEFORE INSERT ON account_ledger
FOR EACH ROW
EXECUTE FUNCTION fail_ledger_insert_for_test();
