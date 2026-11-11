// Files from a drop, folders included (Chrome, Edge, Firefox and Safari all expose entries).

type Entry = FileSystemEntry & { isFile: boolean; isDirectory: boolean };

const readFile = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject));

async function readDirectory(entry: FileSystemDirectoryEntry, depth: number): Promise<File[]> {
  if (depth > 6) return [];
  const reader = entry.createReader();
  const entries: Entry[] = [];
  // readEntries returns at most 100 entries per call: keep asking until it returns none.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    entries.push(...(batch as Entry[]));
  }
  const nested = await Promise.all(entries.map((child) => walk(child, depth + 1)));
  return nested.flat();
}

async function walk(entry: Entry, depth: number): Promise<File[]> {
  if (entry.isFile) {
    if (entry.name.startsWith(".")) return [];
    try {
      return [await readFile(entry as unknown as FileSystemFileEntry)];
    } catch {
      return [];
    }
  }
  if (entry.isDirectory) return readDirectory(entry as unknown as FileSystemDirectoryEntry, depth);
  return [];
}

export async function filesFromDrop(transfer: DataTransfer | null): Promise<File[]> {
  if (!transfer) return [];
  const items = Array.from(transfer.items ?? []);
  const entries = items
    .filter((item) => item.kind === "file")
    .map((item) => (typeof item.webkitGetAsEntry === "function" ? (item.webkitGetAsEntry() as Entry | null) : null));
  if (entries.length > 0 && entries.every(Boolean)) {
    const found = await Promise.all(entries.map((entry) => walk(entry as Entry, 0)));
    return found.flat();
  }
  return Array.from(transfer.files ?? []);
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
