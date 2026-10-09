// Turns every recording under tutorials/.output/<slug>/ into the MP4 that is
// published (docs/proposals/help-center.md).
//
//   node tutorials/encode.mjs            every recording
//   node tutorials/encode.mjs <slug>     one of them
//
// Needs ffmpeg on the PATH (Windows: `winget install Gyan.FFmpeg`). It is a
// tool of the machine that records, not a dependency of the project.
//
// Why these settings, for a screen recording:
//   * H.264 High / yuv420p plays everywhere, phones included;
//   * CRF 26 with `-preset slow` keeps text sharp at a few hundred kbit/s --
//     a screen is mostly still, which is exactly what the codec is good at;
//   * 24 fps is plenty for a pointer and halves what 60 would cost;
//   * no audio track at all (the tutorials are captioned, not narrated);
//   * `+faststart` moves the index to the front of the file, so the browser
//     starts playing -- and can seek by range request -- before the download
//     ends.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".output",
);

const megabytes = (file) => (statSync(file).size / 1024 / 1024).toFixed(2);

if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).error) {
  console.error(
    "ffmpeg was not found on the PATH. Install it (Windows: winget install Gyan.FFmpeg) and run this again.",
  );
  process.exit(1);
}

const only = process.argv[2];
const slugs = readdirSync(OUTPUT_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
  .map((entry) => entry.name)
  .filter((slug) => !only || slug === only);

let failed = false;
for (const slug of slugs) {
  const raw = path.join(OUTPUT_DIR, slug, "raw.webm");
  if (!existsSync(raw)) continue;
  const out = path.join(OUTPUT_DIR, slug, "video.mp4");
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-i",
      raw,
      "-an",
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "slow",
      "-crf",
      "26",
      "-r",
      "24",
      "-movflags",
      "+faststart",
      out,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    console.error(`${slug}: ffmpeg failed`);
    failed = true;
    continue;
  }
  process.stdout.write(
    `${slug}: ${megabytes(raw)} MB webm -> ${megabytes(out)} MB mp4
`,
  );
}
process.exit(failed ? 1 : 0);
