import type { DocumentPage, OcrLine } from "../types";

export async function fileToPage(file: File): Promise<DocumentPage> {
  const url = URL.createObjectURL(file);
  const dimensions = await getImageDimensions(url);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    url,
    ...dimensions,
    lines: [],
    status: "ready",
  };
}

export function downloadText(name: string, lines: OcrLine[]) {
  download(`${stripExtension(name)}.txt`, lines.map((line) => line.text).join("\n"), "text/plain");
}

export function downloadJson(name: string, lines: OcrLine[]) {
  download(`${stripExtension(name)}.json`, JSON.stringify({ lines }, null, 2), "application/json");
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

function getImageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = url;
  });
}
