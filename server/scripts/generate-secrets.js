#!/usr/bin/env node
import crypto from "node:crypto"

console.log("==================================================")
console.log("  Audin Production Security Secrets Generator")
console.log("==================================================")
console.log("\nCopy and paste the following values into your")
console.log("Render Dashboard -> Environment Variables:\n")

const jwtSecret = crypto.randomBytes(32).toString("hex")
const mediaSecret = crypto.randomBytes(32).toString("hex")

console.log(`JWT_SECRET=${jwtSecret}`)
console.log(`MEDIA_SIGNING_SECRET=${mediaSecret}`)
console.log("\n==================================================")
