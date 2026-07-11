import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MediaAsset } from "../../src/types/domain";

const require = createRequire(import.meta.url);

export type ExtractVideoFrameInput = {
  asset: MediaAsset;
  body: Buffer;
  contentType: string;
};

export type ExtractedVideoFrame = {
  body: Buffer;
  contentType: string;
};

export type VideoFrameExtractor = {
  extractLastFrame(input: ExtractVideoFrameInput): Promise<ExtractedVideoFrame>;
};

export class FfmpegVideoFrameExtractor implements VideoFrameExtractor {
  async extractLastFrame(input: ExtractVideoFrameInput): Promise<ExtractedVideoFrame> {
    if (!input.contentType.startsWith("video/")) {
      throw new Error(`Expected a video asset, got ${input.contentType}`);
    }

    const workDir = await mkdtemp(join(tmpdir(), "ai-comic-frame-"));
    const inputPath = join(workDir, "input.mp4");
    const outputPath = join(workDir, "last-frame.png");

    try {
      await writeFile(inputPath, input.body);
      await runFfmpeg([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-sseof",
        "-0.1",
        "-i",
        inputPath,
        "-frames:v",
        "1",
        outputPath
      ]);

      return {
        body: await readFile(outputPath),
        contentType: "image/png"
      };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  const executable = resolveFfmpegExecutable();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    const stderr: Buffer[] = [];

    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = Buffer.concat(stderr).toString("utf8").trim();
      reject(new Error(`ffmpeg exited with code ${code}${detail ? `: ${detail}` : ""}`));
    });
  });
}

function resolveFfmpegExecutable(): string {
  if (process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN;
  try {
    const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg") as { path?: string };
    if (ffmpegInstaller.path) return ffmpegInstaller.path;
  } catch {
    // Fall through to system ffmpeg for developer machines that already have it.
  }
  return "ffmpeg";
}
