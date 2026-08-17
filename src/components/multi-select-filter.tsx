"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  className,
  emptySuffix = ": All",
  onSelectAll,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
  // Table filters read correctly as "Status: All" when nothing's picked —
  // no filter means every row matches. That's not true everywhere this
  // component is reused (e.g. an invite form, where nothing picked means
  // no warehouse tag at all, not "all warehouses") — callers there should
  // pass "" so the button just reads as a plain placeholder.
  emptySuffix?: string;
  // Opt-in "select everything" shortcut, styled and positioned like Clear
  // rather than as one more checkbox in the list — it's a bulk action on
  // the selection, not itself a selectable value.
  onSelectAll?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Rendered through a portal (below) rather than as a normal absolutely-
  // positioned child — this component gets used inside containers that
  // clip overflow for rounded corners (e.g. the People table), which would
  // otherwise cut the open dropdown off instead of letting it float over
  // the page.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function updatePosition() {
      const rect = triggerRef.current!.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md border px-2 py-1 text-[11.5px] font-medium ${
          selected.length > 0
            ? "border-primary bg-accent text-accent-foreground"
            : "border-teal bg-frost text-teal-deep"
        } ${className ?? ""}`}
      >
        {label}
        {selected.length > 0 ? ` (${selected.length})` : emptySuffix}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: position.top, left: position.left, minWidth: position.width }}
            className="fixed z-50 max-h-56 w-44 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-md"
          >
            {onSelectAll && selected.length < options.length && (
              <button
                type="button"
                onClick={onSelectAll}
                className="w-full px-2.5 py-1 text-left text-[11px] text-primary hover:bg-muted"
              >
                All
              </button>
            )}
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full px-2.5 py-1 text-left text-[11px] text-primary hover:bg-muted"
              >
                Clear
              </button>
            )}
            {options.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12px] hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                  className="accent-primary"
                />
                {o.label}
              </label>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
