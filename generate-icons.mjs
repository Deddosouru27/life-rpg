import sharp from 'sharp'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0a0a0f"/>
  <text x="256" y="340" font-size="300" text-anchor="middle">⚔️</text>
</svg>`

const buf = Buffer.from(svg)

await sharp(buf).resize(192, 192).png().toFile('public/pwa-192x192.png')
await sharp(buf).resize(512, 512).png().toFile('public/pwa-512x512.png')
await sharp(buf).resize(180, 180).png().toFile('public/apple-touch-icon.png')

console.log('Иконки созданы!')
