import * as skinview3d from "../src/skinview3d";
import * as THREE from "three";
import type { ModelType } from "skinview-utils";
import type { BackEquipment } from "../src/model";
import "./style.css";

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
  ],
  body: [
    { name: "Top",    x: 20, y: 16, w: 8, h:  4 },
    { name: "Front",  x: 20, y: 20, w: 8, h: 12 },
    { name: "Right",  x: 16, y: 20, w: 4, h: 12 },
    { name: "Left",   x: 28, y: 20, w: 4, h: 12 },
    { name: "Back",   x: 32, y: 20, w: 8, h: 12 },
    { name: "Bottom", x: 28, y: 16, w: 8, h:  4 },
  ],
  rightArm: [
    { name: "Top",   x: 44, y: 16, w: 4, h:  4 },
    { name: "Front", x: 44, y: 20, w: 4, h: 12 },
    { name: "Right", x: 40, y: 20, w: 4, h: 12 },
    { name: "Back",  x: 52, y: 20, w: 4, h: 12 },
  ],
  leftArm: [
    { name: "Top",   x: 36, y: 48, w: 4, h:  4 },
    { name: "Front", x: 36, y: 52, w: 4, h: 12 },
    { name: "Right", x: 32, y: 52, w: 4, h: 12 },
    { name: "Back",  x: 44, y: 52, w: 4, h: 12 },
  ],
  rightLeg: [
    { name: "Top",   x:  4, y: 16, w: 4, h:  4 },
    { name: "Front", x:  4, y: 20, w: 4, h: 12 },
    { name: "Right", x:  0, y: 20, w: 4, h: 12 },
    { name: "Back",  x: 12, y: 20, w: 4, h: 12 },
  ],
  leftLeg: [
    { name: "Top",   x: 20, y: 48, w: 4, h:  4 },
    { name: "Front", x: 20, y: 52, w: 4, h: 12 },
    { name: "Right", x: 16, y: 52, w: 4, h: 12 },
    { name: "Back",  x: 28, y: 52, w: 4, h: 12 },
  ],
  full: [],
};

const skinParts = ["head", "body", "rightArm", "leftArm", "rightLeg", "leftLeg"];
const skinLayers = ["innerLayer", "outerLayer"];
const availableAnimations = {
	idle: new skinview3d.IdleAnimation(),
	walk: new skinview3d.WalkingAnimation(),
	run: new skinview3d.RunningAnimation(),
	fly: new skinview3d.FlyingAnimation(),
	wave: new skinview3d.WaveAnimation(),
	crouch: new skinview3d.CrouchAnimation(),
	hit: new skinview3d.HitAnimation(),
	swim: new skinview3d.SwimAnimation(),
};

// ─── State ────────────────────────────────────────────────────────────────────
let skinViewer: skinview3d.SkinViewer;
let skinCanvas: HTMLCanvasElement;
let skinCtx: CanvasRenderingContext2D;
let editorCanvas: HTMLCanvasElement;
let editorCtx: CanvasRenderingContext2D;
let gridCanvas: HTMLCanvasElement;
let gridCtx: CanvasRenderingContext2D;
let cursorCanvas: HTMLCanvasElement;
let cursorCtx: CanvasRenderingContext2D;

let zoomEditor = 8;
let currentTool = "pencil";
let currentColor = "#3b82f6";
let brushSize = 1;
let opacity = 1.0;
let showGrid2D = true;
let currentPart = "head";
let undoStack: ImageData[] = [];
let redoStack: ImageData[] = [];
let isDrawing = false;
let lastPixel: Pixel | null = null;

let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let hoverHighlight: THREE.Mesh | null = null;

