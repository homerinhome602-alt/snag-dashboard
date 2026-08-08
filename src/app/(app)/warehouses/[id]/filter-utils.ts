export function parseMulti(value: string | undefined): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}
