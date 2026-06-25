import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(__dirname, "../test-artifacts");
const targetUrl = withPreserveBuffer(process.env.OCEAN_URL ?? "http://127.0.0.1:4173");

function withPreserveBuffer(url) {
  const parsed = new URL(url);
  parsed.searchParams.set("preserveBuffer", "1");
  return parsed.toString();
}

async function readCanvasPixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas.webgl-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Canvas not found");
    }

    const sample = document.createElement("canvas");
    sample.width = 80;
    sample.height = 80;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("2D canvas context unavailable");
    }

    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const image = context.getImageData(0, 0, sample.width, sample.height);
    const pixels = Array.from(image.data);
    let nonBlank = 0;
    let lumaSum = 0;
    let lumaSquared = 0;
    const colorBuckets = new Set();

    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (luma > 8) {
        nonBlank += 1;
      }
      lumaSum += luma;
      lumaSquared += luma * luma;
      colorBuckets.add(`${r >> 4}-${g >> 4}-${b >> 4}`);
    }

    const count = pixels.length / 4;
    const mean = lumaSum / count;
    const variance = lumaSquared / count - mean * mean;

    return {
      width: canvas.width,
      height: canvas.height,
      nonBlankRatio: nonBlank / count,
      mean,
      variance,
      colorBucketCount: colorBuckets.size,
      pixels,
    };
  });
}

function averagePixelDifference(a, b) {
  const length = Math.min(a.length, b.length);
  let diff = 0;
  for (let index = 0; index < length; index += 4) {
    diff += Math.abs(a[index] - b[index]);
    diff += Math.abs(a[index + 1] - b[index + 1]);
    diff += Math.abs(a[index + 2] - b[index + 2]);
  }
  return diff / (length * 0.75);
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  });
  const page = await context.newPage();

  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("canvas.webgl-canvas");
  await page.waitForFunction(() => window.__GPTSKILL_OCEAN__?.getWaveCount() === 12);
  await page.waitForTimeout(900);

  const canvasBox = await page.locator("canvas.webgl-canvas").boundingBox();
  if (!canvasBox || canvasBox.width < viewport.width * 0.95 || canvasBox.height < viewport.height * 0.95) {
    throw new Error(`${viewport.name}: canvas is not full-viewport`);
  }

  const beforePixels = await readCanvasPixels(page);
  await page.waitForTimeout(900);
  const afterPixels = await readCanvasPixels(page);
  const motionDelta = averagePixelDifference(beforePixels.pixels, afterPixels.pixels);

  if (afterPixels.nonBlankRatio < 0.9) {
    throw new Error(`${viewport.name}: canvas appears blank`);
  }
  if (afterPixels.colorBucketCount < 18 || afterPixels.variance < 70) {
    throw new Error(`${viewport.name}: scene lacks color/lighting variation`);
  }
  if (motionDelta < 0.45) {
    throw new Error(`${viewport.name}: ocean animation delta is too low`);
  }

  const cameraBefore = await page.evaluate(() => window.__GPTSKILL_OCEAN__?.getCameraPosition());
  if (viewport.mobile) {
    const canvas = page.locator("canvas.webgl-canvas");
    const start = { x: viewport.width * 0.5, y: viewport.height * 0.5 };
    const end = { x: viewport.width * 0.68, y: viewport.height * 0.56 };
    await canvas.dispatchEvent("pointerdown", {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: start.x,
      clientY: start.y,
      button: 0,
      buttons: 1,
    });
    for (let step = 1; step <= 8; step += 1) {
      const ratio = step / 8;
      await canvas.dispatchEvent("pointermove", {
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        clientX: start.x + (end.x - start.x) * ratio,
        clientY: start.y + (end.y - start.y) * ratio,
        button: 0,
        buttons: 1,
      });
    }
    await canvas.dispatchEvent("pointerup", {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: end.x,
      clientY: end.y,
      button: 0,
      buttons: 0,
    });
  } else {
    await page.mouse.move(viewport.width * 0.5, viewport.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(viewport.width * 0.68, viewport.height * 0.56, { steps: 8 });
    await page.mouse.up();
  }
  await page.waitForTimeout(250);
  const cameraAfter = await page.evaluate(() => window.__GPTSKILL_OCEAN__?.getCameraPosition());

  const cameraShift = Math.hypot(
    cameraAfter.x - cameraBefore.x,
    cameraAfter.y - cameraBefore.y,
    cameraAfter.z - cameraBefore.z,
  );
  if (cameraShift < 0.15) {
    throw new Error(`${viewport.name}: orbit interaction did not move the camera`);
  }

  const screenshotPath = path.join(artifactDir, `ocean-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await context.close();

  return {
    viewport: viewport.name,
    screenshotPath,
    motionDelta: Number(motionDelta.toFixed(3)),
    colorBucketCount: afterPixels.colorBucketCount,
    lumaVariance: Number(afterPixels.variance.toFixed(2)),
  };
}

await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--disable-gpu-sandbox"],
});
try {
  const results = [];
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900, mobile: false },
    { name: "mobile", width: 390, height: 844, mobile: true },
  ]) {
    results.push(await runViewport(browser, viewport));
  }

  console.table(results);
} finally {
  await browser.close();
}
