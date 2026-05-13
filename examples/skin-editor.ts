import * as skinview3d from "../src/skinview3d";
import * as THREE from "three";

// ─── UV Region Map (64×64 Minecraft skin layout) ─────────────────────────────
interface UVRegion { name: string; x: number; y: number; w: number; h: number; }
interface ViewRect  { x: number; y: number; w: number; h: number; }
interface Pixel     { x: number; y: number; }

const UV_REGIONS: Record<string, UVRegion[]> = {
  head: [
    { name: "Top",    x:  8, y:  0, w: 8, h: 8 },
    { name: "Bottom", x: 16, y:  0, w: 8, h: 8 },
    { name: "Right",  x:  0, y:  8, w: 8, h: 8 },
    { name: "Front",  x:  8, y:  8, w: 8, h: 8 },
    { name: "Left",   x: 16, y:  8, w: 8, h: 8 },
    { name: "Back",   x: 24, y:  8, w: 8, h: 8 },
    { name: "Hat Top",   x: 40, y:  0, w: 8, h: 8 },
    { name: "Hat Front", x: 40, y:  8, w: 8, h: 8 },
  ],
  body: [
    { name: "Top",    x: 20, y: 16, w: 8, h:  4 },
    { name: "Front",  x: 20, y: 20, w: 8, h: 12 },
    { name: "Right",  x: 16, y: 20, w: 4, h: 12 },
    { name: "Left",   x: 28, y: 20, w: 4, h: 12 },
    { name: "Back",   x: 32, y: 20, w: 8, h: 12 },
    { name: "Bottom", x: 28, y: 16, w: 8, h:  4 },
  ],
  right_arm: [
    { name: "Top",   x: 44, y: 16, w: 4, h:  4 },
    { name: "Front", x: 44, y: 20, w: 4, h: 12 },
    { name: "Right", x: 40, y: 20, w: 4, h: 12 },
    { name: "Back",  x: 52, y: 20, w: 4, h: 12 },
  ],
  left_arm: [
    { name: "Top",   x: 36, y: 48, w: 4, h:  4 },
    { name: "Front", x: 36, y: 52, w: 4, h: 12 },
    { name: "Right", x: 32, y: 52, w: 4, h: 12 },
    { name: "Back",  x: 44, y: 52, w: 4, h: 12 },
  ],
  right_leg: [
    { name: "Top",   x:  4, y: 16, w: 4, h:  4 },
    { name: "Front", x:  4, y: 20, w: 4, h: 12 },
    { name: "Right", x:  0, y: 20, w: 4, h: 12 },
    { name: "Back",  x: 12, y: 20, w: 4, h: 12 },
  ],
  left_leg: [
    { name: "Top",   x: 20, y: 48, w: 4, h:  4 },
    { name: "Front", x: 20, y: 52, w: 4, h: 12 },
    { name: "Right", x: 16, y: 52, w: 4, h: 12 },
    { name: "Back",  x: 28, y: 52, w: 4, h: 12 },
  ],
  full: [],
};

const DEFAULT_PALETTE = [
  "#1a1a2e","#16213e","#0f3460","#533483","#e94560",
  "#f5a623","#f8e71c","#7ed321","#4a90e2","#9013fe",
  "#ffffff","#d0d0d0","#a0a0a0","#606060","#303030",
  "#000000","#8b4513","#d2691e","#ff7f50","#ff6347",
];

const QUICK_SKINS = [
  "img/hatsune_miku.png","img/haka.png","img/hacksore.png",
  "img/sethbling.png","img/deadmau5.png","img/ironman_hd.png",
];

// ─── State ────────────────────────────────────────────────────────────────────
let skinCanvas: HTMLCanvasElement;
let skinCtx: CanvasRenderingContext2D;
let editorCanvas: HTMLCanvasElement;
let editorCtx: CanvasRenderingContext2D;
let gridCanvas: HTMLCanvasElement;
let gridCtx: CanvasRenderingContext2D;
let cursorCanvas: HTMLCanvasElement;
let cursorCtx: CanvasRenderingContext2D;

