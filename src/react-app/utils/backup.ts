export interface BackupEntry<T = unknown> {
  id: string;
  createdAt: string; // ISO
  data: T;
}

const STORAGE_KEY = 'airtrust.backups';

function loadAllBackups<T>(): BackupEntry<T>[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BackupEntry<T>[];
  } catch {
    return [];
  }
}

function saveAllBackups<T>(entries: BackupEntry<T>[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function createBackup<T>(data: T): BackupEntry<T> {
  const entry: BackupEntry<T> = {
    id: `${Date.now()}`,
    createdAt: new Date().toISOString(),
    data
  };
  const all = loadAllBackups<T>();
  all.unshift(entry);
  saveAllBackups(all);
  return entry;
}

export function listBackups<T>(): BackupEntry<T>[] {
  return loadAllBackups<T>();
}

export function restoreBackup<T>(id: string): T | null {
  const all = loadAllBackups<T>();
  const found = all.find(b => b.id === id);
  return found ? found.data : null;
}

export function deleteBackup(id: string): void {
  const all = loadAllBackups();
  const filtered = all.filter(b => b.id !== id);
  saveAllBackups(filtered);
}

export function cleanupOldBackups(days: number = 30): void {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const all = loadAllBackups();
  const filtered = all.filter(b => new Date(b.createdAt).getTime() >= cutoff);
  saveAllBackups(filtered);
}

