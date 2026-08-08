import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Shared hover-lift treatment for card-style tiles (dashboard summary
// cards, warehouse cards, readiness tiles) so the pop-out feel is
// consistent everywhere it's applied.
export const CARD_HOVER = "transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md"