let zoom = 8;
let currentTool = "pencil";
let currentColor = "#3b82f6";
let brushSize = 1;
let opacity = 1.0;
let showGrid = true;
let currentPart = "head";
let undoStack: ImageData[] = [];
let redoStack: ImageData[] = [];
let isDrawing = false;
let lastPixel: Pixel | null = null;
let palette = [...DEFAULT_PALETTE];

let skinViewer: skinview3d.SkinViewer | null = null;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let hoverHighlight: THREE.Mesh | null = null;
let playerGridGroup: THREE.Group | null = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  skinCanvas = document.createElement("canvas");
  skinCanvas.width = 64; skinCanvas.height = 64;
  skinCtx = skinCanvas.getContext("2d")!;
  skinCtx.imageSmoothingEnabled = false;

  editorCanvas = document.getElementById("editor-canvas") as HTMLCanvasElement;
  editorCtx = editorCanvas.getContext("2d")!;
  editorCtx.imageSmoothingEnabled = false;

  gridCanvas = document.getElementById("grid-canvas") as HTMLCanvasElement;
  gridCtx = gridCanvas.getContext("2d")!;

  cursorCanvas = document.getElementById("cursor-canvas") as HTMLCanvasElement;
  cursorCtx = cursorCanvas.getContext("2d")!;

  initViewer();
  loadSkinFromUrl(QUICK_SKINS[0]);
  buildPalette();
  buildQuickSkins();
  bindEvents();
  setTimeout(fitZoom, 150);
}

// ─── 3D Viewer ────────────────────────────────────────────────────────────────
function initViewer() {
  const previewCanvas = document.getElementById("skin-preview-canvas") as HTMLCanvasElement;
  const size = previewCanvas.offsetWidth || 200;
  skinViewer = new skinview3d.SkinViewer({ canvas: previewCanvas, width: size, height: size });
  skinViewer.zoom = 0.9;
  skinViewer.autoRotate = true;
  skinViewer.autoRotateSpeed = 1.5;
  skinViewer.globalLight.intensity = 3;
  skinViewer.cameraLight.intensity = 0.6;

  // Create hover highlight mesh (a small red cube or plane)
  const geo = new THREE.BoxGeometry(1.01, 1.01, 1.01); // slightly larger than a pixel unit in 3d space? 
  // Actually, skinview3d uses units like 8 for head, etc. 
  // Better: use a small plane that sticks to the surface.
  const highlightGeo = new THREE.PlaneGeometry(1, 1);
  const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthTest: false });
  hoverHighlight = new THREE.Mesh(highlightGeo, highlightMat);
  hoverHighlight.visible = false;
  hoverHighlight.renderOrder = 999;
  skinViewer.scene.add(hoverHighlight);

  // Bind 3D events
  previewCanvas.addEventListener("mousedown", onPreviewMouseDown);
  previewCanvas.addEventListener("mousemove", onPreviewMouseMove);
  previewCanvas.addEventListener("mouseup", onPreviewMouseUp);
  previewCanvas.addEventListener("mouseleave", () => {
    if (hoverHighlight) hoverHighlight.visible = false;
  });

  init3DGrid();
}

