export async function createSampleFile(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#fbfaf7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#18201d";
  ctx.font = "700 28px Arial";
  ctx.fillText("NORTHSTAR STUDIO", 88, 104);
  ctx.fillStyle = "#62706a";
  ctx.font = "16px Arial";
  ctx.fillText("STRATEGY  /  RESEARCH  /  PRODUCT", 88, 138);
  ctx.strokeStyle = "#cad0cc";
  ctx.beginPath();
  ctx.moveTo(88, 180);
  ctx.lineTo(1152, 180);
  ctx.stroke();

  ctx.fillStyle = "#18201d";
  ctx.font = "700 54px Georgia";
  ctx.fillText("Research brief", 88, 275);
  ctx.font = "700 54px Georgia";
  ctx.fillText("Local-first intelligence", 88, 342);
  ctx.fillStyle = "#4f5e58";
  ctx.font = "24px Arial";
  wrap(ctx, "A practical field note on private document processing, resilient interfaces, and software that keeps the user in control.", 88, 410, 920, 38);

  ctx.fillStyle = "#147b62";
  ctx.fillRect(88, 540, 12, 298);
  ctx.fillStyle = "#18201d";
  ctx.font = "700 22px Arial";
  ctx.fillText("EXECUTIVE SUMMARY", 132, 575);
  ctx.font = "24px Georgia";
  wrap(ctx, "The best tools disappear into the work. They are fast enough to feel immediate, clear enough to inspire confidence, and private by default.", 132, 630, 870, 42);
  wrap(ctx, "Local inference changes the relationship between people and their documents: no upload queue, no account gate, and no ambiguity about where the data went.", 132, 748, 870, 42);

  section(ctx, "01", "Design for trust", "Make privacy visible, make progress legible, and let every result be corrected. Confidence comes from control, not slogans.", 88, 980);
  section(ctx, "02", "Build for real work", "Support batches, searchable output, clean exports, and the small review decisions that determine whether OCR is actually useful.", 650, 980);
  section(ctx, "03", "Stay useful offline", "Cache the model and application shell so the workspace remains available on a train, in the field, or behind a strict firewall.", 88, 1285);
  section(ctx, "04", "Measure honestly", "Separate model time from preprocessing and rendering. Report the device, engine, input size, and warm-up behavior.", 650, 1285);

  ctx.fillStyle = "#61706a";
  ctx.font = "15px Arial";
  ctx.fillText("Northstar Studio  ·  Internal research note  ·  19 June 2026", 88, 1660);
  ctx.textAlign = "right";
  ctx.fillText("01", 1152, 1660);
  ctx.textAlign = "left";

  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/png"));
  return new File([blob], "northstar-research-brief.png", { type: "image/png" });
}

function section(ctx: CanvasRenderingContext2D, number: string, title: string, copy: string, x: number, y: number) {
  ctx.fillStyle = "#147b62";
  ctx.font = "700 18px Arial";
  ctx.fillText(number, x, y);
  ctx.fillStyle = "#18201d";
  ctx.font = "700 27px Georgia";
  ctx.fillText(title, x, y + 48);
  ctx.fillStyle = "#4f5e58";
  ctx.font = "20px Arial";
  wrap(ctx, copy, x, y + 92, 450, 32);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const next = `${line}${word} `;
    if (ctx.measureText(next).width > width && line) {
      ctx.fillText(line.trim(), x, y);
      line = `${word} `;
      y += lineHeight;
    } else {
      line = next;
    }
  }
  ctx.fillText(line.trim(), x, y);
}
