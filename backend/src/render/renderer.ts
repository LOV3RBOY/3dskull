import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";
import { config } from "../config.js";
import type { Format } from "./formats.js";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        executablePath: config.render.chromiumPath || undefined,
        args: ["--font-render-hinting=none", "--disable-lcd-text", "--allow-file-access-from-files"],
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

// Simple semaphore so heavy print renders don't starve the box.
let active = 0;
const waiters: (() => void)[] = [];
async function acquire() {
  if (active < config.render.concurrency) {
    active++;
    return;
  }
  await new Promise<void>((r) => waiters.push(r));
  active++;
}
function release() {
  active--;
  waiters.shift()?.();
}

export interface RenderResult {
  png: Buffer;
  /** Diagnostics from the in-page layout pass (text that had to shrink, overflow, etc.) */
  diagnostics: string[];
}

/**
 * Render a full HTML document to PNG at the format's exact pixel size.
 * The HTML is written to a temp file so file:// fonts and images resolve.
 */
export async function renderHtml(html: string, format: Format): Promise<RenderResult> {
  await acquire();
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "xs-render-"));
  const file = path.join(dir, "index.html");
  try {
    await fs.promises.writeFile(file, html, "utf8");
    const browser = await getBrowser();
    const context = await browser.newContext({
      viewport: { width: format.width, height: format.height },
      deviceScaleFactor: format.scale,
    });
    try {
      const page = await context.newPage();
      await page.goto(pathToFileURL(file).href, { waitUntil: "load", timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      // Templates expose window.__layout() which fits text and returns diagnostics.
      const diagnostics = (await page.evaluate(() => {
        const fn = (window as unknown as { __layout?: () => string[] }).__layout;
        return fn ? fn() : [];
      })) as string[];
      await page.waitForTimeout(50);
      const png = await page.screenshot({ type: "png", fullPage: false, omitBackground: false, timeout: 120_000 });
      return { png, diagnostics };
    } finally {
      await context.close();
    }
  } finally {
    release();
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function rendererAvailable(): Promise<boolean> {
  try {
    await getBrowser();
    return true;
  } catch {
    return false;
  }
}

export async function closeRenderer() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    await b?.close();
  }
}
