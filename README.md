# Inkwell OCR

Private, local-first OCR that runs entirely in the browser.

Inkwell detects and recognizes text without uploading documents to an application server. Images are processed in a Web Worker using ONNX Runtime Web, with WebGPU acceleration when available and WASM as the compatible fallback.

## Features

- Local image OCR with no document upload path
- WebGPU and WASM runtimes
- Fast, Balanced, and Accurate model tiers
- Editable text linked to detected regions
- Confidence scores and low-confidence review
- Search, copy, zoom, and document management
- Plain-text and structured JSON exports
- Browser caching for repeat and offline use
- Responsive desktop and mobile interface

## Model Tiers

The interface uses generic quality labels while loading models from the PP-OCRv6 family.

| Interface label | Model tier | Approximate model download |
| --- | --- | ---: |
| Fast | Tiny | 6 MB |
| Balanced | Small | 31 MB |
| Accurate | Medium | 139 MB |

The complete first load is larger than the model files alone because ONNX Runtime Web and application assets are also required. Its threaded WASM runtime is approximately 26 MB uncompressed.

Balanced is the default. Fast is useful on constrained devices and networks. Accurate has the largest download and memory requirement.

## How It Works

```text
Image
  |
  v
Browser decoding and normalization
  |
  v
Text-region detection
  |
  v
Line cropping and resizing
  |
  v
CTC text recognition
  |
  v
Editable text, confidence scores, and exports
```

Inference runs inside a Web Worker so model execution does not block the interface. Public model files and their character dictionaries are downloaded on first use and cached with the Cache API.

Documents are represented by local object URLs and are not sent to the model host. Network requests are limited to application assets, fonts, and public model artifacts.

## Requirements

- Node.js 20 or newer
- pnpm 10.33.2
- A current Chromium-based browser for WebGPU
- Any modern browser with WebAssembly support for the fallback runtime

WebGPU availability depends on the browser, operating system, hardware, and secure-context requirements. WASM remains available when WebGPU cannot be initialized.

## Development

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

The server binds to `0.0.0.0` and normally listens on:

```text
http://localhost:5173
```

Run quality checks:

```bash
pnpm lint
pnpm build
```

Preview the production build:

```bash
pnpm preview
```

## Production Deployment

The project includes a PM2 ecosystem file that serves the generated SPA using PM2's static server.

Install dependencies and PM2:

```bash
pnpm install --frozen-lockfile
pnpm add --global pm2
```

Build and start or reload the application:

```bash
pnpm deploy
```

The production server uses port `3000` by default. Override it with:

```bash
PORT=8080 pnpm deploy
```

Persist the process across server restarts:

```bash
pm2 save
pm2 startup
```

Useful commands:

```bash
pm2 status
pnpm deploy:logs
pnpm deploy:stop
```

For public deployment, place Nginx, Caddy, or another reverse proxy in front of PM2 and serve the application over HTTPS. HTTPS is required for reliable WebGPU and service-worker support outside localhost.

## Offline Behavior

The production build registers a service worker that caches the application shell. Each selected OCR model is cached separately after its first successful download.

Offline use therefore requires:

1. Opening the deployed production application while online.
2. Selecting and initializing the desired quality tier.
3. Allowing the model download to complete.

Clearing browser site data removes cached application assets and models.

## Privacy

- Documents are processed in the browser.
- There is no application API or document-upload endpoint.
- OCR inference runs locally through WebGPU or WASM.
- Model artifacts are fetched from Hugging Face on first use.
- Browser caching is local to the current origin and browser profile.

Self-host the ONNX files and fonts if the deployment must make no third-party network requests.

## Current Limitations

- Input currently supports PNG, JPEG, and WebP images.
- PDF.js is installed, but PDF ingestion is not yet exposed in the interface.
- Detection post-processing uses a lightweight connected-region implementation rather than the complete upstream DB polygon pipeline.
- Perspective correction, rotated text, curved text, and complex layouts need further work.
- Long paragraph accuracy is affected by crop quality and the fixed recognition canvas.
- Reading order is heuristic.
- Browser memory use rises significantly with the Accurate model.

## Roadmap

- PDF ingestion and page rendering
- Searchable PDF export
- Perspective and rotated-region rectification
- Improved DB post-processing and polygon extraction
- Aspect-ratio-aware recognition batching
- Tables and document-layout reconstruction
- Automatic WebGPU/WASM benchmarking
- Optional self-hosted model bundles

## Project Structure

```text
src/
  App.tsx          Application workspace and review UI
  ocr.worker.ts    Model loading, caching, inference, and decoding
  types.ts         Shared worker and document types
  lib/             File, export, and sample-document helpers
public/
  sw.js            Production service worker
  manifest.webmanifest
ecosystem.config.cjs
```

## Credits

The OCR models are from the open-source PP-OCRv6 family developed by the PaddleOCR team at PaddlePaddle. Model artifacts are loaded from Hugging Face.

- [PP-OCRv6 model collection](https://huggingface.co/collections/PaddlePaddle/pp-ocrv6)
- [PaddleOCR source repository](https://github.com/PaddlePaddle/PaddleOCR)
- [PaddleOCR documentation](https://www.paddleocr.ai/main/en/index.html)
- [PaddlePaddle website](https://www.paddlepaddle.org.cn/en)
- [PP-OCRv6 technical report](https://arxiv.org/abs/2606.13108)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)

PP-OCRv6 is distributed under the Apache License 2.0. Review the licenses of this project's runtime dependencies before redistribution.
