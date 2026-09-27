import { chromium } from "playwright"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pdfPath = path.join(__dirname, "AI-Digital-Twin-Platform-Overview.pdf")
const fileUrl = "file:///" + pdfPath.split("\\").join("/")

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()

const start = Date.now()
try {
  await page.goto(fileUrl, { waitUntil: "load", timeout: 30000 })
} catch (e) {
  console.log("goto error:", e.message)
}
console.log("load event fired at:", Date.now() - start, "ms")

for (let i = 0; i < 20; i++) {
  const info = await page.evaluate(() => ({
    title: document.title,
    hasEmbed: !!document.querySelector("embed"),
    readyState: document.readyState,
  })).catch(() => ({ error: true }))
  console.log(`t=${Date.now() - start}ms`, JSON.stringify(info))
  await page.waitForTimeout(500)
}

await browser.close()
