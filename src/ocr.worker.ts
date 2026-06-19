/// <reference lib="webworker" />
import * as ort from "onnxruntime-web";
import { parse } from "yaml";
import type { Engine, ModelTier, OcrLine, WorkerRequest, WorkerResponse } from "./types";

const MODEL_BASE = "https://huggingface.co/PaddlePaddle";
const MODEL_THRESHOLDS: Record<ModelTier, { pixel: number; box: number }> = {
  tiny: { pixel: 0.2, box: 0.4 },
  small: { pixel: 0.2, box: 0.45 },
  medium: { pixel: 0.2, box: 0.45 },
};

let detSession: ort.InferenceSession | undefined;
let recSession: ort.InferenceSession | undefined;
let characters: string[] = [];
let currentEngine: Engine = "wasm";
let currentModel: ModelTier = "small";
let initialization: Promise<void> | undefined;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    if (event.data.type === "initialize") {
      await initialize(event.data.engine, event.data.model);
      post({ type: "ready", engine: currentEngine, model: currentModel, cached: true });
      return;
    }
    if (!detSession || !recSession) await (initialization ?? initialize("wasm", "small"));
    await recognize(event.data.image, event.data.pageId);
  } catch (error) {
    post({
      type: "error",
      pageId: event.data.type === "recognize" ? event.data.pageId : undefined,
      message: error instanceof Error ? error.message : "OCR failed",
    });
  }
};

function initialize(engine: Engine, model: ModelTier) {
  if (detSession && recSession && currentEngine === engine && currentModel === model) return Promise.resolve();
  if (initialization && currentEngine === engine && currentModel === model) return initialization;
  currentEngine = engine;
  currentModel = model;
  detSession = undefined;
  recSession = undefined;
  initialization = loadEngine(engine, model);
  return initialization;
}

async function loadEngine(engine: Engine, model: ModelTier) {
  ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
  const executionProviders = engine === "webgpu" ? ["webgpu", "wasm"] : ["wasm"];
  const detModel = `${MODEL_BASE}/PP-OCRv6_${model}_det_onnx/resolve/main/inference.onnx`;
  const recModel = `${MODEL_BASE}/PP-OCRv6_${model}_rec_onnx/resolve/main/inference.onnx`;
  const recConfig = `${MODEL_BASE}/PP-OCRv6_${model}_rec_onnx/resolve/main/inference.yml`;
  const [detBytes, recBytes, configText] = await Promise.all([
    fetchCached(detModel),
    fetchCached(recModel),
    fetchTextCached(recConfig),
  ]);
  const config = parse(configText) as { PostProcess: { character_dict: string[] } };
  characters = ["blank", ...config.PostProcess.character_dict, " "];
  detSession = await ort.InferenceSession.create(detBytes, { executionProviders });
  recSession = await ort.InferenceSession.create(recBytes, { executionProviders });
  initialization = undefined;
}

async function recognize(image: ImageBitmap, pageId: string) {
  const started = performance.now();
  post({ type: "progress", pageId, progress: 0.08, label: "Preparing image" });
  const maxSide = 960;
  const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(32, Math.round((image.width * ratio) / 32) * 32);
  const height = Math.max(32, Math.round((image.height * ratio) / 32) * 32);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);
  const input = imageToTensor(pixels, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]);

  post({ type: "progress", pageId, progress: 0.22, label: "Finding text regions" });
  const detOutput = await detSession!.run({ [detSession!.inputNames[0]]: input });
  const probability = detOutput[detSession!.outputNames[0]];
  const mapHeight = probability.dims[probability.dims.length - 2] as number;
  const mapWidth = probability.dims[probability.dims.length - 1] as number;
  const thresholds = MODEL_THRESHOLDS[currentModel];
  const regions = connectedRegions(probability.data as Float32Array, mapWidth, mapHeight, thresholds.pixel, thresholds.box)
    .map((box) => ({
      x: Math.max(0, box.x * (image.width / mapWidth)),
      y: Math.max(0, box.y * (image.height / mapHeight)),
      width: Math.min(image.width, box.width * (image.width / mapWidth)),
      height: Math.min(image.height, box.height * (image.height / mapHeight)),
      score: box.score,
    }))
    .sort((a, b) => {
      const lineTolerance = Math.max(a.height, b.height) * 0.55;
      return Math.abs(a.y - b.y) < lineTolerance ? a.x - b.x : a.y - b.y;
    })
    .slice(0, 160);

  const lines: OcrLine[] = [];
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    post({
      type: "progress",
      pageId,
      progress: 0.3 + (i / Math.max(1, regions.length)) * 0.65,
      label: `Reading line ${i + 1} of ${regions.length}`,
    });
    const result = await readRegion(image, region);
    if (result.text.trim()) {
      lines.push({
        id: crypto.randomUUID(),
        text: result.text,
        confidence: Math.min(result.confidence, region.score),
        box: { x: region.x, y: region.y, width: region.width, height: region.height },
      });
    }
  }
  image.close();
  post({ type: "result", pageId, lines, duration: performance.now() - started });
}

