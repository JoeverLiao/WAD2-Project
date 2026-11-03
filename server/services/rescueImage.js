import sharp from 'sharp'
import {fail} from './rescueValidation.js'
export async function compressRescueImage(buffer) {
  try {
    const image = sharp(buffer,{limitInputPixels:25_000_000,failOn:'warning'})
    const metadata = await image.metadata()
    if (!['jpeg','png','webp'].includes(metadata.format) || (metadata.pages ?? 1)>1) fail(400,'Upload a still JPEG, PNG or WebP image.')
    for (const [size,quality] of [[960,75],[800,65],[640,55],[480,45]]) {
      // Sharp strips metadata by default; do not call keepMetadata().
      const output = await image.clone().rotate().resize({width:size,height:size,fit:'inside',withoutEnlargement:true}).webp({quality,effort:4}).toBuffer()
      if (output.length<=200*1024) return output
    }
    fail(400,'Photo is too complex to fit the storage limit. Try a smaller image.')
  } catch(error) {
    if (error.status) throw error
    fail(400,'Photo cannot be decoded. Use a JPEG, PNG or WebP under 8 MiB and 25 megapixels.')
  }
}
