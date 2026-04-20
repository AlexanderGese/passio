import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(cents: number, currency = "usd"): string {
  if (cents === 0) return "Free";
  const amount = cents / 100;
  const symbol = currency === "usd" ? "$" : currency.toUpperCase() + " ";
  return `${symbol}${amount.toFixed(2).replace(/\.00$/, "")}`;
}
