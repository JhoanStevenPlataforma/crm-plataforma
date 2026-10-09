// Uploads every recording under tutorials/.output/<slug>/ to the `help-media`
// bucket and attaches it to the tutorial of the same slug
// (docs/proposals/help-center.md).
//
//   node tutorials/publish.mjs                       the local e2e stack
//   node tutorials/publish.mjs --env .env.local      another environment
//   node tutorials/publish.mjs --draft               attach, do not publish
//   node tutorials/publish.mjs <slug> [<slug> ...]   only these
//
// The env file must carry VITE_SUPABASE_URL and SERVICE_ROLE_KEY. The service
// role is what lets a script write the bucket and the table; it never belongs
// in a file that is committed.
//
// Nothing is overwritten: each run uploads NEW files under fresh names and
// repoints the row at them, so a browser that cached the previous recording
// for a year is not left watching it. The previous files stay in the bucket.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(here, ".output");
const BUCKET = "help-media";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const envFile = envIndex >= 0 ? args[envIndex + 1] : ".env.e2e";
const isDraft = args.includes("--draft");
const only = args.filter(
  (arg, index) =>
    !arg.startsWith("--") && (envIndex < 0 || index !== envIndex + 1),
);

dotenv.config({ path: path.resolve(here, "..", envFile), quiet: true });
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    `${envFile} must define VITE_SUPABASE_URL and SERVICE_ROLE_KEY.`,
  );
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const upload = async (folder, file, extension, contentType) => {
  const name = `${folder}/${randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(name, readFileSync(file), {
      upsert: false,
      contentType,
      cacheControl: "31536000",
    });
  if (error) throw new Error(`upload of ${name} failed: ${error.message}`);
  return name;
};

const slugs = readdirSync(OUTPUT_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
  .map((entry) => entry.name)
  .filter((slug) => only.length === 0 || only.includes(slug));

let failed = false;
for (const slug of slugs) {
  const dir = path.join(OUTPUT_DIR, slug);
  const file = (name) => path.join(dir, name);
  if (!existsSync(file("meta.json"))) continue;
  try {
    const meta = JSON.parse(readFileSync(file("meta.json"), "utf8"));
    // The encoded MP4 when there is one; the browser's own capture otherwise.
    const isEncoded = existsSync(file("video.mp4"));
    const video_path = isEncoded
      ? await upload("video", file("video.mp4"), "mp4", "video/mp4")
      : await upload("video", file("raw.webm"), "webm", "video/webm");
    const poster_path = await upload(
      "poster",
      file("poster.jpg"),
      "jpg",
      "image/jpeg",
    );
    const captions_path = await upload(
      "captions",
      file("captions.vtt"),
      "vtt",
      "text/vtt",
    );

    const { data, error } = await supabase
      .from("help_tutorials")
      .update({
        video_path,
        poster_path,
        captions_path,
        duration_seconds: meta.duration_seconds,
        ...(isDraft ? {} : { is_published: true }),
      })
      .eq("slug", slug)
      .select("id");
    if (error) throw new Error(error.message);
    if (data.length === 0) {
      throw new Error("no tutorial has this slug; create it first");
    }
    process.stdout.write(
      `${slug}: ${isEncoded ? "mp4" : "webm (not encoded)"} attached${isDraft ? "" : " and published"}
`,
    );
  } catch (error) {
    failed = true;
    console.error(`${slug}: ${error instanceof Error ? error.message : error}`);
  }
}
process.exit(failed ? 1 : 0);
