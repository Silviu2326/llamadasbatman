import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runMediaProcess } from './studioPost.service'

export async function exportPersonalVideo(body: Buffer, options: { start: number; end: number; mute: boolean }) {
  const directory = await mkdtemp(path.join(tmpdir(), 'vendrava-personal-video-'))
  try {
    const input = path.join(directory, 'input.video')
    const output = path.join(directory, 'edited.mp4')
    await writeFile(input, body)
    await runMediaProcess(process.env.STUDIO_FFMPEG_PATH?.trim() || 'ffmpeg', [
      '-y', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm,avi,mpegts,mpeg', '-i', input,
      '-ss', String(options.start), '-t', String(options.end - options.start),
      '-map', '0:v:0', ...(options.mute ? ['-an'] : ['-map', '0:a?', '-c:a', 'aac']),
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
      '-movflags', '+faststart', '-fs', String(100 * 1024 * 1024), output,
    ], 120_000)
    return await readFile(output)
  } finally {
    const resolved = path.resolve(directory)
    if (resolved.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(resolved).startsWith('vendrava-personal-video-')) await rm(resolved, { recursive: true, force: true })
  }
}
