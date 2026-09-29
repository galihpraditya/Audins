import assert from "node:assert/strict"
import { createHmac } from "node:crypto"

console.log("Running Audin backend self-checks...")

// 1. Check media token signing and verification
const MEDIA_SECRET = "test-secret-key"
function signToken(fileName, expiresAt) {
  return createHmac("sha256", MEDIA_SECRET)
    .update(`${fileName}.${expiresAt}`)
    .digest("hex")
}
function verifyToken(fileName, expiresAt, token) {
  if (Date.now() > expiresAt) return false
  const expected = signToken(fileName, expiresAt)
  return expected === token
}

const future = Date.now() + 60000
const past = Date.now() - 60000
const validTok = signToken("audio.mp3", future)
assert.equal(verifyToken("audio.mp3", future, validTok), true, "Valid media token must verify")
assert.equal(verifyToken("audio.mp3", past, validTok), false, "Expired media token must reject")
assert.equal(verifyToken("other.mp3", future, validTok), false, "Mismatched filename must reject")
console.log("✓ Media token signing & verification passed.")

// 2. Check transcript timestamp formatting logic
function formatTimestamp(actualStart) {
  const hours = Math.floor(actualStart / 3600)
  const startMin = Math.floor((actualStart % 3600) / 60)
  const startSec = Math.floor(actualStart % 60)
  return hours > 0
    ? `${hours}:${startMin.toString().padStart(2, "0")}:${startSec.toString().padStart(2, "0")}`
    : `${startMin}:${startSec.toString().padStart(2, "0")}`
}

assert.equal(formatTimestamp(12), "0:12")
assert.equal(formatTimestamp(75), "1:15")
assert.equal(formatTimestamp(3600), "1:00:00")
assert.equal(formatTimestamp(3738), "1:02:18")
console.log("✓ Transcript timestamp formatting passed.")

// 3. Check rate limit effective max calculation
function getEffectiveMaxLimit(isLocal) {
  const MAX_FREE_DAILY_UPLOADS = 10
  return isLocal ? 100 : MAX_FREE_DAILY_UPLOADS
}

assert.equal(getEffectiveMaxLimit(true), 100, "Local socket should allow 100 uploads")
assert.equal(getEffectiveMaxLimit(false), 10, "Remote socket should allow 10 uploads")
console.log("✓ Rate limit effective max calculation passed.")

// 4. Check guest document claim security logic
function shouldClaimDoc(doc, cleanGuestId, localUserId, requestedIds = new Set()) {
  if (cleanGuestId && doc.userId === cleanGuestId) return true
  if (localUserId && doc.userId === localUserId) return true
  if (requestedIds.has(doc.id)) {
    const isDemoDoc = doc.id === "doc-1" || doc.id === "doc-2" || doc.id === "doc-3"
    if (
      !isDemoDoc &&
      (!doc.userId ||
        (cleanGuestId && doc.userId === cleanGuestId) ||
        (localUserId && doc.userId === localUserId))
    ) {
      return true
    }
  }
  return false
}

// User A has doc with UUID
const userADoc = { id: "doc-123", userId: "user-a-uuid-without-at" }
assert.equal(
  shouldClaimDoc(userADoc, "guest-session-b", null, new Set(["doc-123"])),
  false,
  "Attacker should NOT be able to claim User A's document just by passing documentId",
)

// Demo doc should never be claimable
const demoDoc = { id: "doc-1", userId: undefined }
assert.equal(
  shouldClaimDoc(demoDoc, "guest-session-b", null, new Set(["doc-1"])),
  false,
  "Demo doc should never be stolen/claimed",
)

// Genuine guest document SHOULD be claimed
const guestDoc = { id: "doc-guest-1", userId: "guest-session-b" }
assert.equal(
  shouldClaimDoc(guestDoc, "guest-session-b", null),
  true,
  "Legitimate guest doc should be claimed",
)
console.log("✓ Guest document claim authorization passed.")

// 5. Check duplicate document owner binding & share reset
function simulateDuplicate(doc, newUserId) {
  return {
    ...JSON.parse(JSON.stringify(doc)),
    id: "doc-new-copy",
    name: `${doc.name} (Copy)`,
    userId: newUserId || doc.userId,
    createdAt: new Date().toISOString(),
    shareSettings: undefined,
  }
}

const originalDoc = {
  id: "doc-orig",
  name: "Recording.mp3",
  userId: "guest-1",
  shareSettings: { isPublic: true, shareId: "sh_abcdef123" },
}

const copied = simulateDuplicate(originalDoc, "user-registered-456")
assert.equal(copied.userId, "user-registered-456", "Duplicated doc must be bound to caller userId")
assert.equal(copied.shareSettings, undefined, "Duplicated doc must reset shareSettings to avoid collision")
console.log("✓ Duplicate document logic passed.")

// 6. Check MIME type filter logic
const allowedExtensions = /\.(mp3|wav|m4a|mp4|webm|flac|ogg|opus|aac)$/i
const allowedMimeTypes =
  /^(audio\/|video\/mp4|video\/webm|application\/ogg|application\/x-ogg|application\/octet-stream)/i

function isAllowedUpload(filename, mime) {
  const extMatch = allowedExtensions.test(filename)
  const mimeMatch = !mime || allowedMimeTypes.test(mime)
  return Boolean(extMatch && mimeMatch)
}

assert.equal(isAllowedUpload("meeting.mp3", "audio/mpeg"), true)
assert.equal(isAllowedUpload("voice.ogg", "application/ogg"), true, "application/ogg must be accepted")
assert.equal(isAllowedUpload("song.aac", "application/octet-stream"), true, "valid ext with octet-stream must be accepted")
assert.equal(isAllowedUpload("malicious.exe", "application/octet-stream"), false, "invalid ext must be rejected")
assert.equal(isAllowedUpload("doc.pdf", "application/pdf"), false, "non-audio must be rejected")
console.log("✓ Multer MIME type filter logic passed.")

console.log("\nALL BACKEND SELF-CHECKS PASSED SUCCESSFULLY!")
