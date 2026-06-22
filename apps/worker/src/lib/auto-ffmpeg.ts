// FFmpeg: normaliza as cenas e monta o vídeo final (Fase 4). Concorrência baixa
// (worker dedicado), /tmp limpo em finally. Normalização (1080x1920, 30fps,
// yuv420p, aac 2ch 48k, setsar=1) garante concat/xfade sem glitch.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NORM_VF =
  "scale=1080:1920:force_original_aspect_ratio=decrease," +
  "pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30";

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    let err = "";
    let out = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out || err) : reject(new Error(`${bin} exit ${code}: ${err.slice(-500)}`)),
    );
  });
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download cena falhou (HTTP ${res.status})`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function probeDuration(file: string): Promise<number> {
  const out = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ]);
  const d = parseFloat(out.trim());
  return Number.isFinite(d) ? d : 0;
}

async function normalize(input: string, output: string): Promise<void> {
  await run("ffmpeg", [
    "-y", "-i", input, "-vf", NORM_VF,
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-ac", "2", "-ar", "48000",
    output,
  ]);
}

/** concat demuxer (cortes secos) — modo monologue/continuidade */
async function concatDemuxer(dir: string, files: string[], output: string): Promise<void> {
  const list = join(dir, "list.txt");
  await writeFile(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", output]);
}

/** xfade encadeado (montage) — exige durações; cai p/ concat se falhar */
async function xfadeConcat(files: string[], output: string): Promise<void> {
  const T = 0.5; // duração da transição
  const durs = await Promise.all(files.map(probeDuration));
  const inputs: string[] = [];
  files.forEach((f) => inputs.push("-i", f));

  let vlabel = "0:v";
  let alabel = "0:a";
  let offset = durs[0]! - T;
  const filters: string[] = [];
  for (let i = 1; i < files.length; i++) {
    const vo = `v${i}`;
    const ao = `a${i}`;
    filters.push(`[${vlabel}][${i}:v]xfade=transition=fade:duration=${T}:offset=${offset.toFixed(3)}[${vo}]`);
    filters.push(`[${alabel}][${i}:a]acrossfade=d=${T}[${ao}]`);
    vlabel = vo;
    alabel = ao;
    offset += durs[i]! - T;
  }
  await run("ffmpeg", [
    "-y", ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", `[${vlabel}]`, "-map", `[${alabel}]`,
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac",
    output,
  ]);
}

async function trimFaststart(input: string, output: string, durationSec: number): Promise<void> {
  await run("ffmpeg", [
    "-y", "-i", input, "-t", String(durationSec),
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac",
    "-movflags", "+faststart",
    output,
  ]);
}

export interface StitchInput {
  tmpKey: string;
  sceneUrls: string[];
  mode: "montage" | "monologue";
  targetDurationSec: number;
}

/** monta o vídeo final a partir das cenas e devolve os bytes do mp4 */
export async function stitchScenes(input: StitchInput): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "lsm-stitch-"));
  try {
    // 1) baixa + normaliza cada cena
    const norm: string[] = [];
    for (let i = 0; i < input.sceneUrls.length; i++) {
      const raw = join(dir, `raw_${i}.mp4`);
      const out = join(dir, `norm_${i}.mp4`);
      await download(input.sceneUrls[i]!, raw);
      await normalize(raw, out);
      norm.push(out);
    }

    // 2) junta
    const assembled = join(dir, "assembled.mp4");
    if (input.mode === "montage" && norm.length > 1) {
      try {
        await xfadeConcat(norm, assembled);
      } catch {
        await concatDemuxer(dir, norm, assembled); // fallback robusto
      }
    } else {
      await concatDemuxer(dir, norm, assembled);
    }

    // 3) corta no tempo exato + faststart
    const final = join(dir, "final.mp4");
    await trimFaststart(assembled, final, input.targetDurationSec);
    return await readFile(final);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
