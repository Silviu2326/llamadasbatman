import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
})

export async function getPresignedUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
    { expiresIn: 3600 }
  )
}

export async function putObject(key: string, body: Buffer, contentType?: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: body, ContentType: contentType }))
}
