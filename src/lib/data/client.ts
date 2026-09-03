// Browser-side stand-in for the old Supabase client. The browser has no direct
// database access, so the few things client components need go through API
// routes: auth.getUser -> /api/me, rpc -> /api/rpc, uploads -> /api/attachments
// (handled inside lib/media.ts, not here).

type Result<T> = { data: T; error: { message: string } | null };

class ClientRpc {
  private args: Record<string, unknown>;
  constructor(private fn: string, args: Record<string, unknown>) {
    this.args = args;
  }
  select(): this {
    return this;
  }
  async single(): Promise<Result<unknown>> {
    const { data, error } = await this.exec();
    if (error) return { data: null, error };
    const row = Array.isArray(data) ? data[0] ?? null : data;
    return { data: row, error: null };
  }
  then<R1 = Result<unknown>, R2 = never>(
    onfulfilled?: ((v: Result<unknown>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.exec().then(onfulfilled, onrejected);
  }
  private async exec(): Promise<Result<unknown>> {
    try {
      const res = await fetch("/api/rpc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fn: this.fn, args: this.args }),
      });
      const json = await res.json();
      if (!res.ok) return { data: null, error: { message: json?.error?.message ?? res.statusText } };
      return { data: json.data ?? null, error: json.error ?? null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  }
}

export function createClient() {
  return {
    auth: {
      async getUser() {
        try {
          const res = await fetch("/api/me", { cache: "no-store" });
          const json = await res.json();
          return { data: { user: json.user ?? null }, error: null };
        } catch {
          return { data: { user: null }, error: null };
        }
      },
    },
    rpc(fn: string, args: Record<string, unknown> = {}) {
      return new ClientRpc(fn, args);
    },
  };
}
