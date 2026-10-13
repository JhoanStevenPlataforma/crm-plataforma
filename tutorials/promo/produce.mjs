// Turns the recording of the promotional film into the files that are shown.
//
//   node tutorials/promo/produce.mjs                    the film, 16:9
//   node tutorials/promo/produce.mjs --corto            the 30-second cut
//   node tutorials/promo/produce.mjs --voz v.wav --musica m.mp3
//
// It reads tutorials/.output/hermes-crm-promo/{raw.webm,meta.json} and writes
// hermes-crm-promo.mp4 (or hermes-crm-promo-30s.mp4) next to them.
//
// `meta.json` is what makes the cuts exact: the studio wrote how much was
// recorded before the film began (`head_seconds`) and where every shot
// really started and ended, so nothing here is timed by eye.
//
// The film has no sound of its own. `--voz` and `--musica` mix in a narration
// and a music bed when there are files for them; the music is lowered under
// the voice and both are cut to the length of the picture.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `--pelicula <slug>` picks the recording; the promotional film by default.
const FILM =
  process.argv[process.argv.indexOf("--pelicula") + 1 || -1] ??
  "hermes-crm-promo";
const DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.output",
  FILM,
);

/** The 30-second cut: [shot, seconds into the shot, seconds kept]. */
const SHORT_CUT = [
  ["1-apertura", 2.4, 3.6],
  ["3a-marca", 0.2, 3.0],
  ["4b-pipeline", 0, 3.4],
  ["4e-cotizar", 2.2, 4.8],
  ["4g-cliente", 0, 5.0],
  ["4h-chat", 0.2, 3.0],
  ["4m-ganada", 0, 3.7],
  ["7-cierre", 0.3, 3.5],
];

/** ffmpeg from the PATH, or from where winget puts it on Windows. */
const findFfmpeg = () => {
  if (!spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).error) {
    return "ffmpeg";
  }
  const packages = path.join(
    process.env.LOCALAPPDATA ?? "",
    "Microsoft/WinGet/Packages",
  );
  if (existsSync(packages)) {
    for (const name of readdirSync(packages)) {
      if (!name.startsWith("Gyan.FFmpeg")) continue;
      for (const build of readdirSync(path.join(packages, name))) {
        const exe = path.join(packages, name, build, "bin/ffmpeg.exe");
        if (existsSync(exe)) return exe;
      }
    }
  }
  console.error(
    "ffmpeg was not found. Install it (Windows: winget install Gyan.FFmpeg) and run this again.",
  );
  process.exit(1);
};

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const isShort = args.includes("--corto");
const voice = option("--voz");
const music = option("--musica");

const raw = path.join(DIR, "raw.webm");
if (!existsSync(raw)) {
  console.error("No recording yet: run `npm run promo:record` first.");
  process.exit(1);
}
const meta = JSON.parse(readFileSync(path.join(DIR, "meta.json"), "utf8"));
const head = meta.head_seconds;
const filmLength = meta.marks.at(-1).end;
// The recorder pads the viewport up to the video size instead of enlarging
// it: only the top-left viewport of the recording is picture.
const viewport = meta.viewport ?? { width: 1600, height: 900 };

/**
 * The whole film, or the film minus one shot (`--omitir <shot>`): what is
 * left of it is joined on a hard cut, past the fade the next shot opens on.
 */
function withoutShot(name) {
  const mark = meta.marks.find((candidate) => candidate.name === name);
  if (!name) return [[head, filmLength]];
  if (!mark) throw new Error(`No shot named ${name} in meta.json`);
  const resume = mark.end + 0.4;
  return [
    [head, mark.start],
    [head + resume, filmLength - resume],
  ];
}

/** [start in the recording, length] of every piece of picture kept. */
const pieces = isShort
  ? SHORT_CUT.map(([name, into, length]) => {
      const mark = meta.marks.find((candidate) => candidate.name === name);
      if (!mark) throw new Error(`No shot named ${name} in meta.json`);
      return [head + mark.start + into, length];
    })
  : withoutShot(option("--omitir"));
const length = pieces.reduce((sum, [, seconds]) => sum + seconds, 0);

const filters = pieces.map(
  ([start, seconds], index) =>
    `[0:v]trim=start=${start.toFixed(3)}:duration=${seconds.toFixed(3)},setpts=PTS-STARTPTS[v${index}]`,
);
filters.push(
  `${pieces.map((_, index) => `[v${index}]`).join("")}concat=n=${pieces.length}:v=1:a=0,fps=30,crop=${viewport.width}:${viewport.height}:0:0,scale=${meta.size.width}:${meta.size.height}:flags=lanczos[picture]`,
);

const inputs = ["-i", raw];
const maps = ["-map", "[picture]"];
const audio = [voice, music].filter(Boolean);
for (const file of audio) inputs.push("-i", file);
if (voice && music) {
  filters.push(
    `[2:a]volume=0.22[bed];[1:a][bed]amix=inputs=2:duration=longest[sound]`,
  );
  maps.push("-map", "[sound]");
} else if (audio.length === 1) {
  maps.push("-map", "1:a");
}

const out = path.join(DIR, isShort ? `${FILM}-30s.mp4` : `${FILM}.mp4`);
const result = spawnSync(
  findFfmpeg(),
  [
    "-y",
    "-loglevel",
    "error",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    ...maps,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "slow",
    "-crf",
    "20",
    ...(audio.length > 0 ? ["-c:a", "aac", "-b:a", "160k"] : ["-an"]),
    "-t",
    length.toFixed(3),
    "-movflags",
    "+faststart",
    out,
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) {
  console.error("ffmpeg failed.");
  process.exit(1);
}
process.stdout.write(
  `${path.basename(out)}: ${length.toFixed(1)} s${audio.length > 0 ? "" : ", no sound"}\n`,
);
