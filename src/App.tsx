import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  HardDrive,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelRightClose,
  Play,
  Plus,
  RotateCcw,
  Search,
  ServerOff,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadJson, downloadText, fileToPage } from "./lib/files";
import { createSampleFile } from "./lib/sample";
import type { DocumentPage, Engine, ModelTier, OcrLine, WorkerResponse } from "./types";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export default function App() {
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [selectedLine, setSelectedLine] = useState<string>();
  const [engine, setEngine] = useState<Engine>(() => ("gpu" in navigator ? "webgpu" : "wasm"));
  const [model, setModel] = useState<ModelTier>("small");
  const [engineReady, setEngineReady] = useState(false);
  const [engineLabel, setEngineLabel] = useState("Model not loaded");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(0.45);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const active = pages.find((page) => page.id === activeId);
  const filteredLines = useMemo(
    () =>
      active?.lines.filter((line) => line.text.toLowerCase().includes(query.trim().toLowerCase())) ?? [],
    [active, query],
  );

  useEffect(() => {
    const worker = new Worker(new URL("./ocr.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "ready") {
        setEngineReady(true);
        setEngineLabel(`${modelNames[message.model]} · ${message.engine === "webgpu" ? "WebGPU" : "WASM"}`);
      }
      if (message.type === "progress") {
        setProgress(message.progress);
        setProgressLabel(message.label);
      }
      if (message.type === "result") {
        setPages((current) =>
          current.map((page) =>
            page.id === message.pageId
              ? { ...page, lines: message.lines, duration: message.duration, status: "complete" }
              : page,
          ),
        );
        setProgress(1);
        setProgressLabel(`Finished in ${(message.duration / 1000).toFixed(1)}s`);
      }
      if (message.type === "error") {
        if (message.pageId) {
          setPages((current) =>
            current.map((page) =>
              page.id === message.pageId ? { ...page, status: "error", error: message.message } : page,
            ),
          );
        }
        setEngineLabel("Model unavailable");
        setProgressLabel(message.message);
      }
    };
    return () => worker.terminate();
  }, []);

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = [...fileList].filter((file) => ACCEPTED.includes(file.type));
    const next = await Promise.all(files.map(fileToPage));
    setPages((current) => [...current, ...next]);
    if (next[0]) setActiveId(next[0].id);
  }, []);

  const runOcr = useCallback(async () => {
    if (!active || !workerRef.current) return;
    setPages((current) =>
      current.map((page) => (page.id === active.id ? { ...page, status: "processing", error: undefined } : page)),
    );
    setProgress(0.02);
    setProgressLabel(engineReady ? "Starting local OCR" : `Downloading ${modelNames[model].toLowerCase()} OCR model`);
    if (!engineReady) {
      workerRef.current.postMessage({ type: "initialize", engine, model });
    }
    const response = await fetch(active.url);
    const bitmap = await createImageBitmap(await response.blob());
    workerRef.current.postMessage({ type: "recognize", image: bitmap, pageId: active.id }, [bitmap]);
  }, [active, engine, engineReady, model]);

  const chooseModel = (next: ModelTier) => {
    setModel(next);
    setEngineReady(false);
    setEngineLabel(`${modelNames[next]} model not loaded`);
  };

  const updateLine = (id: string, text: string) => {
    if (!active) return;
    setPages((current) =>
      current.map((page) =>
        page.id === active.id
          ? { ...page, lines: page.lines.map((line) => (line.id === id ? { ...line, text } : line)) }
          : page,
      ),
    );
  };

  const deletePage = (id: string) => {
    const index = pages.findIndex((page) => page.id === id);
    URL.revokeObjectURL(pages[index].url);
    const next = pages.filter((page) => page.id !== id);
    setPages(next);
    if (activeId === id) setActiveId(next[Math.max(0, index - 1)]?.id);
  };

  const copyText = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(active.lines.map((line) => line.text).join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const loadSample = async () => addFiles([await createSampleFile()]);

  if (!pages.length) {
    return (
      <main
        className={`empty-shell ${isDragging ? "is-dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <Header compact onAbout={() => setAboutOpen(true)} />
        <section className="empty-content">
          <div className="drop-mark"><ImagePlus size={28} strokeWidth={1.6} /></div>
          <h1>Bring in a document</h1>
          <p>Images stay on this device. The OCR model runs here, in your browser.</p>
          <div className="empty-actions">
            <button className="primary-button" onClick={() => inputRef.current?.click()}>
              <Upload size={17} /> Choose images
            </button>
            <button className="secondary-button" onClick={loadSample}>
              <Sparkles size={17} /> Try a sample
            </button>
          </div>
          <span className="drop-hint">or drop PNG, JPG, or WebP anywhere</span>
          <div className="privacy-row">
            <span><LockKeyhole size={15} /> No uploads</span>
            <span><Zap size={15} /> Balanced OCR</span>
            <span><ShieldCheck size={15} /> Offline after setup</span>
          </div>
        </section>
        <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => e.target.files && addFiles(e.target.files)} />
        {aboutOpen && <AboutPanel engine={engine} model={model} onClose={() => setAboutOpen(false)} />}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Header onAbout={() => setAboutOpen(true)} />
      <div className={`workspace ${leftOpen ? "" : "left-closed"} ${rightOpen ? "" : "right-closed"}`}>
        <aside className="document-rail">
          <div className="rail-heading">
            <span>Documents <b>{pages.length}</b></span>
            <button className="icon-button" title="Add document" onClick={() => inputRef.current?.click()}><Plus size={17} /></button>
          </div>
          <div className="page-list">
            {pages.map((page, index) => (
              <button
                key={page.id}
                className={`page-item ${page.id === activeId ? "active" : ""}`}
                onClick={() => {
                  setActiveId(page.id);
                  setSelectedLine(undefined);
                }}
              >
                <div className="page-thumb"><img src={page.url} alt="" /></div>
                <div className="page-meta">
                  <strong>{page.name}</strong>
                  <span>Page {index + 1} · {page.status === "complete" ? `${page.lines.length} lines` : page.status}</span>
                </div>
                {page.status === "complete" && <Check className="page-check" size={15} />}
              </button>
            ))}
          </div>
          <div className="rail-footer">
            <div className="device-status">
              <span className={`status-dot ${engineReady ? "ready" : ""}`} />
              <div><strong>{engineLabel}</strong><span>Processing stays local</span></div>
            </div>
          </div>
        </aside>

        <section className="document-stage">
          <div className="stage-toolbar">
            <button className="icon-button panel-toggle" title="Toggle documents" onClick={() => setLeftOpen((value) => !value)}><PanelLeftClose size={18} /></button>
            <div className="file-title">
              <strong>{active?.name}</strong>
              <span>{active ? `${active.width} × ${active.height}` : ""}</span>
            </div>
            <div className="toolbar-spacer" />
            <div className="zoom-controls">
              <button title="Zoom out" onClick={() => setZoom((value) => Math.max(0.3, value - 0.1))}><ZoomOut size={16} /></button>
              <span>{Math.round(zoom * 100)}%</span>
              <button title="Zoom in" onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}><ZoomIn size={16} /></button>
            </div>
            <button className="icon-button" title="Rotate document"><RotateCcw size={17} /></button>
            <button className="icon-button panel-toggle" title="Toggle results" onClick={() => setRightOpen((value) => !value)}><PanelRightClose size={18} /></button>
          </div>

          <div className="canvas-scroll">
            {active && (
              <div className="document-canvas" style={{ width: active.width * zoom, height: active.height * zoom }}>
                <img ref={imageRef} src={active.url} alt={active.name} />
                {active.lines.map((line) => (
                  <button
                    key={line.id}
                    className={`text-region ${selectedLine === line.id ? "selected" : ""}`}
                    style={{
                      left: `${(line.box.x / active.width) * 100}%`,
                      top: `${(line.box.y / active.height) * 100}%`,
                      width: `${(line.box.width / active.width) * 100}%`,
                      height: `${(line.box.height / active.height) * 100}%`,
                    }}
                    title={line.text}
                    onClick={() => setSelectedLine(line.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {active?.status === "processing" && (
            <div className="progress-dock">
              <LoaderCircle className="spin" size={18} />
              <div><strong>{progressLabel}</strong><span>Everything is running on this device</span></div>
              <div className="progress-track"><i style={{ width: `${progress * 100}%` }} /></div>
              <b>{Math.round(progress * 100)}%</b>
            </div>
          )}
        </section>

        <aside className="result-panel">
          <div className="result-heading">
            <div>
              <strong>Extracted text</strong>
              <span>
                {active?.lines.length ?? 0} regions
                {active?.duration ? ` · ${(active.duration / 1000).toFixed(1)}s` : ""}
              </span>
            </div>
            <button className="icon-button" title="More options"><MoreHorizontal size={18} /></button>
          </div>

          {active?.status !== "complete" && active?.status !== "processing" ? (
            <div className="run-state">
              <div className="run-icon"><Sparkles size={24} /></div>
              <strong>Ready to read</strong>
              <p>Run local OCR to find and recognize text in this image.</p>
              <div className="setting-label"><span>Model</span><b>{modelDownloads[model]}</b></div>
              <div className="model-choice">
                {(["tiny", "small", "medium"] as ModelTier[]).map((tier) => (
                  <button key={tier} className={model === tier ? "active" : ""} onClick={() => chooseModel(tier)}>
                    {modelNames[tier]}
                  </button>
                ))}
              </div>
              <div className="setting-label"><span>Runtime</span><b>{engine === "webgpu" ? "Accelerated" : "Compatible"}</b></div>
              <div className="engine-choice">
                <button className={engine === "webgpu" ? "active" : ""} onClick={() => { setEngine("webgpu"); setEngineReady(false); }} disabled={!("gpu" in navigator)}>
                  WebGPU
                </button>
                <button className={engine === "wasm" ? "active" : ""} onClick={() => { setEngine("wasm"); setEngineReady(false); }}>WASM</button>
              </div>
              <button className="primary-button wide" onClick={runOcr}><Play size={16} fill="currentColor" /> Run OCR</button>
              {active?.error && <p className="error-text">{active.error}</p>}
            </div>
          ) : (
            <>
              <div className="result-tools">
                <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search text" />{query && <button onClick={() => setQuery("")}><X size={14} /></button>}</label>
                <select
                  className="compact-model-select"
                  aria-label="OCR model"
                  value={model}
                  onChange={(event) => chooseModel(event.target.value as ModelTier)}
                >
                  <option value="tiny">Fast</option>
                  <option value="small">Balanced</option>
                  <option value="medium">Accurate</option>
                </select>
                <button className="icon-button" title="Run OCR again" onClick={runOcr}><Play size={15} /></button>
                <button className="icon-button" title="Copy all text" onClick={copyText}>{copied ? <Check size={17} /> : <Copy size={17} />}</button>
              </div>
              <div className="lines-list">
                {!active?.lines.length && active?.status === "processing" && (
                  <div className="reading-placeholder"><LoaderCircle className="spin" size={20} /><span>{progressLabel}</span></div>
                )}
                {filteredLines.map((line, index) => (
                  <LineEditor
                    key={line.id}
                    line={line}
                    index={index}
                    selected={selectedLine === line.id}
                    onSelect={() => setSelectedLine(line.id)}
                    onChange={(text) => updateLine(line.id, text)}
                  />
                ))}
              </div>
              <div className="export-bar">
                <button onClick={() => active && downloadText(active.name, active.lines)}><FileText size={16} /> Text</button>
                <button onClick={() => active && downloadJson(active.name, active.lines)}><FileJson size={16} /> JSON</button>
                <button className="export-more"><Download size={16} /><ChevronDown size={13} /></button>
              </div>
            </>
          )}
        </aside>
      </div>
      <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => e.target.files && addFiles(e.target.files)} />
      {active && <button className="delete-fab" title="Remove document" onClick={() => deletePage(active.id)}><Trash2 size={16} /></button>}
      {aboutOpen && <AboutPanel engine={engine} model={model} onClose={() => setAboutOpen(false)} />}
    </main>
  );
}

const modelNames: Record<ModelTier, string> = {
  tiny: "Fast",
  small: "Balanced",
  medium: "Accurate",
};

const modelDownloads: Record<ModelTier, string> = {
  tiny: "~6 MB",
  small: "~31 MB",
  medium: "~139 MB",
};

function Header({ compact = false, onAbout }: { compact?: boolean; onAbout: () => void }) {
  return (
    <header className={`app-header ${compact ? "compact" : ""}`}>
      <div className="brand">
        <div className="brand-mark"><span /><span /><span /></div>
        <strong>Inkwell</strong>
      </div>
      {!compact && <span className="workspace-name">Private workspace</span>}
      <div className="header-spacer" />
      <div className="private-badge"><LockKeyhole size={14} /><span>Local only</span></div>
      <button className="icon-button menu-button" title="About and credits" onClick={onAbout}><Menu size={18} /></button>
    </header>
  );
}

function AboutPanel({
  engine,
  model,
  onClose,
}: {
  engine: Engine;
  model: ModelTier;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="about-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <div className="about-heading">
          <div>
            <span>About this workspace</span>
            <h2 id="about-title">Local OCR, explained</h2>
          </div>
          <button className="icon-button" title="Close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="about-content">
          <p className="about-intro">
            Inkwell is a browser-based OCR interface. Your documents are decoded, detected, and recognized on this device.
          </p>

          <div className="runtime-summary">
            <div><Zap size={17} /><span>Quality</span><strong>{modelNames[model]}</strong></div>
            <div><HardDrive size={17} /><span>Model cache</span><strong>{modelDownloads[model]}</strong></div>
            <div><ServerOff size={17} /><span>Runtime</span><strong>{engine === "webgpu" ? "WebGPU" : "WASM"}</strong></div>
          </div>

          <div className="about-section">
            <h3>How it runs</h3>
            <ol className="process-list">
              <li><b>1</b><span><strong>Decode locally</strong><small>The browser reads the image without uploading it.</small></span></li>
              <li><b>2</b><span><strong>Detect text</strong><small>A local model identifies text regions and reading order.</small></span></li>
              <li><b>3</b><span><strong>Recognize and edit</strong><small>Line crops become editable text with confidence scores.</small></span></li>
              <li><b>4</b><span><strong>Cache for later</strong><small>Model files stay in browser storage for repeat and offline use.</small></span></li>
            </ol>
          </div>

          <div className="about-section">
            <h3>Credits</h3>
            <p>
              The OCR models are from the open-source PP-OCRv6 family created by the PaddleOCR team at PaddlePaddle.
              Model artifacts are loaded from Hugging Face and used under the Apache 2.0 license.
            </p>
            <div className="credit-links">
              <a href="https://huggingface.co/collections/PaddlePaddle/pp-ocrv6" target="_blank" rel="noreferrer">
                Model collection <ExternalLink size={14} />
              </a>
              <a href="https://github.com/PaddlePaddle/PaddleOCR" target="_blank" rel="noreferrer">
                Open-source project <ExternalLink size={14} />
              </a>
              <a href="https://www.paddlepaddle.org.cn/en" target="_blank" rel="noreferrer">
                PaddlePaddle website <ExternalLink size={14} />
              </a>
            </div>
          </div>

          <div className="privacy-note">
            <LockKeyhole size={16} />
            <p><strong>No document upload path</strong><span>Only public model files and app assets are requested from the network.</span></p>
          </div>
        </div>
      </section>
    </div>
  );
}

function LineEditor({
  line,
  index,
  selected,
  onSelect,
  onChange,
}: {
  line: OcrLine;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (text: string) => void;
}) {
  const confidence = Math.max(0, Math.min(1, line.confidence));
  return (
    <div className={`line-editor ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="line-number">{String(index + 1).padStart(2, "0")}</div>
      <textarea value={line.text} onChange={(event) => onChange(event.target.value)} rows={Math.max(1, Math.ceil(line.text.length / 34))} />
      <div className={`confidence ${confidence < 0.75 ? "low" : ""}`} title={`${Math.round(confidence * 100)}% confidence`}>
        {Math.round(confidence * 100)}%
      </div>
    </div>
  );
}
