import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const task = process.argv[2]

if (!task) {
  console.error('Usage: node scripts/build-android.mjs <assembleDebug|assembleRelease>')
  process.exit(1)
}

const command = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
const gradlePath = join('android', command)

if (!existsSync(gradlePath)) {
  console.error(`Android Gradle wrapper not found at ${gradlePath}`)
  process.exit(1)
}

const result = spawnSync(command, [task], {
  cwd: 'android',
  shell: process.platform === 'win32',
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