function init3DGrid() {
  if (!skinViewer) return;
  
  // Create a 64x64 grid texture
  const gridCanvas = document.createElement("canvas");
  gridCanvas.width = 64; gridCanvas.height = 64;
  const ctx = gridCanvas.getContext("2d")!;
  ctx.strokeStyle = "rgba(74, 222, 128, 0.5)"; // green grid
  ctx.lineWidth = 0.1;
  for(let i=0; i<=64; i++) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke();
  }
  const gridTex = new THREE.CanvasTexture(gridCanvas);
  gridTex.magFilter = THREE.NearestFilter;
  gridTex.minFilter = THREE.NearestFilter;
  
  const gridMat = new THREE.MeshBasicMaterial({ 
    map: gridTex, 
    transparent: true, 
    opacity: 0.3, 
    side: THREE.DoubleSide,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -1, // bring to front
  });

  // Use a non-recursive approach or check name to avoid infinite loop
  const meshes: THREE.Mesh[] = [];
  skinViewer.playerObject.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.name !== "partGrid") {
      meshes.push(obj);
    }
  });

  for (const mesh of meshes) {
    const gridOverlay = new THREE.Mesh(mesh.geometry, gridMat);
    gridOverlay.name = "partGrid";
    gridOverlay.visible = false;
    mesh.add(gridOverlay);
  }
}

function toggle3DGrid(visible: boolean) {
  if (!skinViewer) return;
  skinViewer.playerObject.traverse((obj) => {
    if (obj.name === "partGrid") {
      obj.visible = visible;
    }
  });
}

function updateViewer() {
  if (!skinViewer) return;
  const url = skinCanvas.toDataURL("image/png");
  const modelSel = document.getElementById("model-select") as HTMLSelectElement;
  skinViewer.loadSkin(url, { model: (modelSel?.value || "auto-detect") as import("skinview-utils").ModelType });
}

// ─── Load skin ────────────────────────────────────────────────────────────────
function loadSkinFromUrl(url: string) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    skinCtx.clearRect(0, 0, 64, 64);
    skinCtx.drawImage(img, 0, 0, 64, 64);
    undoStack = [];
    saveUndo();
    renderEditor();
    updateViewer();
  };
  img.onerror = () => {
    skinCtx.fillStyle = "#888888";
    skinCtx.fillRect(0, 0, 64, 64);
    renderEditor(); updateViewer();
  };
  img.src = url;
}

// ─── Undo / Redo ─────────────────────────────────────────────────────────────
function saveUndo() {
  undoStack.push(skinCtx.getImageData(0, 0, 64, 64));
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
}
function undo() {
  if (undoStack.length <= 1) return;
  redoStack.push(undoStack.pop()!);
  skinCtx.putImageData(undoStack[undoStack.length - 1], 0, 0);
  renderEditor(); updateViewer();
}
function redo() {
  if (!redoStack.length) return;
  const state = redoStack.pop()!;
  undoStack.push(state);
  skinCtx.putImageData(state, 0, 0);
  renderEditor(); updateViewer();
}

// ─── Viewport ─────────────────────────────────────────────────────────────────
function getViewRect(): ViewRect {
  if (currentPart === "full") return { x: 0, y: 0, w: 64, h: 64 };
  const regions = UV_REGIONS[currentPart];
  if (!regions?.length) return { x: 0, y: 0, w: 64, h: 64 };
  let minX = 64, minY = 64, maxX = 0, maxY = 0;
  for (const r of regions) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  const pad = 4;
  const x = Math.max(0, minX - pad), y = Math.max(0, minY - pad);
  return { x, y, w: Math.min(64, maxX + pad) - x, h: Math.min(64, maxY + pad) - y };
}

function setZoom(z: number) {
  zoom = Math.max(1, Math.min(32, Math.round(z)));
  document.getElementById("zoom-label")!.textContent = zoom + "x";
  const vr = getViewRect();
  const w = vr.w * zoom, h = vr.h * zoom;
  for (const c of [editorCanvas, gridCanvas, cursorCanvas]) { c.width = w; c.height = h; }
  editorCtx.imageSmoothingEnabled = false;
  renderEditor();
}