// ─── Existing Logic ───────────────────────────────────────────────────────────
function obtainTextureUrl(id: string): string {
	const urlInput = document.getElementById(id) as HTMLInputElement;
	const fileInput = document.getElementById(`${id}_upload`) as HTMLInputElement;
	const unsetButton = document.getElementById(`${id}_unset`);
	const file = fileInput?.files?.[0];

	if (!file) {
		if (unsetButton && !unsetButton.classList.contains("hidden")) {
			unsetButton.classList.add("hidden");
		}
		return urlInput?.value || "";
	}

	if (unsetButton) unsetButton.classList.remove("hidden");
	if (urlInput) { urlInput.value = `Local file: ${file.name}`; urlInput.readOnly = true; }
	return URL.createObjectURL(file);
}

function reloadSkin(): void {
	const input = document.getElementById("skin_url") as HTMLInputElement;
	const url = obtainTextureUrl("skin_url");
	if (url === "") {
		skinViewer.loadSkin(null);
	} else {
		const skinModel = document.getElementById("skin_model") as HTMLSelectElement;
		const earsSource = document.getElementById("ears_source") as HTMLSelectElement;

		skinViewer.loadSkin(url, {
			model: skinModel?.value as ModelType,
			ears: earsSource?.value === "current_skin",
		}).then(() => {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => {
				skinCtx.clearRect(0,0,64,64);
				skinCtx.drawImage(img,0,0,64,64);
				undoStack = [];
				saveUndo();
				renderEditor();
			};
			img.src = url;
		});
	}
}

function reloadCape(): void {
	const url = obtainTextureUrl("cape_url");
	if (url === "") skinViewer.loadCape(null);
	else {
		const selectedBackEquipment = document.querySelector('input[type="radio"][name="back_equipment"]:checked') as HTMLInputElement;
		skinViewer.loadCape(url, { backEquipment: selectedBackEquipment?.value as BackEquipment });
	}
}

function reloadEars(skipSkinReload = false): void {
	const earsSource = document.getElementById("ears_source") as HTMLSelectElement;
	const sourceType = earsSource?.value;
	if (sourceType === "none") skinViewer.loadEars(null);
	else if (sourceType === "current_skin") { if (!skipSkinReload) reloadSkin(); }
	else {
		const url = obtainTextureUrl("ears_url");
		if (url === "") skinViewer.loadEars(null);
		else skinViewer.loadEars(url, { textureType: sourceType as any });
	}
}

function reloadPanorama(): void {
	const url = obtainTextureUrl("panorama_url");
	if (url === "") skinViewer.background = null;
	else skinViewer.loadPanorama(url);
}

function updateBackground(): void {
	const backgroundType = (document.getElementById("background_type") as HTMLSelectElement)?.value;
	if (backgroundType === "color") {
		skinViewer.background = (document.getElementById("background_color") as HTMLInputElement)?.value;
	} else reloadPanorama();
}

// ─── Editor Logic ─────────────────────────────────────────────────────────────
function saveUndo() {
  undoStack.push(skinCtx.getImageData(0, 0, 64, 64));
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
}
function undo() {
  if (undoStack.length <= 1) return;
  redoStack.push(undoStack.pop()!);
  skinCtx.putImageData(undoStack[undoStack.length - 1], 0, 0);
  renderEditor(); syncTo3D();
}
function redo() {
  if (!redoStack.length) return;
  const state = redoStack.pop()!;
  undoStack.push(state);
  skinCtx.putImageData(state, 0, 0);
  renderEditor(); syncTo3D();
}

function syncTo3D() {
	const url = skinCanvas.toDataURL("image/png");
	const skinModel = document.getElementById("skin_model") as HTMLSelectElement;
	skinViewer.loadSkin(url, { model: skinModel?.value as any });
}

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

function setZoomEditor(z: number) {
  zoomEditor = Math.max(1, Math.min(32, Math.round(z)));
  document.getElementById("zoom-label")!.textContent = zoomEditor + "x";
  const vr = getViewRect();
  const w = vr.w * zoomEditor, h = vr.h * zoomEditor;
  [editorCanvas, gridCanvas, cursorCanvas].forEach(c => { c.width = w; c.height = h; });
  renderEditor();
}

