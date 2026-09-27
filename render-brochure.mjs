import { chromium } from "playwright"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const htmlPath = path.join(__dirname, "brochure-tmp.html")
const pdfPath = path.join(__dirname, "AI-Digital-Twin-Platform-Overview.pdf")
const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/")

const browser = await chromium.launch()

const pdfPage = await browser.newPage()
await pdfPage.goto(fileUrl, { waitUntil: "networkidle" })
await pdfPage.evaluate(() => document.fonts.ready)
await pdfPage.waitForTimeout(300)
await pdfPage.pdf({
  path: pdfPath,
  width: "210mm",
  height: "297mm",
  printBackground: true,
  margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
})
console.log("PDF written to:", pdfPath)
await pdfPage.close()

const shotPage = await browser.newPage({ deviceScaleFactor: 2 })
await shotPage.goto(fileUrl, { waitUntil: "networkidle" })
await shotPage.evaluate(() => document.fonts.ready)
await shotPage.waitForTimeout(300)
const pageCount = await shotPage.locator(".page").count()
console.log("Page count:", pageCount)
for (let i = 0; i < pageCount; i++) {
  await shotPage.locator(".page").nth(i).screenshot({ path: path.join(__dirname, `brochure-page-${i + 1}.png`) })
}

await browser.close()
console.log("Done.")
