import { access, open, realpath, stat } from 'node:fs/promises'
import { constants, createReadStream } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Readable } from 'node:stream'
import { zadarmaGatewayRequest } from './client'

export const RECORDING_UUID = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
export function recordingUrl(uuid: string): string {
  if (!RECORDING_UUID.test(uuid)) throw new Error('INVALID_RECORDING_ID')
  return `/api/calls/recordings/${uuid}`
}
export function recordingDirectory(): string {
  return path.resolve(process.env.ZADARMA_RECORDING_DIR?.trim() || '/var/spool/asterisk/monitor/vendrava')
}
export async function assertCompleteRecordingAvailable(): Promise<void> {
  // Full-call recording cannot silently override a previously selected policy.
  if (process.env.CALL_RECORDING_POLICY && process.env.CALL_RECORDING_POLICY !== 'always') {
    throw new Error('ZADARMA_COMPLETE_RECORDING_REQUIRES_ALWAYS_POLICY')
  }
  await access(recordingDirectory(), constants.R_OK | constants.W_OK)
}

export async function waitForRecordingStart(uuid: string): Promise<void> {
  if (!RECORDING_UUID.test(uuid)) throw new Error('INVALID_RECORDING_ID')
  for (let attempt = 0; attempt < 20; attempt++) {
    const file = await stat(path.join(recordingDirectory(), `${uuid}.wav`)).catch(() => null)
    // stdio may buffer the WAV header until audio arrives. File creation,
    // rather than a flushed header, confirms that MixMonitor opened it.
    if (file?.isFile()) return
    await delay(100)
  }
  throw new Error('ZADARMA_RECORDING_NOT_STARTED')
}

/** Never serve files outside the private directory, even via symlinks. */
export async function completedRecording(uuid: string, directory = recordingDirectory()) {
  if (!RECORDING_UUID.test(uuid)) throw new Error('INVALID_RECORDING_ID')
  const root = await realpath(directory)
  const filename = `${uuid}.wav`
  const marker = await realpath(path.join(root, `${uuid}.ready`))
  const fullPath = await realpath(path.join(root, filename))
  if (path.dirname(marker) !== root || path.dirname(fullPath) !== root) throw new Error('INVALID_RECORDING_PATH')
  const info = await stat(fullPath)
  if (!info.isFile() || info.size <= 44 || info.size > 128 * 1024 * 1024) throw new Error('INVALID_RECORDING_FILE')
  const file = await open(fullPath, 'r')
  try {
    const header = Buffer.alloc(12)
    await file.read(header, 0, 12, 0)
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE'
      || header.readUInt32LE(4) + 8 !== info.size) throw new Error('INCOMPLETE_RECORDING_FILE')
  } finally { await file.close() }
  return { filename, size: info.size, stream: () => createReadStream(fullPath) }
}

/** Called only after the API has checked the signed-in organisation's ownership. */
export async function loadCallRecording(uuid: string) {
  if (process.env.ZADARMA_RECORDINGS_REMOTE !== 'true') return completedRecording(uuid)
  if (!RECORDING_UUID.test(uuid)) throw new Error('INVALID_RECORDING_ID')
  const response = await zadarmaGatewayRequest(`/recordings/${uuid}`)
  const size = Number(response.headers.get('content-length'))
  if (!response.ok || !response.body || !response.headers.get('content-type')?.startsWith('audio/wav')
    || !Number.isSafeInteger(size) || size <= 44 || size > 128 * 1024 * 1024) {
    await response.body?.cancel()
    throw new Error('REMOTE_RECORDING_UNAVAILABLE')
  }
  return { filename: `${uuid}.wav`, size, stream: () => Readable.fromWeb(response.body as any) }
}