function renderEditor() {
  const vr = getViewRect();
  const w = vr.w * zoomEditor, h = vr.h * zoomEditor;
  editorCtx.clearRect(0, 0, w, h);
  editorCtx.imageSmoothingEnabled = false;
  editorCtx.drawImage(skinCanvas, vr.x, vr.y, vr.w, vr.h, 0, 0, w, h);
  drawGrid2D(vr);
}

function drawGrid2D(vr: ViewRect) {
  const w = vr.w * zoomEditor, h = vr.h * zoomEditor;
  gridCtx.clearRect(0, 0, w, h);
  if (showGrid2D && zoomEditor >= 4) {
    gridCtx.strokeStyle = "rgba(255,255,255,0.07)";
    for (let c = 0; c <= vr.w; c++) {
      gridCtx.beginPath(); gridCtx.moveTo(c * zoomEditor + 0.5, 0); gridCtx.lineTo(c * zoomEditor + 0.5, h); gridCtx.stroke();
    }
    for (let r = 0; r <= vr.h; r++) {
      gridCtx.beginPath(); gridCtx.moveTo(0, r * zoomEditor + 0.5); gridCtx.lineTo(w, r * zoomEditor + 0.5); gridCtx.stroke();
    }
  }
}

function paintPixel(sx: number, sy: number) {
  if (sx < 0 || sy < 0 || sx >= 64 || sy >= 64) return;
  if (currentTool === "eraser") skinCtx.clearRect(sx, sy, brushSize, brushSize);
  else { 
	const r = parseInt(currentColor.slice(1,3),16), g = parseInt(currentColor.slice(3,5),16), b = parseInt(currentColor.slice(5,7),16);
	skinCtx.fillStyle = `rgba(${r},${g},${b},${opacity})`; 
	skinCtx.fillRect(sx, sy, brushSize, brushSize); 
  }
}

function floodFill(sx: number, sy: number) {
  const imageData = skinCtx.getImageData(0,0,64,64);
  const d = imageData.data;
  const ti = (sy*64+sx)*4;
  const tr=d[ti], tg=d[ti+1], tb=d[ti+2], ta=d[ti+3];
  const fr=parseInt(currentColor.slice(1,3),16), fg=parseInt(currentColor.slice(3,5),16), fb=parseInt(currentColor.slice(5,7),16), fa=Math.round(opacity*255);
  if (tr===fr&&tg===fg&&tb===fb&&ta===fa) return;
  const stack:number[][] = [[sx,sy]];
  const visited = new Uint8Array(64*64);
  while (stack.length) {
    const [x,y] = stack.pop()!;
    if (x<0||y<0||x>=64||y>=64||visited[y*64+x]) continue;
    const i=(y*64+x)*4;
    if (d[i]!==tr||d[i+1]!==tg||d[i+2]!==tb||d[i+3]!==ta) continue;
    visited[y*64+x]=1; d[i]=fr; d[i+1]=fg; d[i+2]=fb; d[i+3]=fa;
    stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
  skinCtx.putImageData(imageData,0,0);
}

function pickColor(sx: number, sy: number) {
  const px = skinCtx.getImageData(sx,sy,1,1).data;
  const hex = "#"+[px[0],px[1],px[2]].map(v=>v.toString(16).padStart(2,"0")).join("");
  currentColor = hex;
  (document.getElementById("color-picker") as HTMLInputElement).value = hex;
  (document.getElementById("color-hex") as HTMLInputElement).value = hex;
}

function init3DGrid() {
  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "rgba(74, 222, 128, 0.5)";
  for(let i=0; i<=64; i++) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke();
  }
  const gridTex = new THREE.CanvasTexture(canvas);
  gridTex.magFilter = THREE.NearestFilter;
  const gridMat = new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, opacity: 0.3, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });

  const meshes: THREE.Mesh[] = [];
  skinViewer.playerObject.traverse((obj) => { if (obj instanceof THREE.Mesh && obj.name !== "partGrid") meshes.push(obj); });
  for (const mesh of meshes) {
    const gridOverlay = new THREE.Mesh(mesh.geometry, gridMat);
    gridOverlay.name = "partGrid"; gridOverlay.visible = false;
    mesh.add(gridOverlay);
  }
}