function fitZoom() {
  const wrap = document.getElementById("canvas-wrap")!;
  const vr = getViewRect();
  const zx = Math.floor((wrap.clientWidth  - 48) / vr.w);
  const zy = Math.floor((wrap.clientHeight - 48) / vr.h);
  setZoom(Math.max(1, Math.min(zx, zy)));
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderEditor() {
  const vr = getViewRect();
  const w = vr.w * zoom, h = vr.h * zoom;
  editorCtx.clearRect(0, 0, w, h);
  editorCtx.imageSmoothingEnabled = false;
  editorCtx.drawImage(skinCanvas, vr.x, vr.y, vr.w, vr.h, 0, 0, w, h);
  drawGrid(vr);
}

function drawGrid(vr: ViewRect) {
  const w = vr.w * zoom, h = vr.h * zoom;
  gridCtx.clearRect(0, 0, w, h);

  // UV region highlight
  if (currentPart !== "full") {
    for (const r of UV_REGIONS[currentPart] || []) {
      const rx = (r.x - vr.x) * zoom, ry = (r.y - vr.y) * zoom;
      gridCtx.strokeStyle = "rgba(108,99,255,0.7)";
      gridCtx.lineWidth = 1.5;
      gridCtx.strokeRect(rx + 0.5, ry + 0.5, r.w * zoom - 1, r.h * zoom - 1);
      // label
      if (zoom >= 6) {
        gridCtx.fillStyle = "rgba(108,99,255,0.9)";
        gridCtx.font = `${Math.max(9, zoom - 2)}px Inter,sans-serif`;
        gridCtx.fillText(r.name, rx + 2, ry + Math.max(11, zoom));
      }
    }
  }

  // pixel grid
  if (showGrid && zoom >= 4) {
    gridCtx.strokeStyle = "rgba(255,255,255,0.07)";
    gridCtx.lineWidth = 1;
    for (let c = 0; c <= vr.w; c++) {
      gridCtx.beginPath(); gridCtx.moveTo(c * zoom + 0.5, 0); gridCtx.lineTo(c * zoom + 0.5, h); gridCtx.stroke();
    }
    for (let r = 0; r <= vr.h; r++) {
      gridCtx.beginPath(); gridCtx.moveTo(0, r * zoom + 0.5); gridCtx.lineTo(w, r * zoom + 0.5); gridCtx.stroke();
    }
  }
}

// ─── Coord helpers ────────────────────────────────────────────────────────────
function canvasToSkin(cx: number, cy: number): Pixel {
  const vr = getViewRect();
  return { x: Math.floor(cx / zoom) + vr.x, y: Math.floor(cy / zoom) + vr.y };
}

function hexToRgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ─── Drawing tools ────────────────────────────────────────────────────────────
function paintPixel(sx: number, sy: number) {
  if (sx < 0 || sy < 0 || sx >= 64 || sy >= 64) return;
  if (currentTool === "eraser") { skinCtx.clearRect(sx, sy, brushSize, brushSize); }
  else { skinCtx.fillStyle = hexToRgba(currentColor, opacity); skinCtx.fillRect(sx, sy, brushSize, brushSize); }
}

function drawLine(x0: number, y0: number, x1: number, y1: number) {
  let dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
  let sx = x0<x1?1:-1, sy = y0<y1?1:-1, err = dx-dy;
  while (true) {
    paintPixel(x0, y0);
    if (x0===x1 && y0===y1) break;
    const e2 = 2*err;
    if (e2>-dy){err-=dy;x0+=sx;}
    if (e2< dx){err+=dx;y0+=sy;}
  }
}

function floodFill(sx: number, sy: number) {
  const imageData = skinCtx.getImageData(0,0,64,64);
  const d = imageData.data;
  const ti = (sy*64+sx)*4;
  const tr=d[ti], tg=d[ti+1], tb=d[ti+2], ta=d[ti+3];
  const fr=parseInt(currentColor.slice(1,3),16);
  const fg=parseInt(currentColor.slice(3,5),16);
  const fb=parseInt(currentColor.slice(5,7),16);
  const fa=Math.round(opacity*255);
  if (tr===fr&&tg===fg&&tb===fb&&ta===fa) return;
  const stack:number[][] = [[sx,sy]];
  const visited = new Uint8Array(64*64);
  while (stack.length) {
    const [x,y] = stack.pop()!;
    if (x<0||y<0||x>=64||y>=64) continue;
    if (visited[y*64+x]) continue;
    const i=(y*64+x)*4;
    if (d[i]!==tr||d[i+1]!==tg||d[i+2]!==tb||d[i+3]!==ta) continue;
    visited[y*64+x]=1;
    d[i]=fr; d[i+1]=fg; d[i+2]=fb; d[i+3]=fa;
    stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
  skinCtx.putImageData(imageData,0,0);
}

function pickColor(sx: number, sy: number) {
  const px = skinCtx.getImageData(sx,sy,1,1).data;
  const hex = "#"+[px[0],px[1],px[2]].map(v=>v.toString(16).padStart(2,"0")).join("");
  setColor(hex);
}

// ─── Color ────────────────────────────────────────────────────────────────────
function setColor(hex: string) {
  currentColor = hex;
  (document.getElementById("color-picker") as HTMLInputElement).value = hex;
  (document.getElementById("color-hex") as HTMLInputElement).value = hex;
  (document.getElementById("color-preview") as HTMLElement).style.background = hex;
}

// ─── Palette ──────────────────────────────────────────────────────────────────
function buildPalette() {
  const grid = document.getElementById("palette-grid")!;
  grid.innerHTML = "";
  for (const c of palette) {
    const sw = document.createElement("div");
    sw.className = "palette-swatch"; sw.style.background = c; sw.title = c;
    sw.addEventListener("click", () => setColor(c));
    sw.addEventListener("contextmenu", e => { e.preventDefault(); palette=palette.filter(p=>p!==c); buildPalette(); });
    grid.appendChild(sw);
  }
}

function addToPalette(hex: string) {
  if (!palette.includes(hex)) { palette.push(hex); buildPalette(); }
}

// ─── Quick Skins ──────────────────────────────────────────────────────────────
function buildQuickSkins() {
  const wrap = document.getElementById("quick-skins")!;
  for (const url of QUICK_SKINS) {
    const btn = document.createElement("button");
    btn.className = "quick-skin-btn"; btn.title = url;
    const img = document.createElement("img");
    img.src = url; img.style.imageRendering = "pixelated";
    btn.appendChild(img);
    btn.addEventListener("click", () => loadSkinFromUrl(url));
    wrap.appendChild(btn);
  }
}

// ─── Cursor preview ───────────────────────────────────────────────────────────
function drawCursorPreview(cx: number, cy: number) {
  const vr = getViewRect();
  cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
  const { x, y } = canvasToSkin(cx, cy);
  const px = (x - vr.x) * zoom, py = (y - vr.y) * zoom;
  const size = brushSize * zoom;
  cursorCtx.strokeStyle = "rgba(255,255,255,0.85)";
  cursorCtx.lineWidth = 1;
  cursorCtx.strokeRect(px + 0.5, py + 0.5, size, size);
}

// ─── Events ───────────────────────────────────────────────────────────────────
function bindEvents() {
  // Tools
  document.querySelectorAll<HTMLButtonElement>(".tool-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active"); currentTool = btn.dataset.tool!;
      updateCursorStyle();
    });
  });

  // UV tabs
  document.querySelectorAll<HTMLButtonElement>(".uv-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".uv-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active"); currentPart = tab.dataset.part!;
      fitZoom();
    });
  });

  // Zoom
  document.getElementById("btn-zoom-in")!.addEventListener("click", () => setZoom(zoom * 2));
  document.getElementById("btn-zoom-out")!.addEventListener("click", () => setZoom(zoom / 2));
  document.getElementById("btn-zoom-fit")!.addEventListener("click", fitZoom);
  document.getElementById("btn-undo")!.addEventListener("click", undo);
  document.getElementById("btn-redo")!.addEventListener("click", redo);

  // Brush size
  const brushEl = document.getElementById("brush-size") as HTMLInputElement;
  brushEl.addEventListener("input", () => { brushSize=+brushEl.value; document.getElementById("brush-size-val")!.textContent=brushSize+"px"; });

  // Opacity
  const opEl = document.getElementById("opacity-slider") as HTMLInputElement;
  opEl.addEventListener("input", () => { opacity=+opEl.value/100; document.getElementById("opacity-val")!.textContent=opEl.value+"%"; });

  // Grid
  (document.getElementById("toggle-grid") as HTMLInputElement).addEventListener("change", e => {
    showGrid=(e.target as HTMLInputElement).checked; renderEditor();
  });

  (document.getElementById("toggle-3d-grid") as HTMLInputElement).addEventListener("change", e => {
    toggle3DGrid((e.target as HTMLInputElement).checked);
  });

  // Color picker
  const cp = document.getElementById("color-picker") as HTMLInputElement;
  const ch = document.getElementById("color-hex") as HTMLInputElement;
  cp.addEventListener("input", () => setColor(cp.value));
  ch.addEventListener("change", () => { const v=ch.value.startsWith("#")?ch.value:"#"+ch.value; if(/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v); });

  // Palette add
  document.getElementById("btn-add-palette")!.addEventListener("click", () => addToPalette(currentColor));

  // Upload / Download
  document.getElementById("btn-upload-skin")!.addEventListener("click", () => (document.getElementById("upload-input") as HTMLInputElement).click());
  (document.getElementById("upload-input") as HTMLInputElement).addEventListener("change", e => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    loadSkinFromUrl(URL.createObjectURL(f));
  });
  document.getElementById("btn-download-skin")!.addEventListener("click", () => {
    const a = document.createElement("a"); a.download="my_skin.png"; a.href=skinCanvas.toDataURL("image/png"); a.click();
  });

  // Model
  (document.getElementById("model-select") as HTMLSelectElement).addEventListener("change", updateViewer);

  // Animations
  document.querySelectorAll<HTMLButtonElement>(".anim-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".anim-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      if (!skinViewer) return;
      const a = btn.dataset.anim;
      skinViewer.animation = a==="idle"? new skinview3d.IdleAnimation()
        : a==="walk"? new skinview3d.WalkingAnimation()
        : a==="run"?  new skinview3d.RunningAnimation()
        : null;
    });
  });

  // Canvas mouse events
  editorCanvas.addEventListener("mousedown", onMouseDown);
  editorCanvas.addEventListener("mousemove", onMouseMove);
  editorCanvas.addEventListener("mouseup",    onMouseUp);
  editorCanvas.addEventListener("mouseleave", onMouseUp);
  editorCanvas.addEventListener("contextmenu", e => e.preventDefault());
  editorCanvas.addEventListener("mousemove", e => {
    const r = editorCanvas.getBoundingClientRect();
    drawCursorPreview(e.clientX - r.left, e.clientY - r.top);
  });
  editorCanvas.addEventListener("mouseleave", () => cursorCtx.clearRect(0,0,cursorCanvas.width,cursorCanvas.height));

  // Wheel zoom
  editorCanvas.addEventListener("wheel", e => { e.preventDefault(); setZoom(e.deltaY < 0 ? zoom*1.5 : zoom/1.5); }, { passive: false });

  // Keyboard
  window.addEventListener("keydown", e => {
    if (e.ctrlKey && e.key==="z")           { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && (e.key==="y"||e.key==="Y")) { e.preventDefault(); redo(); return; }
    const map: Record<string,string> = { p:"pencil", e:"eraser", f:"fill", i:"eyedropper" };
    if (map[e.key]) {
      currentTool=map[e.key];
      document.querySelectorAll<HTMLButtonElement>(".tool-btn").forEach(b=>b.classList.toggle("active",b.dataset.tool===currentTool));
      updateCursorStyle();
    }
  });
}

