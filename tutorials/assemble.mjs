// Joins the encoded parts of a film into one MP4 with one captions file.
//
//   node tutorials/assemble.mjs <prefix> <name>
//   node tutorials/assemble.mjs video- hermes-crm-video-principal
//
// Takes every tutorials/.output/<slug>/video.mp4 whose slug starts with
// <prefix>, in name order, and writes tutorials/.output/<name>.mp4 and
// <name>.vtt. Run `encode.mjs` first: the parts are copied, not re-encoded,
// which only works because `encode.mjs` gave them all the same settings.
//
// The captions of each part are shifted by the measured length of the parts
// before it (ffprobe), not by `meta.json`, whose whole seconds would drift.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".output",
);

const [prefix, name] = process.argv.slice(2);
if (!prefix || !name) {
  console.error("usage: node tutorials/assemble.mjs <prefix> <name>");
  process.exit(1);
}

const slugs = readdirSync(OUTPUT_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
  .map((entry) => entry.name)
  .filter((slug) => existsSync(path.join(OUTPUT_DIR, slug, "video.mp4")))
  .sort();
if (slugs.length === 0) {
  console.error(`No encoded part starts with "${prefix}".`);
  process.exit(1);
}

const seconds = (file) => {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      file,
    ],
    { encoding: "utf8" },
  );
  if (probe.status !== 0) throw new Error(`ffprobe failed on ${file}`);
  return Number(probe.stdout.trim());
};

const toMs = (stamp) => {
  const [h, m, s] = stamp.split(":");
  return Math.round((Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000);
};
const toStamp = (ms) => {
  const part = (value, size = 2) => String(value).padStart(size, "0");
  return `${part(Math.floor(ms / 3_600_000))}:${part(
    Math.floor(ms / 60_000) % 60,
  )}:${part(Math.floor(ms / 1000) % 60)}.${part(ms % 1000, 3)}`;
};

const cues = [];
const list = [];
let offset = 0;
for (const slug of slugs) {
  const video = path.join(OUTPUT_DIR, slug, "video.mp4");
  list.push(`file '${video.replaceAll("\\", "/")}'`);
  const captions = path.join(OUTPUT_DIR, slug, "captions.vtt");
  if (existsSync(captions)) {
    const blocks = readFileSync(captions, "utf8")
      .split(/\r?\n\r?\n/)
      .slice(1);
    for (const block of blocks) {
      const lines = block.trim().split(/\r?\n/);
      const timing = lines.findIndex((line) => line.includes("-->"));
      if (timing < 0) continue;
      const [start, end] = lines[timing].split(" --> ");
      cues.push({
        start: toMs(start) + offset,
        end: toMs(end) + offset,
        text: lines.slice(timing + 1).join("\n"),
      });
    }
  }
  const length = seconds(video);
  process.stdout.write(`${slug}: ${length.toFixed(1)} s\n`);
  offset += Math.round(length * 1000);
}

const listFile = path.join(OUTPUT_DIR, `${name}.txt`);
writeFileSync(listFile, `${list.join("\n")}\n`);
const out = path.join(OUTPUT_DIR, `${name}.mp4`);
const joined = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    out,
  ],
  { stdio: "inherit" },
);
if (joined.status !== 0) {
  console.error("ffmpeg could not join the parts.");
  process.exit(1);
}

writeFileSync(
  path.join(OUTPUT_DIR, `${name}.vtt`),
  `WEBVTT\n\n${cues
    .map(
      (cue, index) =>
        `${index + 1}\n${toStamp(cue.start)} --> ${toStamp(cue.end)}\n${cue.text}`,
    )
    .join("\n\n")}\n`,
);
process.stdout.write(
  `${name}.mp4: ${(offset / 60000).toFixed(1)} min, ${cues.length} captions\n`,
);