function get3DUVPoint(e: MouseEvent | PointerEvent | TouchEvent) {
  let clientX = 0;
  let clientY = 0;
  if ('touches' in e) {
    if (e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }
  } else {
    clientX = (e as MouseEvent).clientX;
    clientY = (e as MouseEvent).clientY;
  }

  const rect = skinViewer.canvas.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, skinViewer.camera);
  const intersects = raycaster.intersectObject(skinViewer.playerObject, true)
    .filter(hit => hit.object.name !== "partGrid");
    
  let firstInnerHit = null;

  for (const hit of intersects) {
    if (hit.uv) {
      const tx = Math.floor(hit.uv.x * 64);
      const ty = Math.floor((1 - hit.uv.y) * 64);
      
      const pixelData = skinCtx.getImageData(tx, ty, 1, 1).data;
      if (pixelData[3] > 0) {
        return { x: tx, y: ty, hit };
      }

      if (!firstInnerHit && hit.object.name !== "outer") {
        firstInnerHit = { x: tx, y: ty, hit };
      }
    }
  }
  
  return firstInnerHit;
}

// ─── Initialize ───────────────────────────────────────────────────────────────
function initializeControls(): void {
	// Editor UI elements
	skinCanvas = document.createElement("canvas");
	skinCanvas.width = 64; skinCanvas.height = 64;
	skinCtx = skinCanvas.getContext("2d")!;

	editorCanvas = document.getElementById("editor-canvas") as HTMLCanvasElement;
	editorCtx = editorCanvas.getContext("2d")!;
	gridCanvas = document.getElementById("grid-canvas") as HTMLCanvasElement;
	gridCtx = gridCanvas.getContext("2d")!;
	cursorCanvas = document.getElementById("cursor-canvas") as HTMLCanvasElement;
	cursorCtx = cursorCanvas.getContext("2d")!;

	document.querySelectorAll<HTMLButtonElement>(".tool-btn").forEach(btn => btn.addEventListener("click", () => {
		document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
		btn.classList.add("active"); currentTool = btn.dataset.tool!;
	}));

	document.querySelectorAll<HTMLButtonElement>(".uv-tab").forEach(tab => tab.addEventListener("click", () => {
		document.querySelectorAll(".uv-tab").forEach(t => t.classList.remove("active"));
		tab.classList.add("active"); currentPart = tab.dataset.part!; setZoomEditor(zoomEditor);
	}));

	document.getElementById("btn-zoom-in")!.addEventListener("click", () => setZoomEditor(zoomEditor * 1.5));
	document.getElementById("btn-zoom-out")!.addEventListener("click", () => setZoomEditor(zoomEditor / 1.5));
	document.getElementById("btn-undo")!.addEventListener("click", undo);
	document.getElementById("btn-redo")!.addEventListener("click", redo);

	// Download Skin Event
	document.getElementById("btn-download-skin")!.addEventListener("click", () => {
		const dataUrl = skinCanvas.toDataURL("image/png");

		// 1. Download on Web (Browser)
		const link = document.createElement("a");
		link.download = "minecraft_skin.png";
		link.href = dataUrl;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		// 2. Bridge to Android Kotlin if available
		if ((window as any).AndroidApp && (window as any).AndroidApp.saveSkinToDevice) {
			(window as any).AndroidApp.saveSkinToDevice(dataUrl);
		}
	});

	// Expose a clean global function so Kotlin can call it directly
	(window as any).getSkinFromApp = function() {
		const dataUrl = skinCanvas.toDataURL("image/png");
		if ((window as any).AndroidApp && (window as any).AndroidApp.saveSkinToDevice) {
			(window as any).AndroidApp.saveSkinToDevice(dataUrl);
		} else {
			console.log("AndroidApp interface not found");
		}
	};



	(document.getElementById("brush-size") as HTMLInputElement).addEventListener("input", e => {
		brushSize = Number((e.target as HTMLInputElement).value);
		document.getElementById("brush-size-val")!.textContent = brushSize + "px";
	});

	(document.getElementById("color-picker") as HTMLInputElement).addEventListener("input", e => {
		currentColor = (e.target as HTMLInputElement).value;
		(document.getElementById("color-hex") as HTMLInputElement).value = currentColor;
	});

	(document.getElementById("toggle-grid") as HTMLInputElement).addEventListener("change", e => {
		showGrid2D = (e.target as HTMLInputElement).checked; renderEditor();
	});

	(document.getElementById("toggle-3d-grid") as HTMLInputElement).addEventListener("change", e => {
		skinViewer.playerObject.traverse(obj => { if(obj.name === "partGrid") obj.visible = (e.target as HTMLInputElement).checked; });
	});

	// Canvas pointer events (supports mouse and touch)
	editorCanvas.addEventListener("pointerdown", e => {
		editorCanvas.setPointerCapture(e.pointerId);
		const r = editorCanvas.getBoundingClientRect();
		const vr = getViewRect();
		const x = Math.floor((e.clientX - r.left) / zoomEditor) + vr.x;
		const y = Math.floor((e.clientY - r.top) / zoomEditor) + vr.y;
		isDrawing = true;
		if (currentTool === "eyedropper") { pickColor(x,y); isDrawing=false; }
		else if (currentTool === "fill") { saveUndo(); floodFill(x,y); renderEditor(); syncTo3D(); isDrawing=false; }
		else { saveUndo(); paintPixel(x,y); lastPixel={x,y}; renderEditor(); }
	});
	editorCanvas.addEventListener("pointermove", e => {
		if (!isDrawing || !lastPixel) return;
		const r = editorCanvas.getBoundingClientRect();
		const vr = getViewRect();
		const x = Math.floor((e.clientX - r.left) / zoomEditor) + vr.x;
		const y = Math.floor((e.clientY - r.top) / zoomEditor) + vr.y;
		if (lastPixel.x !== x || lastPixel.y !== y) { paintPixel(x,y); lastPixel={x,y}; renderEditor(); }
	});
	window.addEventListener("pointerup", () => { if(isDrawing) { isDrawing=false; syncTo3D(); } lastPixel=null; });

	// Original Controls
	const canvasWidth = document.getElementById("canvas_width") as HTMLInputElement;
	const canvasHeight = document.getElementById("canvas_height") as HTMLInputElement;
	const fov = document.getElementById("fov") as HTMLInputElement;
	const zoom = document.getElementById("zoom") as HTMLInputElement;
	const globalLight = document.getElementById("global_light") as HTMLInputElement;
	const cameraLight = document.getElementById("camera_light") as HTMLInputElement;
	const autoRotate = document.getElementById("auto_rotate") as HTMLInputElement;
	const autoRotateSpeed = document.getElementById("auto_rotate_speed") as HTMLInputElement;
	const controlRotate = document.getElementById("control_rotate") as HTMLInputElement;
	const controlZoom = document.getElementById("control_zoom") as HTMLInputElement;
	const controlPan = document.getElementById("control_pan") as HTMLInputElement;
	const animationRadios = document.querySelectorAll<HTMLInputElement>('input[type="radio"][name="animation"]');
	const animationSpeed = document.getElementById("animation_speed") as HTMLInputElement;

	canvasWidth?.addEventListener("change", () => skinViewer.width = Number(canvasWidth.value));
	canvasHeight?.addEventListener("change", () => skinViewer.height = Number(canvasHeight.value));
	fov?.addEventListener("change", () => skinViewer.fov = Number(fov.value));
	zoom?.addEventListener("change", () => skinViewer.zoom = Number(zoom.value));
	globalLight?.addEventListener("change", () => skinViewer.globalLight.intensity = Number(globalLight.value));
	cameraLight?.addEventListener("change", () => skinViewer.cameraLight.intensity = Number(cameraLight.value));
	autoRotate?.addEventListener("change", () => skinViewer.autoRotate = autoRotate.checked);
	autoRotateSpeed?.addEventListener("change", () => skinViewer.autoRotateSpeed = Number(autoRotateSpeed.value));
	
	animationRadios.forEach(el => el.addEventListener("change", () => {
		skinViewer.animation = availableAnimations[el.value] || null;
		if (skinViewer.animation) skinViewer.animation.speed = Number(animationSpeed.value);
	}));

	controlRotate?.addEventListener("change", () => skinViewer.controls.enableRotate = controlRotate.checked);
	controlZoom?.addEventListener("change", () => skinViewer.controls.enableZoom = controlZoom.checked);
	controlPan?.addEventListener("change", () => skinViewer.controls.enablePan = controlPan.checked);

    // Layer Checkboxes
	for (const part of skinParts) {
		for (const layer of skinLayers) {
			const checkbox = document.querySelector<HTMLInputElement>(`#layers_table input[type="checkbox"][data-part="${part}"][data-layer="${layer}"]`);
			checkbox?.addEventListener("change", () => {
				(skinViewer.playerObject.skin as any)[part][layer].visible = checkbox.checked;
			});
		}
	}

	// External Assets
	const initializeUploadButton = (id: string, callback: () => void) => {
		const urlInput = document.getElementById(id) as HTMLInputElement;
		const fileInput = document.getElementById(`${id}_upload`) as HTMLInputElement;
		const unsetButton = document.getElementById(`${id}_unset`);
		const unsetAction = () => { if (urlInput) { urlInput.readOnly = false; urlInput.value = ""; } if (fileInput) fileInput.value = ""; callback(); };
		fileInput?.addEventListener("change", () => callback());
		urlInput?.addEventListener("keydown", e => { if (e.key === "Backspace" && urlInput?.readOnly) unsetAction(); });
		unsetButton?.addEventListener("click", () => unsetAction());
	};

	initializeUploadButton("skin_url", reloadSkin);
	initializeUploadButton("cape_url", reloadCape);
	initializeUploadButton("ears_url", () => reloadEars());
	initializeUploadButton("panorama_url", reloadPanorama);

	document.getElementById("skin_url")?.addEventListener("change", reloadSkin);
	document.getElementById("skin_model")?.addEventListener("change", reloadSkin);
	document.getElementById("cape_url")?.addEventListener("change", reloadCape);
	document.getElementById("ears_source")?.addEventListener("change", () => reloadEars());
	document.getElementById("ears_url")?.addEventListener("change", () => reloadEars());
	document.getElementById("panorama_url")?.addEventListener("change", reloadPanorama);

    // Background Controls
	const backgroundType = document.getElementById("background_type") as HTMLSelectElement;
	const backgroundColor = document.getElementById("background_color") as HTMLInputElement;
	backgroundType?.addEventListener("change", updateBackground);
	backgroundColor?.addEventListener("change", () => { backgroundType.value = "color"; updateBackground(); });

	document.getElementById("reset_all")?.addEventListener("click", () => { skinViewer.dispose(); initializeViewer(); });

	// Palette init
	const palette = ["#1a1a2e","#16213e","#0f3460","#533483","#e94560","#f5a623","#ffffff","#000000"];
	const paletteGrid = document.getElementById("palette-grid")!;
	palette.forEach(c => {
		const sw = document.createElement("div"); sw.className = "palette-swatch"; sw.style.background = c;
		sw.addEventListener("click", () => { currentColor=c; (document.getElementById("color-picker") as HTMLInputElement).value=c; });
		paletteGrid.appendChild(sw);
	});

	setZoomEditor(8);
}

