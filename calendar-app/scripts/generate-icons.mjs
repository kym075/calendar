import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const sourceSvgPath = resolve(projectRoot, 'public', 'calendar.svg')
const buildDirPath = resolve(projectRoot, 'build')
const outputPngPath = resolve(buildDirPath, 'icon.png')
const outputIcoPath = resolve(buildDirPath, 'icon.ico')

const transparentBackground = { r: 0, g: 0, b: 0, alpha: 0 }
const icoSizes = [16, 24, 32, 48, 64, 128, 256]

async function renderPngBuffer(size) {
  return sharp(sourceSvgPath, { density: 512 })
    .resize(size, size, {
      fit: 'contain',
      background: transparentBackground,
    })
    .png()
    .toBuffer()
}

await mkdir(buildDirPath, { recursive: true })

const largestPngBuffer = await renderPngBuffer(256)
await writeFile(outputPngPath, largestPngBuffer)

const icoPngBuffers = await Promise.all(
  icoSizes.map((size) => renderPngBuffer(size)),
)
const icoBuffer = await pngToIco(icoPngBuffers)
await writeFile(outputIcoPath, icoBuffer)

console.log('Generated:', outputPngPath)
console.log('Generated:', outputIcoPath)
