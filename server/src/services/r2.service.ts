import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3"

import { Upload } from "@aws-sdk/lib-storage"

import fs from "node:fs"

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
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",

        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },

      region: "auto",
    })

    console.log("Cloudflare R2 Client initialized successfully.")
  } catch (error) {
    console.error("Failed to initialize Cloudflare R2 Client:", error)
  }
} else {
  console.log("Cloudflare R2 configuration missing.")
}

export function isR2Enabled(): boolean {
  return !!s3 && !!hasR2Config
}

export async function uploadAudioToR2(
  filePath: string,

  fileName: string,

  mimeType: string,
): Promise<string | null> {
  if (!s3 || !isR2Enabled()) {
    return null
  }

  const bucketName = process.env.R2_BUCKET_NAME || ""

  try {
    // lib-storage Upload performs a multipart upload over a real stream,

    // avoiding both full-file buffering and unknown-length checksum issues.

    const parallelUpload = new Upload({
      client: s3,

      params: {
        Bucket: bucketName,

        Key: fileName,

        Body: fs.createReadStream(filePath),

        ContentType: mimeType,
      },
    })

    await parallelUpload.done()

    const publicUrlBase =
      process.env.R2_PUBLIC_URL ||
      `https://${bucketName}.r2.cloudflarestorage.com`

    const sanitizedBase = publicUrlBase.replace(/\/$/, "")

    return `${sanitizedBase}/${fileName}`
  } catch (error) {
    console.error("Error uploading file to Cloudflare R2:", error)

    throw new Error(`Cloudflare R2 upload failed: ${(error as Error).message}`)
  }
}

export async function deleteAudioFromR2(fileName: string): Promise<boolean> {
  if (!s3 || !isR2Enabled()) {
    return false
  }

  const bucketName = process.env.R2_BUCKET_NAME || ""

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucketName,

        Key: fileName,
      }),
    )

    return true
  } catch (error) {
    console.error("Error deleting file from Cloudflare R2:", error)

    return false
  }
}
