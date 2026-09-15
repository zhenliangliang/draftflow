let mermaidInitialized = false;
let renderSequence = 0;

async function getMermaid() {
  const { default: mermaid } = await import("mermaid");
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "neutral",
      htmlLabels: false,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      flowchart: { useMaxWidth: false, curve: "basis" },
    });
    mermaidInitialized = true;
  }
  return mermaid;
}

export async function renderMermaidSvg(source: string) {
  const mermaid = await getMermaid();
  const id = `draftflow-mermaid-${Date.now()}-${renderSequence += 1}`;
  const parsed = await mermaid.parse(source, { suppressErrors: true });
  if (!parsed) throw new Error("Mermaid 语法无法识别，请检查节点或连线写法");
  const { svg } = await mermaid.render(id, source);
  return svg;
}

export async function renderMermaidElements(container: HTMLElement) {
  const diagrams = Array.from(container.querySelectorAll<HTMLElement>("[data-mermaid-diagram]"));
  await Promise.all(diagrams.map(async (figure) => {
    const stage = figure.querySelector<HTMLElement>("[data-mermaid-stage]");
    const encoded = figure.dataset.mermaidDiagram;
    if (!stage || !encoded || figure.dataset.mermaidReady === "true") return;

    try {
      const svg = await renderMermaidSvg(decodeURIComponent(encoded));
      stage.innerHTML = svg;
      const svgElement = stage.querySelector("svg");
      if (svgElement) {
        const viewBox = readSvgViewBox(svgElement);
        svgElement.removeAttribute("height");
        svgElement.removeAttribute("width");
        svgElement.style.display = "block";
        svgElement.style.height = "auto";
        svgElement.style.maxWidth = "none";
        svgElement.style.width = "100%";
        if (viewBox.width / Math.max(1, viewBox.height) > 1.65) {
          figure.classList.add("mermaid-diagram-wide");
          svgElement.style.minWidth = "720px";
        }
      }
      figure.dataset.mermaidReady = "true";
    } catch (error) {
      stage.innerHTML = "";
      const message = document.createElement("span");
      message.className = "mermaid-render-error";
      message.textContent = error instanceof Error ? `架构图生成失败：${error.message}` : "架构图生成失败，请检查 Mermaid 语法";
      stage.append(message);
    }
  }));
}

export async function mermaidToImageFile(source: string, index: number) {
  const svg = await renderMermaidSvg(source);
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(svg, "image/svg+xml");
  const svgElement = documentNode.documentElement;
  const viewBox = readSvgViewBox(svgElement);
  const aspectRatio = viewBox.width / Math.max(1, viewBox.height);
  const targetWidth = Math.round(Math.min(2400, Math.max(1400, viewBox.width * 2)));
  const targetHeight = Math.round(Math.min(6000, targetWidth / Math.max(0.15, aspectRatio)));
  const scale = Math.min(targetWidth / viewBox.width, targetHeight / viewBox.height);
  const width = Math.max(1, Math.round(viewBox.width * scale));
  const height = Math.max(1, Math.round(viewBox.height * scale));

  svgElement.setAttribute("width", String(viewBox.width));
  svgElement.setAttribute("height", String(viewBox.height));
  svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const serialized = new XMLSerializer().serializeToString(svgElement);
  const svgUrl = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建架构图画布");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const png = await canvasBlob(canvas, "image/png");
    if (png.size <= 950 * 1024) return new File([png], `architecture-${index + 1}.png`, { type: "image/png" });

    for (const quality of [0.92, 0.86, 0.8, 0.72, 0.64]) {
      const jpeg = await canvasBlob(canvas, "image/jpeg", quality);
      if (jpeg.size <= 950 * 1024) return new File([jpeg], `architecture-${index + 1}.jpg`, { type: "image/jpeg" });
    }
    throw new Error("架构图转换后仍超过 1MB，请减少节点数量或拆分为多张图");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function readSvgViewBox(svg: Element) {
  const parts = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  const width = parts.length === 4 && Number.isFinite(parts[2]) ? parts[2] : Number.parseFloat(svg.getAttribute("width") || "1200");
  const height = parts.length === 4 && Number.isFinite(parts[3]) ? parts[3] : Number.parseFloat(svg.getAttribute("height") || "800");
  return { width: Math.max(1, width || 1200), height: Math.max(1, height || 800) };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("架构图图片生成失败"));
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("架构图图片编码失败")), type, quality);
  });
}
