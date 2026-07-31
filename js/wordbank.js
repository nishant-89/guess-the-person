/**
 * wordbank.js
 * -----------------------------------------------------------------------
 * Adjective/noun lists + codename generator for the landing screen.
 * Isolated so it can later move server-side (e.g. a NestJS endpoint
 * `GET /api/codename`) if you want guaranteed-unique names across users,
 * without touching any other module.
 * -----------------------------------------------------------------------
 */

const ADJECTIVES = [
  "solar", "panda", "nighty", "quiet", "rusty", "lucky", "cosmic", "velvet",
  "shadow", "electric", "frosty", "amber", "stormy", "golden", "silent",
  "wandering", "crimson", "silver", "tiny", "brave", "lazy", "mellow",
  "rapid", "hollow", "glowing", "dusty", "quirky", "bold"
];

const NOUNS = [
  "shuttle", "boy", "owl", "fox", "otter", "comet", "falcon", "panther",
  "wolf", "sparrow", "tiger", "raven", "badger", "lynx", "heron", "viper",
  "hawk", "turtle", "koala", "mongoose", "cricket", "beetle", "dragon",
  "phantom", "rocket", "compass", "lantern", "anchor"
];

export function generateCodename() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a}-${n}`;
}
