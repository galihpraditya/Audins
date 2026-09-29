import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const packageJsonPath = path.resolve(__dirname, "../package.json")
const gradlePath = path.resolve(__dirname, "../android/app/build.gradle")

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
const version = pkg.version || "1.0.0"

const parts = version.split(".").map((p) => parseInt(p, 10) || 0)
const major = parts[0] || 1
const minor = parts[1] || 0
const patch = parts[2] || 0

// Example: 1.1.0 -> 10100
const versionCode = major * 10000 + minor * 100 + patch

if (!fs.existsSync(gradlePath)) {
  console.warn("android/app/build.gradle not found, skipping sync.")
  process.exit(0)
}

let gradleContent = fs.readFileSync(gradlePath, "utf8")

gradleContent = gradleContent.replace(
  /versionCode\s+\d+/,
  `versionCode ${versionCode}`,
)

gradleContent = gradleContent.replace(
  /versionName\s+["'][^"']+["']/,
  `versionName "${version}"`,
)

fs.writeFileSync(gradlePath, gradleContent, "utf8")

console.log(
  `✓ Android package version synced: v${version} (versionCode: ${versionCode})`,
)
