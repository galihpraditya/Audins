import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import fs from 'node:fs'

const hasR2Config = 
  process.env.R2_ENDPOINT &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME

let s3: S3Client | null = null

if (hasR2Config) {
  try {
    s3 = new S3Client({
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
      region: 'auto',
    })
    console.log('Cloudflare R2 Client initialized successfully.')
  } catch (error) {
    console.error('Failed to initialize Cloudflare R2 Client:', error)
  }
} else {
  console.log('Cloudflare R2 configuration missing.')
}

export function isR2Enabled(): boolean {
  return !!s3 && !!hasR2Config
}

export async function uploadAudioToR2(filePath: string, fileName: string, mimeType: string): Promise<string | null> {
  if (!s3 || !isR2Enabled()) {
    return null
  }

  const bucketName = process.env.R2_BUCKET_NAME || ''
  const fileStream = fs.createReadStream(filePath)

  try {
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: fileStream,
      ContentType: mimeType,
    }))

    const publicUrlBase = process.env.R2_PUBLIC_URL || `https://${bucketName}.r2.cloudflarestorage.com`
    const sanitizedBase = publicUrlBase.replace(/\/$/, '')
    return `${sanitizedBase}/${fileName}`
  } catch (error) {
    console.error('Error uploading file to Cloudflare R2:', error)
    throw new Error(`Cloudflare R2 upload failed: ${(error as Error).message}`)
  }
}
