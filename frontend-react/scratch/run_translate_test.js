// temporary script to test TranslateMapTool on all images in input folder
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

import { remasterMapLocally } from '../src/lib/localMap.js';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';


// Resolve project root (two levels up from this script)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..'); // C:\Projek\ProjekAyah
const inputDir = resolve(projectRoot, 'input');   // C:\Projek\ProjekAyah\input
const outputDir = resolve(projectRoot, 'output'); // C:\Projek\ProjekAyah\output

import { mkdirSync } from 'node:fs';
mkdirSync(outputDir, { recursive: true });

async function processFile(filePath) {
  const file = new Uint8Array(readFileSync(filePath));
  // Node's File API: we need a Blob. Use Buffer-to-Blob via Blob constructor (available in Node >=15?)
  const blob = new Blob([file]);
  try {
    const { blob: outBlob } = await remasterMapLocally(blob, () => {}, {});
    const buf = Buffer.from(await outBlob.arrayBuffer());
    const outPath = join(outputDir, `${filePath.split('\\').pop().replace(/\.[^.]+$/, '')}_translated.jpg`);
    writeFileSync(outPath, buf);
    console.log('Translated', filePath, '->', outPath);
  } catch (e) {
    console.error('Error processing', filePath, e);
  }
}

async function main() {
  const files = readdirSync(inputDir).filter(f => f.match(/\.(png|jpg|jpeg|webp)$/i));
  for (const f of files) {
    await processFile(join(inputDir, f));
  }
}

main();
