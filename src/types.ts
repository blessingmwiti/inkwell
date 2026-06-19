export type Engine = "webgpu" | "wasm";
export type ModelTier = "tiny" | "small" | "medium";

export interface OcrLine {
  id: string;
  text: string;
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
}

export interface DocumentPage {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  lines: OcrLine[];
  status: "ready" | "processing" | "complete" | "error";
  duration?: number;
  error?: string;
}

export type WorkerRequest =
  | { type: "initialize"; engine: Engine; model: ModelTier }
  | { type: "recognize"; image: ImageBitmap; pageId: string };

export type WorkerResponse =
  | { type: "ready"; engine: Engine; model: ModelTier; cached: boolean }
  | { type: "progress"; pageId: string; progress: number; label: string }
  | { type: "result"; pageId: string; lines: OcrLine[]; duration: number }
  | { type: "error"; pageId?: string; message: string };
