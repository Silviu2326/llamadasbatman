import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Job } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { createAssetFromBuffer, getAssetContent, publishAsset } from './assets.service'
import { createJob, hasJobExecutor, registerJobExecutor, type JobExecutorResult } from './jobs.service'

const POST_JOB_KIND = 'studio.post.export'
const MAX_INPUTS = 50
const MAX_TOTAL_INPUT_BYTES = Math.max(1, Number(process.env.STUDIO_POST_MAX_INPUT_BYTES ?? 1024 * 1024 * 1024))
const MAX_OUTPUT_BYTES = Math.max(1, Number(process.env.STUDIO_POST_MAX_OUTPUT_BYTES ?? 250 * 1024 * 1024))
const PROCESS_TIMEOUT_MS = Math.max(30_000, Number(process.env.STUDIO_FFMPEG_TIMEOUT_MS ?? 10 * 60_000))
const STDERR_LIMIT = 16_000

type ExportPreset = 'source' | 'vertical' | 'square' | 'landscape'

interface StudioPostInput {
  productionId: string
  takeIds: string[]
  videoAssetIds: string[]
  subtitleAssetId?: string
  audioAssetId?: string
  publish: boolean
  preset: ExportPreset
}

interface ProbeSummary {
  durationS: number | null
  width: number | null
  height: number | null
  videoCodec: string | null
  audioCodec: string | null
}

function input(job: Job): StudioPostInput {
  const value = job.input && typeof job.input === 'object' && !Array.isArray(job.input)
    ? job.input as Record<string, unknown>
    : {}
  const payload = value.payload && typeof value.payload === 'object' && !Array.isArray(value.payload)
    ? value.payload as Record<string, unknown>
    : value
  return {
    productionId: String(payload.productionId ?? ''),
    takeIds: Array.isArray(payload.takeIds) ? payload.takeIds.filter((id): id is string => typeof id === 'string') : [],
    videoAssetIds: Array.isArray(payload.videoAssetIds) ? payload.videoAssetIds.filter((id): id is string => typeof id === 'string') : [],
    ...(typeof payload.subtitleAssetId === 'string' ? { subtitleAssetId: payload.subtitleAssetId } : {}),
    ...(typeof payload.audioAssetId === 'string' ? { audioAssetId: payload.audioAssetId } : {}),
    publish: payload.publish === true,
    preset: payload.preset === 'source' || payload.preset === 'square' || payload.preset === 'landscape' ? payload.preset : 'vertical',
  }
}

function binary(envName: 'STUDIO_FFMPEG_PATH' | 'STUDIO_FFPROBE_PATH', fallback: string): string {
  const value = process.env[envName]?.trim()
  if (!value) return fallback
  if (value.includes('\0') || value.includes('\n') || value.includes('\r')) throw new Error(`${envName} inválido`)
  return value
}

