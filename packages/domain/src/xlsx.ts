import { DomainError } from "./errors";
/**
 * Übernommen aus Turmstatus (packages/domain/src/xlsx.ts).
 * Schlanke Lesehilfe für Wachplan-Tabellen: ZIP-Verzeichnis, `deflate-raw` über die
 * native Stream-API und eine bewusst begrenzte XML-Auswertung. Kein Netzzugriff,
 * keine Fremdbibliothek, keine Ausführung von Makros oder Formeln.
 */
const textDecoder = new TextDecoder("utf-8");
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
function fail(message: string): never {
  throw new DomainError("INVALID_INPUT", message);
}
/** Das End-of-Central-Directory steht am Dateiende und darf einen Kommentar hinter sich haben. */
function endOfCentralDirectory(bytes: Uint8Array) {
  const data = view(bytes);
  const earliest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let at = bytes.length - 22; at >= earliest; at--)
    if (data.getUint32(at, true) === 0x06054b50)
      return {
        entries: data.getUint16(at + 10, true),
        size: data.getUint32(at + 12, true),
        offset: data.getUint32(at + 16, true),
      };
  return fail("Die Datei ist kein lesbares XLSX-Paket. Bitte als CSV speichern.");
}
/** Nur Streams und keine Blob-/Response-Hilfen: dieselbe Routine läuft im Browser und im Test. */
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  const pump = (async () => {
    await writer.write(new Uint8Array(bytes));
    await writer.close();
  })();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await pump;
  const result = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}
/** Nur „gespeichert“ und „deflate“ kommen in Tabellenpaketen vor; alles andere wird abgelehnt. */
export async function readZipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (bytes.length < 22) return fail("Die Datei ist leer oder abgeschnitten.");
  const directory = endOfCentralDirectory(bytes);
  if (directory.offset + directory.size > bytes.length)
    return fail("Das XLSX-Paket ist unvollständig oder beschädigt.");
  const data = view(bytes);
  const entries = new Map<string, Uint8Array>();
  let at = directory.offset;
  for (let index = 0; index < directory.entries; index++) {
    if (at + 46 > bytes.length || data.getUint32(at, true) !== 0x02014b50)
      return fail("Das XLSX-Verzeichnis ist beschädigt.");
    const method = data.getUint16(at + 10, true);
    const compressed = data.getUint32(at + 20, true);
    const nameLength = data.getUint16(at + 28, true);
    const extraLength = data.getUint16(at + 30, true);
    const commentLength = data.getUint16(at + 32, true);
    const localOffset = data.getUint32(at + 42, true);
    const name = textDecoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (localOffset + 30 > bytes.length) return fail("Ein XLSX-Eintrag verweist außerhalb der Datei.");
    const body = localOffset + 30 + data.getUint16(localOffset + 26, true) + data.getUint16(localOffset + 28, true);
    if (body + compressed > bytes.length) return fail("Ein XLSX-Eintrag ist abgeschnitten.");
    const raw = bytes.subarray(body, body + compressed);
    if (method === 0) entries.set(name, raw);
    else if (method === 8) entries.set(name, await inflateRaw(raw));
    else fail("Das XLSX-Paket verwendet ein nicht unterstütztes Packverfahren.");
  }
  return entries;
}
const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
export function decodeXmlText(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) =>
    code.startsWith("#")
      ? String.fromCodePoint(
          Number.parseInt(
            code.startsWith("#x") || code.startsWith("#X") ? code.slice(2) : code.slice(1),
            code.startsWith("#x") || code.startsWith("#X") ? 16 : 10,
          ),
        )
      : (entities[code] ?? match),
  );
}
function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? decodeXmlText(match[1]!) : undefined;
}
/** `<si>` darf mehrere `<t>`-Abschnitte enthalten; Ruby- und Phonetikteile bleiben außen vor. */
function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g)].map((item) =>
    [...(item[1] ?? "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)]
      .map((text) => decodeXmlText(text[1] ?? ""))
      .join(""),
  );
}
/** Spaltenbuchstaben bleiben erhalten, weil leere Zellen im XML einfach fehlen. */
export function columnIndex(reference: string): number {
  const letters = /^([A-Z]+)/.exec(reference.toUpperCase())?.[1];
  if (!letters) return fail("Ungültiger Zellbezug in der Tabelle.");
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}
function cellValue(tag: string, body: string, strings: string[]): string {
  const type = attribute(tag, "t") ?? "n";
  if (type === "inlineStr")
    return [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((text) => decodeXmlText(text[1]!)).join("");
  const raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1];
  if (raw === undefined) return "";
  const value = decodeXmlText(raw);
  if (type !== "s") return value;
  const index = Number.parseInt(value, 10);
  return strings[index] ?? "";
}
function sheetRows(xml: string, strings: string[]): string[][] {
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>|<row\s[^>]*\/>/g)) {
    const cells: string[] = [];
    for (const cell of (row[1] ?? "").matchAll(/<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const reference = attribute(cell[1] ?? "", "r");
      const at = reference ? columnIndex(reference) : cells.length;
      while (cells.length < at) cells.push("");
      cells[at] = cellValue(cell[1] ?? "", cell[2] ?? "", strings);
    }
    rows.push(cells);
  }
  return rows;
}
export type Worksheet = { name: string; rows: string[][] };
/** Liest nur Blattnamen und Zellinhalte; Makros, Formeln und Formate bleiben unangetastet. */
export async function readWorkbook(bytes: Uint8Array): Promise<Worksheet[]> {
  const entries = await readZipEntries(bytes);
  const text = (name: string) => {
    const value = entries.get(name);
    return value === undefined ? undefined : textDecoder.decode(value);
  };
  const workbook = text("xl/workbook.xml");
  if (!workbook) return fail("Die Datei enthält keine Arbeitsmappe. Bitte als CSV speichern.");
  const targets = new Map<string, string>();
  for (const relation of (text("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\s[^>]*\/>/g)) {
    const id = attribute(relation[0], "Id");
    const target = attribute(relation[0], "Target");
    if (id && target) targets.set(id, target.replace(/^\/?(xl\/)?/, "").replace(/^\.\//, ""));
  }
  const strings = sharedStrings(text("xl/sharedStrings.xml"));
  const sheets: Worksheet[] = [];
  for (const [index, sheet] of [...workbook.matchAll(/<sheet\s[^>]*\/>/g)].entries()) {
    const id = attribute(sheet[0], "r:id") ?? attribute(sheet[0], "id");
    const path = (id && targets.get(id)) ?? `worksheets/sheet${index + 1}.xml`;
    const xml = text(`xl/${path}`);
    if (xml === undefined) continue;
    sheets.push({
      name: attribute(sheet[0], "name") ?? `Tabelle${index + 1}`,
      rows: sheetRows(xml, strings),
    });
  }
  if (!sheets.length) return fail("Die Arbeitsmappe enthält kein lesbares Tabellenblatt.");
  return sheets;
}
