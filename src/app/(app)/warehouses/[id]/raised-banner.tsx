"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function RaisedBanner({ serialNo }: { serialNo: string }) {
  const [mounted, setMounted] = useState(true);
  const [exiting, setExiting] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => {
      setMounted(false);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("raised");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exiting]);

  if (!mounted) return null;

  return (
    <div
      className={`mb-3 max-h-16 overflow-hidden rounded-md border border-mint bg-mint px-3 py-2 text-[12.5px] text-mint-deep transition-all duration-300 ease-in ${
        exiting ? "max-h-0 -translate-y-2 border-0 px-3 py-0 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      Snag #{String(serialNo).padStart(3, "0")} raised.
    </div>
  );
}