function initializeViewer(): void {
	const skinContainer = document.getElementById("skin_container") as HTMLCanvasElement;
	
	// Lấy kích thước thực tế của khung chứa (parent)
	const parentElement = skinContainer.parentElement || document.body;
	const initialWidth = parentElement.clientWidth || window.innerWidth;
	const initialHeight = parentElement.clientHeight || 500;

	skinViewer = new skinview3d.SkinViewer({ 
		canvas: skinContainer, 
		width: initialWidth, 
		height: initialHeight 
	});
	skinViewer.zoom = 0.9;

	// Tự động thay đổi kích thước canvas 3D theo tỉ lệ màn hình/thiết bị
	const resizeViewer = () => {
		const width = parentElement.clientWidth || window.innerWidth;
		const height = parentElement.clientHeight || 500;
		skinViewer.width = width;
		skinViewer.height = height;
	};
	window.addEventListener("resize", resizeViewer);


	// 3D Painting Events
	let is3DPainting = false;
	skinContainer.addEventListener("pointerdown", e => {
		const point = get3DUVPoint(e);
		if (point) {
			skinViewer.controls.enabled = false; is3DPainting = true;
			if (currentTool === "eyedropper") pickColor(point.x, point.y);
			else { saveUndo(); paintPixel(point.x, point.y); renderEditor(); syncTo3D(); }
		}
	});
	skinContainer.addEventListener("pointermove", e => {
		const point = get3DUVPoint(e);
		if (hoverHighlight) {
			if (point) {
				hoverHighlight.visible = true;
				hoverHighlight.position.copy(point.hit.point).add(point.hit.face!.normal.clone().multiplyScalar(0.01));
				hoverHighlight.lookAt(point.hit.point.clone().add(point.hit.face!.normal));
			} else hoverHighlight.visible = false;
		}
		if (is3DPainting && point) { paintPixel(point.x, point.y); renderEditor(); syncTo3D(); }
	});
	window.addEventListener("pointerup", () => { is3DPainting = false; skinViewer.controls.enabled = true; });

	// Highlight mesh
	const highlightGeo = new THREE.PlaneGeometry(1, 1);
	const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthTest: false });
	hoverHighlight = new THREE.Mesh(highlightGeo, highlightMat);
	hoverHighlight.visible = false;
	skinViewer.scene.add(hoverHighlight);

	init3DGrid();
    
    // Initial Load
	reloadSkin();
    reloadCape();
    reloadEars(true);
    updateBackground();
}

