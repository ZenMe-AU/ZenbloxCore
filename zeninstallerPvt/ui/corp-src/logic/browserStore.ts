export function read(key: string): string | null {
  return sessionStorage.getItem(key);
}

export function write(key: string, value: string): void {
  sessionStorage.setItem(key, value);
}

export function remove(key: string): void {
  sessionStorage.removeItem(key);
}
