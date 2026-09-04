/* eslint-disable @typescript-eslint/no-explicit-any */
// The app has no generated database types, so the old untyped supabase-js
// client already returned effectively `any`-shaped rows. Matching that keeps
// every existing call site and its `as` casts working unchanged.
import type { PoolClient } from "pg";

// Runs a callback with a scoped pool client (role + JWT-claims GUC already set).
export type Runner = <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;

// A very small subset of the PostgREST / supabase-js query surface — only the
// shapes this app actually uses (see the .select() strings across src/app).
// One level of belongs-to embeds is supported via an explicit FK map, since
// this app's alias names don't map 1:1 to their foreign-key column.

export type PgRestError = { message: string; code?: string } | null;
export type PgRestResult<T> = { data: T; error: PgRestError };

const EMBED_FK: Record<string, string> = {
  "snag_updates.author": "author_id",
  "snag_activity.actor": "actor_id",
  "warehouse_activity.actor": "actor_id",
  "people_activity.actor": "actor_id",
  "warehouse_members.profile": "user_id",
  "warehouse_members.warehouse": "warehouse_id",
  "snags.raised_by_profile": "raised_by",
  "warehouse_asset_activity.actor": "actor_id",
};

type Embed = { alias: string; target: string; cols: string[] };
type Parsed = { cols: string[]; embeds: Embed[] };

function parseSelect(sel: string): Parsed {
  const cols: string[] = [];
  const embeds: Embed[] = [];
  // split on top-level commas
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of sel) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) parts.push(buf);

  for (const raw of parts) {
    const token = raw.trim();
    if (!token) continue;
    const m = token.match(/^([\w]+):([\w]+)(?:!([\w]+))?\(([^)]*)\)$/);
    if (m) {
      embeds.push({
        alias: m[1],
        target: m[2],
        cols: m[4].split(",").map((c) => c.trim()).filter(Boolean),
      });
    } else {
      cols.push(token);
    }
  }
  return { cols, embeds };
}

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`unsafe identifier: ${name}`);
  return `"${name}"`;
}

type Filter =
  | { kind: "eq"; col: string; val: unknown }
  | { kind: "in"; col: string; val: unknown[] }
  | { kind: "ilike"; col: string; val: string };

type Order = { col: string; ascending: boolean };