function updateCursorStyle() {
  const cursors: Record<string,string> = { pencil:"crosshair", eraser:"cell", fill:"copy", eyedropper:"pointer" };
  editorCanvas.style.cursor = cursors[currentTool] || "crosshair";
}

function getEventPos(e: MouseEvent) {
  const rect = editorCanvas.getBoundingClientRect();
  return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
}

function onMouseDown(e: MouseEvent) {
  e.preventDefault();
  const { cx, cy } = getEventPos(e);
  const { x, y } = canvasToSkin(cx, cy);
  isDrawing = true;
  if (currentTool==="eyedropper") { pickColor(x,y); isDrawing=false; return; }
  if (currentTool==="fill") { saveUndo(); floodFill(x,y); renderEditor(); updateViewer(); isDrawing=false; return; }
  saveUndo(); paintPixel(x,y); lastPixel={x,y}; renderEditor();
}

function onMouseMove(e: MouseEvent) {
  if (!isDrawing || !lastPixel) return;
  const { cx, cy } = getEventPos(e);
  const { x, y } = canvasToSkin(cx, cy);
  if (lastPixel.x!==x || lastPixel.y!==y) {
    drawLine(lastPixel.x, lastPixel.y, x, y);
    lastPixel={x,y}; renderEditor();
  }
}

