import pg, { Pool } from "pg";

// PostgREST handed the app JSON: dates as "YYYY-MM-DD" strings, timestamps as
// ISO strings, bigint as a number-ish value. node-postgres parses these into
// Date objects / strings by default, which breaks code like
// snapshot_date.localeCompare(...) and `go_live_date + "T00:00:00"`. Re-map the
// parsers so rows look the way the app already expects.
pg.types.setTypeParser(1082, (v) => v); // date        -> 'YYYY-MM-DD'
pg.types.setTypeParser(1114, (v) => (v == null ? v : new Date(v + "Z").toISOString())); // timestamp
pg.types.setTypeParser(1184, (v) => (v == null ? v : new Date(v).toISOString())); // timestamptz
pg.types.setTypeParser(20, (v) => (v == null ? v : Number(v))); // int8/bigint

const globalForPg = globalThis as unknown as { __snagPool?: Pool };

export const pool =
  globalForPg.__snagPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") globalForPg.__snagPool = pool;