export class QueryBuilder<Row = any> implements PromiseLike<PgRestResult<Row[]>> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private selectStr = "*";
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitN: number | null = null;
  private rows: Record<string, unknown>[] = [];
  private patch: Record<string, unknown> | null = null;
  private onConflict: string | null = null;
  private returning = false;

  constructor(
    private runner: Runner,
    private table: string
  ) {}

  select(str = "*"): this {
    if (this.op === "select") this.selectStr = str || "*";
    else this.returning = true;
    return this;
  }

  insert(rows: Record<string, unknown> | Record<string, unknown>[]): this {
    this.op = "insert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  upsert(
    rows: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string }
  ): this {
    this.op = "upsert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    this.onConflict = opts?.onConflict ?? null;
    return this;
  }

  update(patch: Record<string, unknown>): this {
    this.op = "update";
    this.patch = patch;
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  eq(col: string, val: unknown): this {
    this.filters.push({ kind: "eq", col, val });
    return this;
  }

  in(col: string, val: unknown[]): this {
    this.filters.push({ kind: "in", col, val });
    return this;
  }

  ilike(col: string, val: string): this {
    this.filters.push({ kind: "ilike", col, val });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, ascending: opts?.ascending !== false });
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  // ---- terminal helpers -------------------------------------------------

  async single(): Promise<PgRestResult<Row>> {
    const { data, error } = await this.run();
    if (error) return { data: null as Row, error };
    if (!data || data.length !== 1) {
      return {
        data: null as Row,
        error: { message: `expected exactly one row, got ${data?.length ?? 0}` },
      };
    }
    return { data: data[0], error: null };
  }

  async maybeSingle(): Promise<PgRestResult<Row | null>> {
    const { data, error } = await this.run();
    if (error) return { data: null, error };
    return { data: data && data.length ? data[0] : null, error: null };
  }

  then<TResult1 = PgRestResult<Row[]>, TResult2 = never>(
    onfulfilled?: ((value: PgRestResult<Row[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  // ---- SQL ------------------------------------------------------------

  private whereClause(params: unknown[]): string {
    if (!this.filters.length) return "";
    const parts = this.filters.map((f) => {
      if (f.kind === "eq") {
        params.push(f.val);
        return `${ident(f.col)} = $${params.length}`;
      }
      if (f.kind === "in") {
        params.push(f.val);
        return `${ident(f.col)} = any($${params.length})`;
      }
      params.push(f.val);
      return `${ident(f.col)} ilike $${params.length}`;
    });
    return " where " + parts.join(" and ");
  }

  private buildSelectSql(params: unknown[]): string {
    const { cols, embeds } = parseSelect(this.selectStr);
    const projbuilt: string[] = [];
    if (this.selectStr.trim() === "*" || cols.includes("*")) {
      projbuilt.push("t.*");
    } else {
      for (const c of cols) projbuilt.push(`t.${ident(c)}`);
    }
    for (const e of embeds) {
      const fk = EMBED_FK[`${this.table}.${e.alias}`];
      if (!fk) throw new Error(`no FK mapping for embed ${this.table}.${e.alias}`);
      const inner = e.cols.map(ident).join(", ");
      projbuilt.push(
        `(select row_to_json(_e) from (select ${inner} from ${ident(e.target)} where ${ident(
          e.target
        )}."id" = t.${ident(fk)}) _e) as ${ident(e.alias)}`
      );
    }
    let sql = `select ${projbuilt.join(", ")} from ${ident(this.table)} t`;
    sql += this.whereClause(params);
    if (this.orders.length) {
      sql +=
        " order by " +
        this.orders.map((o) => `t.${ident(o.col)} ${o.ascending ? "asc" : "desc"}`).join(", ");
    }
    if (this.limitN != null) sql += ` limit ${this.limitN}`;
    return sql;
  }

  private buildWriteSql(params: unknown[]): string {
    if (this.op === "insert" || this.op === "upsert") {
      const keys = Array.from(new Set(this.rows.flatMap((r) => Object.keys(r))));
      const valuesSql = this.rows
        .map(
          (r) =>
            "(" +
            keys
              .map((k) => {
                params.push(k in r ? r[k] : null);
                return `$${params.length}`;
              })
              .join(", ") +
            ")"
        )
        .join(", ");
      let sql = `insert into ${ident(this.table)} (${keys.map(ident).join(", ")}) values ${valuesSql}`;
      if (this.op === "upsert" && this.onConflict) {
        const conflictCols = this.onConflict.split(",").map((c) => ident(c.trim())).join(", ");
        const setList = keys
          .filter((k) => !this.onConflict!.split(",").map((c) => c.trim()).includes(k))
          .map((k) => `${ident(k)} = excluded.${ident(k)}`)
          .join(", ");
        sql += ` on conflict (${conflictCols}) do update set ${setList || `${ident(keys[0])} = excluded.${ident(keys[0])}`}`;
      } else if (this.op === "upsert") {
        sql += " on conflict do nothing";
      }
      if (this.returning) sql += " returning *";
      return sql;
    }
    if (this.op === "update") {
      const keys = Object.keys(this.patch ?? {});
      const setList = keys
        .map((k) => {
          params.push(this.patch![k]);
          return `${ident(k)} = $${params.length}`;
        })
        .join(", ");
      let sql = `update ${ident(this.table)} t set ${setList}` + this.whereClause(params);
      if (this.returning) sql += " returning *";
      return sql;
    }
    // delete
    let sql = `delete from ${ident(this.table)} t` + this.whereClause(params);
    if (this.returning) sql += " returning *";
    return sql;
  }

  private async run(): Promise<PgRestResult<Row[]>> {
    const params: unknown[] = [];
    try {
      const sql =
        this.op === "select" ? this.buildSelectSql(params) : this.buildWriteSql(params);
      const res = await this.runner((c) => c.query(sql, params));
      return { data: res.rows as Row[], error: null };
    } catch (e) {
      const err = e as { message?: string; code?: string };
      return { data: null as unknown as Row[], error: { message: err.message ?? String(e), code: err.code } };
    }
  }
}

export class RpcBuilder implements PromiseLike<PgRestResult<unknown>> {
  private wantSelect = false;

  constructor(
    private runner: Runner,
    private fn: string,
    private args: Record<string, unknown>
  ) {}

  select(): this {
    this.wantSelect = true;
    return this;
  }

  async single(): Promise<PgRestResult<unknown>> {
    const { data, error } = await this.exec();
    if (error) return { data: null, error };
    const rows = data as unknown[];
    if (!rows || rows.length !== 1) {
      return { data: null, error: { message: `expected one row, got ${rows?.length ?? 0}` } };
    }
    return { data: rows[0], error: null };
  }

  then<TResult1 = PgRestResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: PgRestResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }

  private async exec(): Promise<PgRestResult<unknown>> {
    const keys = Object.keys(this.args);
    const params = keys.map((k) => this.args[k]);
    const named = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
    if (!/^[a-z_][a-z0-9_]*$/i.test(this.fn)) {
      return { data: null, error: { message: `unsafe function name: ${this.fn}` } };
    }
    try {
      const res = await this.runner((c) => c.query(`select * from ${this.fn}(${named})`, params));
      return { data: res.rows, error: null };
    } catch (e) {
      const err = e as { message?: string; code?: string };
      return { data: null, error: { message: err.message ?? String(e), code: err.code } };
    }
  }
}
