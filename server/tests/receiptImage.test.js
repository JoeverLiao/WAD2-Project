// Tests for the receipt image preparation (no database, no network).
// Run from the server folder:  node --test tests/receiptImage.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import {
  estimateSkew,
  findPaper,
  preprocessReceiptImage,
  ReceiptImageError,
} from '../services/receiptImage.js'
import { canRenderText, renderReceiptPhoto } from './helpers/receiptPhoto.js'

const textWorks = await canRenderText()
const needsFonts = { skip: textWorks ? false : 'no usable font for drawing test images' }

async function grayOf(buffer) {
  const { data, info } = await sharp(buffer).rotate().toColourspace('b-w').raw().toBuffer({
    resolveWithObject: true,
  })
  return { data: new Uint8Array(data), w: info.width, h: info.height }
}

test('finds the paper and ignores the table around it', needsFonts, async () => {
  const photo = await renderReceiptPhoto({})
  const box = await findPaper(await grayOf(photo))
  assert.ok(box, 'paper should be found')
  // the paper is 76% of the width and about 62% of the height, centred
  assert.ok(box.x0 > 0.1 && box.x0 < 0.2, `x0 ${box.x0}`)
  assert.ok(box.x1 > 0.8 && box.x1 < 0.9, `x1 ${box.x1}`)
  assert.ok(box.y0 > 0.1 && box.y1 < 0.9, `y ${box.y0}-${box.y1}`)
})

test('measures how much a photographed receipt is tilted', needsFonts, async () => {
  for (const tilt of [-4, 0, 3]) {
    const photo = await renderReceiptPhoto({ tilt })
    const measured = await estimateSkew(await grayOf(photo))
    assert.ok(Math.abs(measured - tilt) <= 0.6, `tilt ${tilt}: measured ${measured}`)
  }
})

test('prepared image is a straight, grey, fixed-width PNG with a white border', needsFonts, async () => {
  const photo = await renderReceiptPhoto({ tilt: 3, ink: '#9a9a9a', shadow: 0.35, blur: 1 })
  const png = await preprocessReceiptImage(photo)
  const meta = await sharp(png).metadata()
  assert.equal(meta.format, 'png')
  assert.equal(meta.channels, 1)
  // 1600 px of paper plus a 4% white border on both sides
  assert.equal(meta.width, 1600 + 2 * Math.round(1600 * 0.04))
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  // the border must be white
  assert.ok(data[0] >= 250)
  assert.ok(data[info.width * info.height - 1] >= 250)
  // the faded grey text must have been pushed to (near) black
  let darkest = 255
  for (const value of data) if (value < darkest) darkest = value
  assert.ok(darkest < 80, `darkest pixel is ${darkest}`)
})

test('flattens a shadow: paper is evenly white from left to right', needsFonts, async () => {
  const photo = await renderReceiptPhoto({ shadow: 0.5 })
  const png = await preprocessReceiptImage(photo)
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  // average brightness of the left and right thirds of the page
  const third = Math.floor(info.width / 3)
  const mean = (x0, x1) => {
    let sum = 0
    let n = 0
    for (let y = 0; y < info.height; y++) {
      for (let x = x0; x < x1; x++) {
        sum += data[y * info.width + x]
        n++
      }
    }
    return sum / n
  }
  const left = mean(0, third)
  const right = mean(info.width - third, info.width)
  assert.ok(Math.abs(left - right) < 12, `left ${left.toFixed(0)} vs right ${right.toFixed(0)}`)
})

test('rejects bytes that are not an image', async () => {
  await assert.rejects(preprocessReceiptImage(Buffer.from('not an image')), ReceiptImageError)
})
