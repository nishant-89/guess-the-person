/**
 * fetch-images.mjs
 * -----------------------------------------------------------------------
 * Populates `imageUrl` in data/persons.json with real, verified portrait
 * images sourced live from Wikipedia's public REST API — no guessed or
 * fabricated URLs.
 *
 * WHY THIS EXISTS: reliably resolving the correct upload.wikimedia.org
 * URL for 100 people requires querying Wikipedia's API per person (the
 * rendered article HTML doesn't expose it in a scrapeable way). This
 * script does that properly, using Wikipedia's own summary endpoint,
 * which returns the current infobox image for a given article title.
 *
 * USAGE:
 *   node scripts/fetch-images.mjs
 *
 * Requires Node 18+ (built-in fetch). Run from the project root so the
 * relative path to data/persons.json resolves correctly.
 *
 * Safe to re-run: it only overwrites entries that still have the
 * PLACEHOLDER_WIKIMEDIA_URL value, unless --force is passed.
 * -----------------------------------------------------------------------
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "persons.json");
const FORCE = process.argv.includes("--force");

// Wikipedia article title overrides — only needed where it differs from
// the display name used in persons.json (disambiguation, formatting, etc.)
const WIKI_TITLE_OVERRIDES = {
  person_002: "MS Dhoni",
  person_003: "Viswanathan Anand",
  person_021: "Elizabeth II",
  person_032: "A. R. Rahman",
  person_036: "P. V. Sindhu",
  person_050: "A. P. J. Abdul Kalam",
  person_051: "B. R. Ambedkar",
  person_058: "14th Dalai Lama",
  person_067: "J. K. Rowling"
};

async function fetchSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "GuessThePersonGame/1.0 (educational project)" }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for "${title}"`);
  }
  return res.json();
}

async function main() {
  const raw = await readFile(DATA_PATH, "utf-8");
  const persons = JSON.parse(raw);

  const results = { updated: [], skipped: [], failed: [] };

  for (const person of persons) {
    const alreadySet = person.imageUrl && person.imageUrl !== "PLACEHOLDER_WIKIMEDIA_URL";
    if (alreadySet && !FORCE) {
      results.skipped.push(person.name);
      continue;
    }

    const title = WIKI_TITLE_OVERRIDES[person._id] || person.name;
    try {
      const summary = await fetchSummary(title);
      // originalimage is full-res; thumbnail is pre-sized (usually ~300-500px wide).
      // Thumbnail is preferable here since it's lighter for a web page.
      const imageUrl = summary.thumbnail?.source || summary.originalimage?.source;
      if (!imageUrl) {
        results.failed.push({ name: person.name, title, reason: "No image on Wikipedia summary" });
        continue;
      }
      person.imageUrl = imageUrl;
      results.updated.push(person.name);
    } catch (err) {
      results.failed.push({ name: person.name, title, reason: err.message });
    }

    // Be polite to Wikipedia's API — small delay between requests.
    await new Promise((r) => setTimeout(r, 200));
  }

  await writeFile(DATA_PATH, JSON.stringify(persons, null, 2), "utf-8");

  console.log(`\nUpdated: ${results.updated.length}`);
  console.log(`Skipped (already set): ${results.skipped.length}`);
  console.log(`Failed: ${results.failed.length}`);
  if (results.failed.length) {
    console.log("\nFailed entries (fix these manually):");
    results.failed.forEach((f) => console.log(`  - ${f.name} (tried "${f.title}"): ${f.reason}`));
  }
  console.log(`\nWrote updates to ${DATA_PATH}`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
