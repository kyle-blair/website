BEGIN;

SELECT pg_advisory_xact_lock(1785158291);

CREATE SCHEMA IF NOT EXISTS website;

CREATE TABLE IF NOT EXISTS website.counters (
    name text PRIMARY KEY,
    value bigint NOT NULL,
    CONSTRAINT counter_name_valid CHECK (
        char_length(name) BETWEEN 1 AND 512
        AND name !~ '[[:cntrl:]]'
    ),
    CONSTRAINT counter_value_valid CHECK (
        value BETWEEN 0 AND 9007199254740991
    )
);

CREATE TABLE IF NOT EXISTS website.counter_adjustments (
    operation_id uuid PRIMARY KEY,
    counter_name text NOT NULL REFERENCES website.counters (name),
    amount smallint NOT NULL CHECK (amount IN (-1, 1)),
    result bigint NOT NULL CHECK (result BETWEEN 0 AND 9007199254740991)
);

COMMIT;
