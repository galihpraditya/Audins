import Groq, { toFile } from 'groq-sdk'
import fs from 'node:fs'
import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import { TranscriptEntry, AISummary } from '../types/index.js'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)
ffmpeg.setFfprobePath(ffprobeInstaller.path)

function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata?.format?.duration) {
        resolve(0)
      } else {
        resolve(metadata.format.duration)
      }
    })
  })
}

function sliceAudioChunk(inputPath: string, outputPath: string, startTime: number, duration: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(64)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

interface GroqTranscriptionSegment {
  start: number
  end: number
  text: string
}

interface GroqVerboseJsonTranscription {
  segments?: GroqTranscriptionSegment[]
  text: string
}

async function transcribeSingleFile(groq: Groq, filePath: string, timeOffset = 0): Promise<TranscriptEntry[]> {
  const transcription = await groq.audio.transcriptions.create({
    file: await toFile(fs.createReadStream(filePath), path.basename(filePath)),
    model: 'whisper-large-v3',
    response_format: 'verbose_json',
  })

  const verboseTranscription = transcription as unknown as GroqVerboseJsonTranscription
  const segments = verboseTranscription.segments || []
  if (segments.length > 0) {
    return segments.map((seg: GroqTranscriptionSegment) => {
      // Add timeOffset to segment start/end times
      const actualStart = seg.start + timeOffset
      
      const startMin = Math.floor(actualStart / 60)
      const startSec = Math.floor(actualStart % 60)
      const ts = `${startMin}:${startSec.toString().padStart(2, '0')}`

      return {
        ts,
        seconds: Math.floor(actualStart),
        text: seg.text.trim(),
      }
    })
  }
  
  return [{
    ts: '0:00',
    seconds: 0,
    text: verboseTranscription.text || 'Audio could not be transcribed.',
  }]
}

function convertAudioToMp3(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('mp3')
      .audioBitrate(128)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

export async function transcribeAudioWithGroq(
  filePath: string,
  customApiKey?: string
): Promise<TranscriptEntry[]> {
  const apiKey = customApiKey || process.env.GROQ_API_KEY

  if (!apiKey || apiKey.includes('demo_placeholder')) {
    throw new Error('Groq API Key is required. Please provide a valid API Key in Settings to process real audio files.')
  }

  let targetFilePath = filePath
  let tempConvertedFile: string | null = null

  // If file is .aac, transcode to standard MP3 using FFmpeg first
  if (path.extname(filePath).toLowerCase() === '.aac') {
    tempConvertedFile = filePath.replace(/\.aac$/i, '-converted.mp3')
    console.log(`AAC file detected. Converting to MP3 via FFmpeg: ${filePath} -> ${tempConvertedFile}`)
    try {
      await convertAudioToMp3(filePath, tempConvertedFile)
      targetFilePath = tempConvertedFile
    } catch (convErr) {
      console.warn('AAC to MP3 conversion error:', convErr)
    }
  }

  try {
    const groq = new Groq({ apiKey })
    const stats = fs.statSync(targetFilePath)
    const fileSizeInMB = stats.size / (1024 * 1024)

    // If file is <= 24MB, transcribe directly in one request
    if (fileSizeInMB <= 24) {
      return await transcribeSingleFile(groq, targetFilePath)
    }

    // File > 24MB: Auto-chunking using FFmpeg
    console.log(`File size is ${fileSizeInMB.toFixed(1)}MB (> 24MB). Auto-chunking audio...`)
    const totalDuration = await getAudioDuration(targetFilePath)
    
    // 10 minutes (600s) per chunk
    const chunkDurationSec = 600
    const numChunks = totalDuration > 0 ? Math.ceil(totalDuration / chunkDurationSec) : Math.ceil(fileSizeInMB / 15)

    const chunksDir = path.join(path.dirname(targetFilePath), 'chunks')
    if (!fs.existsSync(chunksDir)) {
      fs.mkdirSync(chunksDir, { recursive: true })
    }

    const allEntries: TranscriptEntry[] = []
    const ext = '.mp3' // ALWAYS use .mp3 for chunks to minimize size and ensure Groq compatibility
    const baseName = path.basename(targetFilePath, path.extname(targetFilePath))

    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDurationSec
      const chunkPath = path.join(chunksDir, `${baseName}_chunk_${i}${ext}`)

      try {
        console.log(`Processing chunk ${i + 1}/${numChunks} starting at ${startTime}s...`)
        await sliceAudioChunk(targetFilePath, chunkPath, startTime, chunkDurationSec)
        const chunkEntries = await transcribeSingleFile(groq, chunkPath, startTime)
        allEntries.push(...chunkEntries)
      } catch (chunkErr) {
        console.warn(`Chunk ${i + 1} processing warning:`, chunkErr)
      } finally {
        if (fs.existsSync(chunkPath)) {
          try { fs.unlinkSync(chunkPath) } catch {}
        }
      }
    }

    if (allEntries.length === 0) {
      throw new Error('Failed to process any audio chunks.')
    }

    return allEntries
  } finally {
    if (tempConvertedFile && fs.existsSync(tempConvertedFile)) {
      try { fs.unlinkSync(tempConvertedFile) } catch {}
    }
  }
}

export async function summarizeTranscriptWithGroq(
  transcriptText: string,
  fileName: string,
  customApiKey?: string,
  model = 'llama-3.3-70b-versatile',
  userCustomPrompt?: string
): Promise<AISummary> {
  const apiKey = customApiKey || process.env.GROQ_API_KEY

  if (!apiKey || apiKey.includes('demo_placeholder')) {
    throw new Error('Groq API Key is required. Please provide a valid API Key in Settings to process real audio files.')
  }

  // To fit Groq Free Tier's 12,000 TPM (Tokens Per Minute) limit for Llama 3.3 70B,
  // we sample/condense the transcript if it exceeds ~20,000 characters (~6,500 tokens).
  let processedText = transcriptText
  if (transcriptText.length > 20000) {
    const head = transcriptText.slice(0, 10000)
    const tail = transcriptText.slice(-10000)
    processedText = `${head}\n\n...[Transcript middle portion condensed for length]...\n\n${tail}`
  }

  const groq = new Groq({ apiKey })
  
  const additionalInstructions = userCustomPrompt 
    ? `\nUSER SPECIFIC INSTRUCTIONS FOR THIS SUMMARY: "${userCustomPrompt}"\nPlease ensure your summary directly addresses these instructions.`
    : ''

  const prompt = `You are Audin, an expert executive AI assistant. Analyze the following audio transcript from file "${fileName}" and output a structured JSON summary.
Do NOT use a fixed format. Adapt the summary structure to best fit the context of the audio (e.g. if it's a casual conversation, summarize the flow and decisions; if it's a lecture, extract key concepts; if it's a meeting, extract action items and highlights).

Return a JSON object with the following keys:
- "title": A concise descriptive title
- "sections": An array of objects, where each object has:
  - "heading": A descriptive title for this section
  - "content": An array of strings for this section. IMPORTANT: You MUST use rich Markdown formatting (e.g., **bold**, *italics*, \`- bullet points\`, \`1. numbered lists\`) inside these strings to make the text engaging, structured, and easy to read. Group related ideas into well-structured paragraphs or lists.
${additionalInstructions}

IMPORTANT: Your entire JSON output MUST be written in the exact SAME LANGUAGE as the original transcript provided below.

Transcript:
${processedText}

Output valid JSON only.`

  let usedModel = model
  let completion

  try {
    completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: usedModel,
      response_format: { type: 'json_object' },
    })
  } catch (error: unknown) {
    const err = error as any // Keep simple cast for properties or narrow if needed
    // Fallback to llama-3.1-8b-instant if 70B model fails due to TPM limit or request size
    if (err?.message?.includes('TPM') || err?.message?.includes('too large') || err?.status === 429) {
      console.warn(`Primary model ${usedModel} hit TPM limit. Falling back to llama-3.1-8b-instant...`)
      usedModel = 'llama-3.1-8b-instant'
      try {
        completion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: usedModel,
          response_format: { type: 'json_object' },
        })
      } catch (fallbackError) {
        console.error('Groq Llama Fallback Summarization error:', fallbackError)
        throw new Error(`Failed to summarize transcript: ${(fallbackError as Error).message}`)
      }
    } else {
      console.error('Groq Llama Summarization error:', error)
      throw new Error(`Failed to summarize transcript: ${(error as Error).message}`)
    }
  }

  const content = completion.choices[0]?.message?.content || '{}'
  const parsed = JSON.parse(content)

  return {
    title: parsed.title || `Summary: ${fileName}`,
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    modelUsed: usedModel,
    createdAt: new Date().toISOString(),
  }
}
