import { deflateRawSync } from "node:zlib";

/** Synthetische ZIP-/XLSX-Pakete für Tests (aus Turmstatus übernommen). */
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};
/** Baut synthetische Pakete, um Packverfahren und beschädigte Verzeichnisse zu prüfen. */
export function zip(files: Record<string, string>, options: { method?: number; comment?: string } = {}): Uint8Array {
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = new TextEncoder().encode(content);
    const method = options.method ?? 8;
    const packed = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;
    const nameBytes = new TextEncoder().encode(name);
    const local = new Uint8Array(30);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, crc32(raw), true);
    localView.setUint32(18, packed.length, true);
    localView.setUint32(22, raw.length, true);
    localView.setUint16(26, nameBytes.length, true);
    parts.push(local, nameBytes, packed);
    const entry = new Uint8Array(46);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(10, method, true);
    entryView.setUint32(16, crc32(raw), true);
    entryView.setUint32(20, packed.length, true);
    entryView.setUint32(24, raw.length, true);
    entryView.setUint16(28, nameBytes.length, true);
    entryView.setUint32(42, offset, true);
    directory.push(entry, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const central = directory.reduce<number>((sum, part) => sum + part.length, 0);
  const comment = new TextEncoder().encode(options.comment ?? "");
  const end = new Uint8Array(22 + comment.length);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, Object.keys(files).length, true);
  endView.setUint16(10, Object.keys(files).length, true);
  endView.setUint32(12, central, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, comment.length, true);
  end.set(comment, 22);
  const all = [...parts, ...directory, end];
  const result = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) {
    result.set(part, at);
    at += part.length;
  }
  return result;
}
