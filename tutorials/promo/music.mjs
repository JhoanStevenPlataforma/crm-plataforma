// Writes the music bed of the promotional film: an original piece, generated
// here, so there is nothing to license.
//
//   node tutorials/promo/music.mjs                 the bed of the film
//   node tutorials/promo/music.mjs --corto         the bed of the 30-second cut
//
// It reads the film's `meta.json` for how long the picture runs and where the
// brand comes in, and writes `music.wav` (or `music-30s.wav`) next to it.
// `produce.mjs --musica <file>` then lays it under the picture.
//
// The piece follows the storyboard rather than looping blindly:
//   * the problem plays over a low pad alone, on a progression that starts
//     minor;
//   * the arpeggio and the bass enter with the brand;
//   * a soft pulse joins for the demonstration;
//   * the last seconds fall back to the pad and fade.
//
// It is synthesised from sine partials: discreet by construction, which is
// what a bed under a screen recording should be.
import { readFileSync, writeFileSync } from "node:fs";
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
const RATE = 44_100;
const BPM = 100;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

const isShort = process.argv.includes("--corto");
const meta = JSON.parse(readFileSync(path.join(DIR, "meta.json"), "utf8"));
const markEnd = (name) =>
  meta.marks.find((mark) => mark.name === name)?.end ?? 0;

// The short cut opens on 3.6 s of the problem, then the brand.
// `--duracion <seconds>` is for a film that `produce.mjs --omitir` shortens.
const asked = Number(
  process.argv[process.argv.indexOf("--duracion") + 1 || -1],
);
const length = isShort ? 30 : asked || meta.marks.at(-1).end;
// A film with other shots lifts after its first one and pulses after its second.
const liftAt = isShort ? 3.6 : markEnd("2-problema") || meta.marks[0].end;
const pulseAt = isShort ? 6.6 : markEnd("3a-marca") || meta.marks[1].end;
const closeAt = length - (isShort ? 3.5 : 4);

const midi = (note) => 440 * 2 ** ((note - 69) / 12);
// A minor, F, C, G: the same four chords throughout, so the lift is felt as
// instruments arriving, not as a change of key.
const CHORDS = [
  [57, 60, 64, 69], // Am
  [53, 57, 60, 65], // F
  [48, 55, 60, 64], // C
  [55, 59, 62, 67], // G
];

const samples = Math.ceil(length * RATE);
const left = new Float32Array(samples);
const right = new Float32Array(samples);

/** Adds one note: partials of a sine, shaped by an envelope. */
const addNote = ({
  at,
  frequency,
  duration,
  gain,
  partials,
  pan,
  envelope,
}) => {
  const start = Math.max(0, Math.floor(at * RATE));
  const end = Math.min(samples, Math.floor((at + duration) * RATE));
  const leftGain = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const rightGain = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let index = start; index < end; index += 1) {
    const time = (index - start) / RATE;
    let value = 0;
    for (let partial = 0; partial < partials.length; partial += 1) {
      value +=
        partials[partial] *
        Math.sin(2 * Math.PI * frequency * (partial + 1) * time);
    }
    const shaped = value * envelope(time, duration);
    left[index] += shaped * leftGain;
    right[index] += shaped * rightGain;
  }
};

const swell = (time, duration) =>
  Math.min(1, time / 0.9) * Math.min(1, (duration - time) / 0.9);
const pluck = (time) => Math.min(1, time / 0.006) * Math.exp(-time * 7);
const thump = (time) => Math.min(1, time / 0.004) * Math.exp(-time * 22);

for (let bar = 0; bar * BAR < length; bar += 1) {
  const at = bar * BAR;
  const chord = CHORDS[bar % CHORDS.length];
  const isLifted = at >= liftAt - 0.01 && at < closeAt;
  const hasPulse = at >= pulseAt - 0.01 && at < closeAt;

  // The pad: every bar, overlapping the next so the changes are seamless.
  chord.forEach((note, voice) => {
    addNote({
      at,
      frequency: midi(note),
      duration: BAR + 0.9,
      gain: isLifted ? 0.05 : 0.065,
      partials: [1, 0.35, 0.12],
      pan: (voice - 1.5) * 0.4,
      envelope: swell,
    });
  });

  if (isLifted) {
    // The bass: the root, on the first and third beats.
    for (const beat of [0, 2]) {
      addNote({
        at: at + beat * BEAT,
        frequency: midi(chord[0] - 12),
        duration: BEAT * 1.8,
        gain: 0.16,
        partials: [1, 0.2],
        pan: 0,
        envelope: (time, duration) =>
          Math.min(1, time / 0.01) *
          Math.exp(-time * 2.2) *
          Math.min(1, (duration - time) / 0.05),
      });
    }
    // The arpeggio: eighth notes up the chord, an octave above, side to side.
    for (let step = 0; step < 8; step += 1) {
      const note = chord[[0, 2, 1, 3, 2, 1, 3, 2][step]] + 12;
      addNote({
        at: at + step * (BEAT / 2),
        frequency: midi(note),
        duration: 0.7,
        gain: 0.06,
        partials: [1, 0.3, 0.08],
        pan: step % 2 === 0 ? -0.55 : 0.55,
        envelope: pluck,
      });
    }
  }

  if (hasPulse) {
    // The pulse: a soft low thump on every beat, a pitch falling fast.
    for (let beat = 0; beat < 4; beat += 1) {
      const start = Math.floor((at + beat * BEAT) * RATE);
      const end = Math.min(samples, start + Math.floor(0.22 * RATE));
      let phase = 0;
      for (let index = start; index < end; index += 1) {
        const time = (index - start) / RATE;
        phase += (2 * Math.PI * (48 + 70 * Math.exp(-time * 30))) / RATE;
        const value = Math.sin(phase) * thump(time) * 0.2;
        left[index] += value;
        right[index] += value;
      }
    }
  }
}

// One echo of the whole mix, crossed over, for a little room.
const echo = Math.floor(BEAT * 0.75 * RATE);
for (let index = samples - 1; index >= echo; index -= 1) {
  left[index] += right[index - echo] * 0.22;
  right[index] += left[index - echo] * 0.22;
}

// Fades, a soft ceiling, and the level of a bed: present, never in front.
const fadeIn = 1.2 * RATE;
const fadeOut = (isShort ? 2 : 3) * RATE;
let peak = 0;
for (let index = 0; index < samples; index += 1) {
  const fade =
    Math.min(1, index / fadeIn) * Math.min(1, (samples - index) / fadeOut);
  left[index] = Math.tanh(left[index] * 1.6) * fade;
  right[index] = Math.tanh(right[index] * 1.6) * fade;
  peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
}
const level = 0.5 / peak;

const data = Buffer.alloc(samples * 4);
for (let index = 0; index < samples; index += 1) {
  data.writeInt16LE(Math.round(left[index] * level * 32_767), index * 4);
  data.writeInt16LE(Math.round(right[index] * level * 32_767), index * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

const out = path.join(DIR, isShort ? "music-30s.wav" : "music.wav");
writeFileSync(out, Buffer.concat([header, data]));
process.stdout.write(`${path.basename(out)}: ${length.toFixed(1)} s\n`);
