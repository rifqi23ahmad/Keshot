// src/services/ocrService.js
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const pLimitModule = require('p-limit');
const pLimit = pLimitModule.default || pLimitModule;
const limitPool = pLimit(2);
const TIMEOUT_MS = 4000;

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker('ind');
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * Preprocesses image for better OCR accuracy.
 * Resize to max 800px width, grayscale, normalize.
 */
async function preprocessImage(imageBuffer) {
  return await sharp(imageBuffer)
    .resize(800, null, { withoutEnlargement: true })
    .grayscale()
    .normalize()
    // A quick linear transformation acting like basic thresholding
    .linear(2.0, -100)
    .png()
    .toBuffer();
}

/**
 * Runs OCR with a strict timeout and queue limiter.
 */
async function extractText(imageBuffer) {
  return limitPool(async () => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('OCR_TIMEOUT')), TIMEOUT_MS);

      (async () => {
        try {
          const processedBuffer = await preprocessImage(imageBuffer);
          const worker = await getWorker();
          const { data: { text } } = await worker.recognize(processedBuffer);
          clearTimeout(timer);
          resolve(text);
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      })();
    });
  });
}

/**
 * Force terminates the worker (usually not needed unless shutting down)
 */
async function terminateWorker() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}

module.exports = {
  extractText,
  terminateWorker
};