initializeViewer();
initializeControls();

// ─── Android WebView Bridge API ────────────────────────────────────────────────
// skin: url image
(window as any).updateSkinFromApp = function(urlOrBase64: string) {
	const skinModel = document.getElementById("skin_model") as HTMLSelectElement;
	skinViewer.loadSkin(urlOrBase64, {
		model: skinModel?.value as any,
	}).then(() => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			skinCtx.clearRect(0,0,64,64);
			skinCtx.drawImage(img,0,0,64,64);
			undoStack = [];
			saveUndo();
			renderEditor();
		};
		img.src = urlOrBase64;
	});
};

// background: url image
(window as any).updateBackgroundFromApp = function(colorOrUrl: string) {
	if (colorOrUrl.startsWith("#") || colorOrUrl.startsWith("rgb")) {
		skinViewer.background = colorOrUrl;
	} else {
		skinViewer.loadPanorama(colorOrUrl);
	}
};

// animation: "idle", "walk", "run", "fly", "wave", "crouch", "hit", "swim", "none"
(window as any).updateAnimationFromApp = function(animationName: string) {
	// Kiểm tra nếu tên animation không có trong danh sách hoặc truyền "none" thì tắt animation
	if (animationName === "none" || !availableAnimations[animationName]) {
		skinViewer.animation = null;
	} else {
		skinViewer.animation = availableAnimations[animationName];
		// Thiết lập tốc độ mặc định là 1.0 (bạn có thể tuỳ chỉnh nếu muốn truyền thêm speed)
		skinViewer.animation.speed = 1.0; 
	}
};
