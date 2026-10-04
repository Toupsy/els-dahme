// Erzeugt den Wert für PASSCODE_HASH (scrypt). Der Passcode selbst wird nirgends gespeichert.
// Aufruf: pnpm hash-passcode            (fragt nach dem Passcode)
//         echo -n "code" | pnpm hash-passcode
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

async function readPasscode() {
  if (process.argv[2]) return process.argv[2];
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    return input.replace(/\r?\n$/, "");
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise((resolve) => rl.question("Passcode: ", resolve));
  rl.close();
  return answer;
}

const passcode = await readPasscode();
if (passcode.length < 8) {
  console.error("Der Passcode muss mindestens 8 Zeichen haben.");
  process.exit(1);
}
const [N, r, p] = [16384, 8, 1];
const salt = randomBytes(16);
const hash = scryptSync(passcode.normalize("NFC"), salt, 32, { N, r, p });
console.log(`PASSCODE_HASH=scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${hash.toString("base64")}`);