export async function runMediaProcess(command: string, args: readonly string[], timeoutMs = PROCESS_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      stderr = `${stderr}${String(chunk)}`.slice(-STDERR_LIMIT)
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Proceso de media excedió ${timeoutMs} ms`))
    }, timeoutMs)
    timer.unref()
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(stderr)
      else reject(new Error(`Proceso de media terminó con código ${code}: ${stderr.slice(-2000)}`))
    })
  })
}

async function probe(file: string): Promise<ProbeSummary> {
  const ffprobe = binary('STUDIO_FFPROBE_PATH', 'ffprobe')
  const chunks: Buffer[] = []
  const raw = await new Promise<string>((resolve, reject) => {
    const child = spawn(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', file], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => { stderr = `${stderr}${String(chunk)}`.slice(-STDERR_LIMIT) })
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('ffprobe agotó su tiempo')) }, Math.min(PROCESS_TIMEOUT_MS, 60_000))
    timer.unref()
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(Buffer.concat(chunks).toString('utf8'))
      else reject(new Error(`ffprobe falló (${code}): ${stderr.slice(-1000)}`))
    })
  })
  const parsed = JSON.parse(raw) as { format?: { duration?: string }; streams?: Array<Record<string, unknown>> }
  const video = parsed.streams?.find(stream => stream.codec_type === 'video')
  const audio = parsed.streams?.find(stream => stream.codec_type === 'audio')
  const duration = Number(parsed.format?.duration)
  return {
    durationS: Number.isFinite(duration) ? duration : null,
    width: typeof video?.width === 'number' ? video.width : null,
    height: typeof video?.height === 'number' ? video.height : null,
    videoCodec: typeof video?.codec_name === 'string' ? video.codec_name : null,
    audioCodec: typeof audio?.codec_name === 'string' ? audio.codec_name : null,
  }
}

function dimensions(preset: ExportPreset): { width: number; height: number } {
  if (preset === 'square') return { width: 1080, height: 1080 }
  if (preset === 'landscape' || preset === 'source') return { width: 1280, height: 720 }
  return { width: 720, height: 1280 }
}

/** Argumentos totalmente construidos por presets; ningún texto libre llega a FFmpeg. */
export function buildFfmpegArgs(params: {
  videos: string[]
  output: string
  preset: ExportPreset
  audio?: string
  subtitles?: string
}): string[] {
  if (!params.videos.length || params.videos.length > MAX_INPUTS) throw new Error('Número de clips inválido')
  const args = ['-hide_banner', '-nostdin', '-y']
  for (const video of params.videos) args.push('-i', video)
  const audioIndex = params.audio ? params.videos.length : null
  if (params.audio) args.push('-stream_loop', '-1', '-i', params.audio)
  const subtitleIndex = params.subtitles ? params.videos.length + (params.audio ? 1 : 0) : null
  if (params.subtitles) args.push('-i', params.subtitles)

  const { width, height } = dimensions(params.preset)
  const filters = params.videos.map((_, index) =>
    `[${index}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${index}]`,
  )
  filters.push(`${params.videos.map((_, index) => `[v${index}]`).join('')}concat=n=${params.videos.length}:v=1:a=0[vout]`)
  args.push('-filter_complex', filters.join(';'), '-map', '[vout]')
  if (audioIndex !== null) args.push('-map', `${audioIndex}:a:0`, '-shortest')
  if (subtitleIndex !== null) args.push('-map', `${subtitleIndex}:s:0`)
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
  if (audioIndex !== null) args.push('-c:a', 'aac', '-b:a', '192k')
  if (subtitleIndex !== null) args.push('-c:s', 'mov_text')
  args.push('-threads', '2', '-max_muxing_queue_size', '1024', '-fs', String(MAX_OUTPUT_BYTES), params.output)
  return args
}

async function loadToFile(orgId: string, assetId: string, file: string, allowedMime: RegExp): Promise<number> {
  const content = await getAssetContent({ orgId, id: assetId })
  if (!content) throw new Error(`Asset ${assetId} no encontrado o sin binario`)
  if (!allowedMime.test(content.mimeType)) throw new Error(`Asset ${assetId} tiene un formato no permitido para esta entrada`)
  await writeFile(file, content.body, { flag: 'wx' })
  return content.body.length
}

async function executeStudioPost(job: Job): Promise<JobExecutorResult> {
  const payload = input(job)
  if (!payload.productionId || !payload.videoAssetIds.length || payload.videoAssetIds.length !== payload.takeIds.length) {
    throw new Error('Payload de postproducción incompleto')
  }
  if (payload.videoAssetIds.length > MAX_INPUTS) throw new Error(`Máximo ${MAX_INPUTS} clips por exportación`)
  const production = await prisma.production.findFirst({ where: { id: payload.productionId, orgId: job.orgId } })
  if (!production) throw new Error('Producción no encontrada')

  const temp = await mkdtemp(path.join(tmpdir(), 'vendrava-studio-'))
  try {
    let totalBytes = 0
    const videos: string[] = []
    for (let index = 0; index < payload.videoAssetIds.length; index += 1) {
      const file = path.join(temp, `take-${index}.mp4`)
      totalBytes += await loadToFile(job.orgId, payload.videoAssetIds[index]!, file, /^video\//)
      if (totalBytes > MAX_TOTAL_INPUT_BYTES) throw new Error(`Inputs de postproducción superan ${MAX_TOTAL_INPUT_BYTES} bytes`)
      videos.push(file)
    }
    let audio: string | undefined
    if (payload.audioAssetId) {
      audio = path.join(temp, 'audio.bin')
      totalBytes += await loadToFile(job.orgId, payload.audioAssetId, audio, /^audio\//)
      if (totalBytes > MAX_TOTAL_INPUT_BYTES) throw new Error(`Inputs de postproducción superan ${MAX_TOTAL_INPUT_BYTES} bytes`)
    }
    let subtitles: string | undefined
    if (payload.subtitleAssetId) {
      subtitles = path.join(temp, 'subtitles.srt')
      totalBytes += await loadToFile(job.orgId, payload.subtitleAssetId, subtitles, /^(application\/x-subrip|text\/(plain|vtt))$/)
      if (totalBytes > MAX_TOTAL_INPUT_BYTES) throw new Error(`Inputs de postproducción superan ${MAX_TOTAL_INPUT_BYTES} bytes`)
    }
    if (totalBytes > MAX_TOTAL_INPUT_BYTES) throw new Error(`Inputs de postproducción superan ${MAX_TOTAL_INPUT_BYTES} bytes`)

    const before = await Promise.all(videos.map(file => probe(file)))
    if (before.some(item => !item.videoCodec || !item.durationS || item.durationS <= 0)) {
      throw new Error('QC de entrada falló: clip sin vídeo reproducible o duración válida')
    }

    const outputFile = path.join(temp, 'master.mp4')
    await runMediaProcess(binary('STUDIO_FFMPEG_PATH', 'ffmpeg'), buildFfmpegArgs({ videos, output: outputFile, preset: payload.preset, audio, subtitles }))
    const after = await probe(outputFile)
    if (!after.videoCodec || !after.durationS || after.durationS <= 0 || !after.width || !after.height) {
      throw new Error('QC de salida falló: el master no es un vídeo reproducible')
    }
    const expectedDuration = before.reduce((sum, item) => sum + (item.durationS ?? 0), 0)
    if (Math.abs(after.durationS - expectedDuration) > Math.max(1.5, expectedDuration * 0.08)) {
      throw new Error(`QC de salida falló: duración ${after.durationS.toFixed(2)} s, esperada ${expectedDuration.toFixed(2)} s`)
    }

    const output = await readFile(outputFile)
    const sourceAssets = [
      ...payload.videoAssetIds.map(id => ({ id, role: 'take' })),
      ...(payload.audioAssetId ? [{ id: payload.audioAssetId, role: 'audio' }] : []),
      ...(payload.subtitleAssetId ? [{ id: payload.subtitleAssetId, role: 'subtitle' }] : []),
    ]
    const asset = await createAssetFromBuffer({
      orgId: job.orgId,
      buffer: output,
      filename: 'studio-master.mp4',
      kind: 'video',
      mimeType: 'video/mp4',
      provider: 'vendrava-media-worker',
      model: 'ffmpeg',
      jobId: job.id,
      brandScope: production.brandScope ?? undefined,
      sourceAssets,
      params: { productionId: production.id, preset: payload.preset, qc: { inputs: before, output: after } },
    })
    const delivered = payload.publish ? await publishAsset({ orgId: job.orgId, id: asset.id }) : asset
    const qcReport = { status: 'passed', inspectedAt: new Date().toISOString(), inputs: before, output: after, exportAssetId: asset.id }
    await prisma.$transaction([
      prisma.take.updateMany({
        where: { orgId: job.orgId, id: { in: payload.takeIds } },
        data: { qcReport: qcReport as unknown as Prisma.InputJsonValue },
      }),
      prisma.production.update({ where: { id: production.id }, data: { status: payload.publish ? 'delivered' : 'review' } }),
    ])
    return {
      output: {
        assetId: asset.id,
        publishedUrl: delivered && 'publishedUrl' in delivered ? delivered.publishedUrl : null,
        qcReport,
      },
      costActualCents: 0,
    }
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => undefined)
  }
}

export function registerStudioPostExecutor(): void {
  if (hasJobExecutor(POST_JOB_KIND)) return
  registerJobExecutor(POST_JOB_KIND, executeStudioPost)
}

export async function enqueueStudioPost(params: {
  orgId: string
  productionId: string
  takeIds: string[]
  videoAssetIds: string[]
  subtitleAssetId?: string
  audioAssetId?: string
  publish: boolean
  preset: ExportPreset
  createdById?: string
  idempotencyKey?: string
}) {
  return createJob({
    orgId: params.orgId,
    kind: POST_JOB_KIND,
    input: { payload: params } as unknown as Prisma.InputJsonValue,
    costEstimateCents: 0,
    createdById: params.createdById,
    idempotencyKey: params.idempotencyKey,
    maxAttempts: 1,
  })
}