function onMouseUp() {
  if (isDrawing) { isDrawing=false; updateViewer(); }
  lastPixel=null;
}

// ─── 3D Preview Painting ──────────────────────────────────────────────────────
let is3DPainting = false;

function get3DUVPoint(e: MouseEvent) {
  if (!skinViewer) return null;
  const rect = skinViewer.canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, skinViewer.camera);
  const intersects = raycaster.intersectObject(skinViewer.playerObject, true);

  if (intersects.length > 0) {
    const hit = intersects[0];
    if (hit.uv) {
      // Map UV to 64x64 texture
      const x = Math.floor(hit.uv.x * 64);
      const y = Math.floor((1 - hit.uv.y) * 64);
      return { x, y, hit };
    }
  }
  return null;
}

function onPreviewMouseDown(e: MouseEvent) {
  const point = get3DUVPoint(e);
  if (point) {
    // Disable OrbitControls while painting
    if (skinViewer) skinViewer.controls.enabled = false;
    is3DPainting = true;
    
    if (currentTool === "eyedropper") {
      pickColor(point.x, point.y);
      is3DPainting = false;
      if (skinViewer) skinViewer.controls.enabled = true;
    } else if (currentTool === "fill") {
      saveUndo();
      floodFill(point.x, point.y);
      renderEditor(); updateViewer();
      is3DPainting = false;
      if (skinViewer) skinViewer.controls.enabled = true;
    } else {
      saveUndo();
      paintPixel(point.x, point.y);
      renderEditor();
      updateViewer();
    }
  }
}

function onPreviewMouseMove(e: MouseEvent) {
  const point = get3DUVPoint(e);
  
  if (hoverHighlight) {
    if (point) {
      hoverHighlight.visible = true;
      // Position highlight slightly off the surface
      hoverHighlight.position.copy(point.hit.point).add(point.hit.face!.normal.clone().multiplyScalar(0.01));
      hoverHighlight.lookAt(point.hit.point.clone().add(point.hit.face!.normal));
      
      // Scale highlight to roughly one pixel size (1/64th of the total size? No, meshes have different sizes)
      // For simplicity, a small fixed scale that looks like a pixel
      hoverHighlight.scale.set(0.6, 0.6, 1); 
    } else {
      hoverHighlight.visible = false;
    }
  }

  if (is3DPainting && point) {
    paintPixel(point.x, point.y);
    renderEditor();
    updateViewer();
  }
}

function onPreviewMouseUp() {
  is3DPainting = false;
  if (skinViewer) skinViewer.controls.enabled = true;
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", init);