function connectedRegions(data: Float32Array, width: number, height: number, pixelThreshold: number, boxThreshold: number) {
  const step = Math.max(1, Math.floor(Math.max(width, height) / 900));
  const gridWidth = Math.ceil(width / step);
  const gridHeight = Math.ceil(height / step);
  const active = new Uint8Array(gridWidth * gridHeight);
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const sourceX = Math.min(width - 1, x * step);
      const sourceY = Math.min(height - 1, y * step);
      active[y * gridWidth + x] = data[sourceY * width + sourceX] > pixelThreshold ? 1 : 0;
    }
  }
  const visited = new Uint8Array(active.length);
  const regions: Array<{ x: number; y: number; width: number; height: number; score: number }> = [];
  const queueX = new Int32Array(active.length);
  const queueY = new Int32Array(active.length);

  for (let sy = 0; sy < gridHeight; sy++) {
    for (let sx = 0; sx < gridWidth; sx++) {
      const start = sy * gridWidth + sx;
      if (!active[start] || visited[start]) continue;
      let head = 0;
      let tail = 0;
      let minX = sx;
      let maxX = sx;
      let minY = sy;
      let maxY = sy;
      let score = 0;
      let count = 0;
      queueX[tail] = sx;
      queueY[tail++] = sy;
      visited[start] = 1;

      while (head < tail) {
        const x = queueX[head];
        const y = queueY[head++];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        score += data[Math.min(height - 1, y * step) * width + Math.min(width - 1, x * step)];
        count++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) continue;
          const index = ny * gridWidth + nx;
          if (active[index] && !visited[index]) {
            visited[index] = 1;
            queueX[tail] = nx;
            queueY[tail++] = ny;
          }
        }
      }
      const boxWidth = (maxX - minX + 1) * step;
      const boxHeight = (maxY - minY + 1) * step;
      if (count >= 6 && boxWidth >= 5 && boxHeight >= 5 && boxWidth / boxHeight >= 0.45) {
        const padX = boxHeight * 0.35;
        const padY = boxHeight * 0.18;
        regions.push({
          x: Math.max(0, minX * step - padX),
          y: Math.max(0, minY * step - padY),
          width: Math.min(width, boxWidth + padX * 2),
          height: Math.min(height, boxHeight + padY * 2),
          score: score / count,
        });
      }
    }
  }
  return mergeNearby(regions, boxThreshold);
}

// DB maps often split letters into neighboring components. Merge boxes that share a text line.
function mergeNearby(
  regions: Array<{ x: number; y: number; width: number; height: number; score: number }>,
  boxThreshold: number,
) {
  const sorted = [...regions].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: typeof sorted = [];
  for (const box of sorted) {
    const match = merged.find((candidate) => {
      const overlapY = Math.min(candidate.y + candidate.height, box.y + box.height) - Math.max(candidate.y, box.y);
      const gap = box.x - (candidate.x + candidate.width);
      return overlapY > Math.min(candidate.height, box.height) * 0.45 && gap >= -8 && gap < Math.max(candidate.height, box.height) * 2.2;
    });
    if (!match) {
      merged.push({ ...box });
      continue;
    }
    const right = Math.max(match.x + match.width, box.x + box.width);
    const bottom = Math.max(match.y + match.height, box.y + box.height);
    match.x = Math.min(match.x, box.x);
    match.y = Math.min(match.y, box.y);
    match.width = right - match.x;
    match.height = bottom - match.y;
    match.score = (match.score + box.score) / 2;
  }
  return merged.filter((box) => box.width > box.height * 1.1 && box.score >= boxThreshold);
}

async function readRegion(
  image: ImageBitmap,
  region: { x: number; y: number; width: number; height: number },
) {
  const targetHeight = 48;
  const contentWidth = Math.max(8, Math.round((region.width / region.height) * targetHeight));
  const targetWidth = Math.min(3200, Math.max(160, Math.ceil(contentWidth / 32) * 32));
  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, Math.min(contentWidth, targetWidth), targetHeight);
  const pixels = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const tensor = imageToTensor(pixels, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
  const output = await recSession!.run({ [recSession!.inputNames[0]]: tensor });
  const logits = output[recSession!.outputNames[0]];
  return decodeCtc(logits.data as Float32Array, logits.dims.map(Number));
}

function imageToTensor(image: ImageData, mean: number[], std: number[]) {
  const { width, height, data } = image;
  const values = new Float32Array(3 * width * height);
  const area = width * height;
  for (let i = 0; i < area; i++) {
    values[i] = (data[i * 4 + 2] / 255 - mean[0]) / std[0];
    values[area + i] = (data[i * 4 + 1] / 255 - mean[1]) / std[1];
    values[area * 2 + i] = (data[i * 4] / 255 - mean[2]) / std[2];
  }
  return new ort.Tensor("float32", values, [1, 3, height, width]);
}

function decodeCtc(data: Float32Array, dims: number[]) {
  const classes = dims[dims.length - 1];
  const timesteps = dims[dims.length - 2];
  let previous = -1;
  let text = "";
  let score = 0;
  let count = 0;
  for (let t = 0; t < timesteps; t++) {
    let best = 0;
    let bestValue = -Infinity;
    for (let c = 0; c < classes; c++) {
      const value = data[t * classes + c];
      if (value > bestValue) {
        bestValue = value;
        best = c;
      }
    }
    if (best !== 0 && best !== previous && characters[best]) {
      text += characters[best];
      score += bestValue;
      count++;
    }
    previous = best;
  }
  return { text, confidence: count ? score / count : 0 };
}

async function fetchCached(url: string) {
  const cache = await caches.open("inkwell-models-v1");
  const cached = await cache.match(url);
  if (cached) return cached.arrayBuffer();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url.split("/").at(-1)}`);
  await cache.put(url, response.clone());
  return response.arrayBuffer();
}

async function fetchTextCached(url: string) {
  return new TextDecoder().decode(await fetchCached(url));
}

function post(message: WorkerResponse) {
  self.postMessage(message);
}
