import { useState, useMemo, useEffect, useRef } from "react";
import { Reorder, useDragControls, motion, AnimatePresence } from "framer-motion";

/* ─────────────────────────────────────────────
   BRAND: ZeniStack  (Zenikhon + "stack of tools")
   Tagline: "Your digital utility stack."
───────────────────────────────────────────── */

// ── Lazy-load PDF libraries on first use ─────────────────────────────────────
// This keeps them out of the initial JS bundle entirely.
// The browser downloads them only when the user first triggers a tool action.
let _jsPDF = null;
let _PDFDocument = null;

async function getJsPDF() {
  if (!_jsPDF) {
    const mod = await import("jspdf");
    _jsPDF = mod.jsPDF;
  }
  return _jsPDF;
}

async function getPDFLib() {
  if (!_PDFDocument) {
    const mod = await import("pdf-lib");
    _PDFDocument = mod.PDFDocument;
  }
  return _PDFDocument;
}

// ── EXIF orientation fix ──────────────────────────────────────────────────────
function getExifOrientation(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const view = new DataView(e.target.result);
      if (view.getUint16(0, false) !== 0xffd8) return resolve(1);
      let offset = 2;
      while (offset < view.byteLength) {
        const marker = view.getUint16(offset, false);
        offset += 2;
        if (marker === 0xffe1) {
          if (view.getUint32((offset += 2), false) !== 0x45786966) return resolve(1);
          const little = view.getUint16((offset += 6), false) === 0x4949;
          offset += view.getUint32(offset + 4, little);
          const tags = view.getUint16(offset, little);
          for (let i = 0; i < tags; i++) {
            if (view.getUint16(offset + 2 + i * 12, little) === 0x0112)
              return resolve(view.getUint16(offset + 2 + i * 12 + 8, little));
          }
        } else if ((marker & 0xff00) !== 0xff00) break;
        else offset += view.getUint16(offset, false);
      }
      resolve(1);
    };
    reader.readAsArrayBuffer(file.slice(0, 64 * 1024));
  });
}

async function correctImageOrientation(file) {
  const orientation = await getExifOrientation(file);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const swap = orientation >= 5;
      const canvas = document.createElement("canvas");
      canvas.width  = swap ? img.height : img.width;
      canvas.height = swap ? img.width  : img.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const W = img.width, H = img.height;
      const transforms = {
        1: [ 1,  0,  0,  1,  0,  0],
        2: [-1,  0,  0,  1,  W,  0],
        3: [-1,  0,  0, -1,  W,  H],
        4: [ 1,  0,  0, -1,  0,  H],
        5: [ 0,  1,  1,  0,  0,  0],
        6: [ 0,  1, -1,  0,  H,  0],
        7: [ 0, -1, -1,  0,  H,  W],
        8: [ 0, -1,  1,  0,  0,  W],
      };
      const t = transforms[orientation] ?? transforms[1];
      ctx.setTransform(...t);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.src = url;
  });
}

// ── PDF.js loader (loaded once from CDN on first compress call) ───────────────
let _pdfjs = null;
async function getPdfJs() {
  if (_pdfjs) return _pdfjs;
  await new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  _pdfjs = window.pdfjsLib;
  return _pdfjs;
}

// ── Real PDF compression via PDF.js page rendering ───────────────────────────
async function compressPdfViaCanvas(file, quality, scale, onProgress) {
  const pdfjsLib    = await getPdfJs();
  const PDFDocument = await getPDFLib();          // lazy-loaded here too
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc      = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount   = pdfDoc.numPages;
  const outDoc      = await PDFDocument.create();

  for (let i = 1; i <= pageCount; i++) {
    onProgress(i, pageCount);
    const page     = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas  = document.createElement("canvas");
    canvas.width  = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const jpegDataUrl = canvas.toDataURL("image/jpeg", quality);
    const jpegBase64  = jpegDataUrl.split(",")[1];
    const jpegBytes   = Uint8Array.from(atob(jpegBase64), (c) => c.charCodeAt(0));

    const jpegImage = await outDoc.embedJpg(jpegBytes);
    const pdfPage   = outDoc.addPage([viewport.width, viewport.height]);
    pdfPage.drawImage(jpegImage, { x: 0, y: 0, width: viewport.width, height: viewport.height });
  }

  outDoc.setProducer("ZeniStack");
  outDoc.setCreator("ZeniStack");
  return await outDoc.save({ useObjectStreams: true });
}

// ── DropZone with format validation ──────────────────────────────────────────
function DropZone({ onFiles, acceptMime, acceptLabel, children, hint }) {
  const [over, setOver]     = useState(false);
  const [fmtErr, setFmtErr] = useState(false);

  const check = (files) => {
    const valid = files.filter((f) => {
      if (acceptMime === "image/*") return f.type.startsWith("image/");
      return f.type === acceptMime;
    });
    if (valid.length === 0 && files.length > 0) {
      setFmtErr(true);
      setTimeout(() => setFmtErr(false), 3000);
      return;
    }
    setFmtErr(false);
    onFiles(valid);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setOver(false);
    check(Array.from(e.dataTransfer.files || []));
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      className={`w-full rounded-2xl border-2 border-dashed p-8 md:p-10 text-center transition-all duration-300 ${
        fmtErr
          ? "border-red-500 bg-red-500/5"
          : over
            ? "border-orange-400 bg-orange-500/5 scale-[1.01]"
            : "border-gray-700 hover:border-orange-500/60"
      }`}
    >
      <div className="flex flex-col items-center gap-3">
        <div className={`text-4xl transition-transform duration-300 ${over ? "scale-125" : ""}`}>
          {fmtErr ? "⚠️" : hint}
        </div>
        {fmtErr ? (
          <p className="text-red-400 text-sm font-semibold">
            Wrong format — please drop {acceptLabel} only
          </p>
        ) : (
          <p className="text-gray-300 text-sm">Drag & drop here, or</p>
        )}
        {children}
      </div>
    </div>
  );
}

// ── File picker button ────────────────────────────────────────────────────────
function FilePicker({ label, accept, multiple = false, onFiles }) {
  const inputRef = useRef(null);
  return (
    <>
      <OrangeBtn onClick={() => inputRef.current?.click()} className="text-sm">
        {label}
      </OrangeBtn>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files || []));
          e.target.value = null;
        }}
      />
    </>
  );
}

function OrangeBtn({ onClick, disabled, children, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative overflow-hidden group bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed px-8 py-3 rounded-xl font-bold tracking-wide transition-all duration-200 hover:shadow-[0_0_24px_rgba(249,115,22,0.45)] active:scale-95 ${className}`}
    >
      <span className="relative z-10">{children}</span>
      <span className="absolute inset-0 bg-gradient-to-r from-orange-400/0 via-white/10 to-orange-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
    </button>
  );
}

function GhostBtn({ onClick, children, className = "" }) {
  return (
    <button onClick={onClick} className={`text-sm text-gray-500 hover:text-red-400 transition-colors duration-200 ${className}`}>
      {children}
    </button>
  );
}

function ReorderHint({ show }) {
  return show ? <p className="text-gray-600 text-xs mt-2 text-center select-none">☰ Drag to reorder</p> : null;
}

function SectionLabel({ children }) {
  return <p className="text-xs font-semibold uppercase tracking-widest text-orange-500/70 mb-3">{children}</p>;
}

// ── Draggable image thumbnail ─────────────────────────────────────────────────
function DraggableImage({ img, src, onRemove }) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={img} dragListener={false} dragControls={controls} className="min-w-[96px] touch-none">
      <div className="relative group cursor-grab active:cursor-grabbing" onPointerDown={(e) => controls.start(e)}>
        <img src={src} className="rounded-xl object-cover h-24 w-24 pointer-events-none ring-1 ring-white/10" draggable={false} />
        <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/30 transition-all duration-200" />
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          className="absolute top-1 right-1 bg-black/80 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition hover:bg-red-500"
        >✕</button>
      </div>
    </Reorder.Item>
  );
}

// ── Draggable PDF row ─────────────────────────────────────────────────────────
function DraggablePdf({ pdf, index, onRemove }) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={pdf} dragListener={false} dragControls={controls} className="w-full touch-none">
      <div
        className="flex items-center gap-3 w-full bg-gray-900 border border-gray-800 px-4 py-3 rounded-xl cursor-grab active:cursor-grabbing hover:border-orange-500/30 transition-all duration-200"
        onPointerDown={(e) => controls.start(e)}
      >
        <span className="text-orange-500/50 text-xs font-mono w-5 shrink-0 select-none">{index + 1}</span>
        <svg className="w-4 h-4 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z"/>
        </svg>
        <span className="truncate text-sm text-gray-300 flex-1">{pdf.file.name}</span>
        <span className="text-xs text-gray-600 shrink-0">{(pdf.file.size / 1024).toFixed(0)} KB</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          className="ml-1 shrink-0 text-gray-600 hover:text-red-400 transition-colors w-5 h-5 flex items-center justify-center"
        >✕</button>
      </div>
    </Reorder.Item>
  );
}

// ── ZeniStack SVG Logo ────────────────────────────────────────────────────────
function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#111111"/>
      <rect x="6" y="8"  width="20" height="4" rx="2" fill="#f97316"/>
      <rect x="6" y="14" width="14" height="4" rx="2" fill="#f97316" opacity="0.7"/>
      <rect x="6" y="20" width="9"  height="4" rx="2" fill="#f97316" opacity="0.4"/>
    </svg>
  );
}

const TABS = [
  { id: "imageToPdf",  label: "Images → PDF", icon: "🖼️" },
  { id: "pdfMerge",    label: "Merge PDFs",   icon: "🔗" },
  { id: "pdfSplit",    label: "Split PDF",    icon: "✂️" },
  { id: "pdfCompress", label: "Compress PDF", icon: "🗜️" },
];

const COMING_SOON = [
  "PDF → Word", "PDF → Excel", "PDF Watermark",
  "PDF Rotate", "Image Resize", "Background Remover",
];

// ═══════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════
export default function App() {
  const [activeTab, setActiveTab] = useState("imageToPdf");
  const [loading, setLoading]     = useState(false);
  const [toast, setToast]         = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── File size / count limits ───────────────────────────────────────────────
  const MAX_IMAGE_SIZE_MB    = 20;
  const MAX_IMAGE_COUNT      = 20;
  const MAX_PDF_SIZE_MB      = 50;
  const MAX_PDF_COUNT        = 10;
  const MAX_SPLIT_SIZE_MB    = 100;
  const MAX_COMPRESS_SIZE_MB = 100;

  // ── Image → PDF ────────────────────────────────────────────────────────────
  const [images, setImages] = useState([]);

  const addImages = (files) => {
    const tooBig = files.filter(f => f.size > MAX_IMAGE_SIZE_MB * 1024 * 1024);
    const valid  = files.filter(f => f.type.startsWith("image/") && f.size <= MAX_IMAGE_SIZE_MB * 1024 * 1024);
    if (tooBig.length)
      showToast(`${tooBig.length} file(s) exceed ${MAX_IMAGE_SIZE_MB}MB and were skipped.`, "error");
    setImages(prev => {
      const combined = [...prev, ...valid.map(f => ({ id: crypto.randomUUID(), file: f }))];
      if (combined.length > MAX_IMAGE_COUNT) {
        showToast(`Maximum ${MAX_IMAGE_COUNT} images allowed.`, "error");
        return combined.slice(0, MAX_IMAGE_COUNT);
      }
      return combined;
    });
  };

  const removeImage = (i) => setImages((p) => p.filter((_, idx) => idx !== i));

  const objectUrls = useMemo(() => {
    const m = {};
    images.forEach((img) => (m[img.id] = URL.createObjectURL(img.file)));
    return m;
  }, [images]);

  useEffect(() => () => Object.values(objectUrls).forEach(URL.revokeObjectURL), [objectUrls]);

  const convertToPDF = async () => {
    if (!images.length) return;
    setLoading(true);
    window.gtag?.('event', 'tool_used', { tool_name: 'image_to_pdf' });
    try {
      const jsPDF = await getJsPDF();                   // ← lazy load
      const pdf = new jsPDF();
      for (let i = 0; i < images.length; i++) {
        const imgData = await correctImageOrientation(images[i].file);
        const img = new Image();
        img.src = imgData;
        await new Promise((res) => {
          img.onload = () => {
            const w = pdf.internal.pageSize.getWidth();
            const h = (img.height * w) / img.width;
            if (i !== 0) pdf.addPage();
            pdf.addImage(img, "JPEG", 0, 0, w, h);
            res();
          };
        });
      }
      pdf.save(`zenistack-img-to-pdf-${Date.now()}.pdf`);
      showToast("PDF saved successfully!");
    } catch { showToast("Conversion failed.", "error"); }
    setLoading(false);
  };

  // ── PDF Merge ──────────────────────────────────────────────────────────────
  const [pdfFiles, setPdfFiles] = useState([]);

  const addPdfs = (files) => {
    const tooBig = files.filter(f => f.size > MAX_PDF_SIZE_MB * 1024 * 1024);
    const valid  = files.filter(f => f.type === "application/pdf" && f.size <= MAX_PDF_SIZE_MB * 1024 * 1024);
    if (tooBig.length)
      showToast(`${tooBig.length} file(s) exceed ${MAX_PDF_SIZE_MB}MB and were skipped.`, "error");
    setPdfFiles(prev => {
      const combined = [...prev, ...valid.map(f => ({ id: crypto.randomUUID(), file: f }))];
      if (combined.length > MAX_PDF_COUNT) {
        showToast(`Maximum ${MAX_PDF_COUNT} PDFs allowed.`, "error");
        return combined.slice(0, MAX_PDF_COUNT);
      }
      return combined;
    });
  };

  const removePdf = (i) => setPdfFiles((p) => p.filter((_, idx) => idx !== i));

  const mergePdfs = async () => {
    if (!pdfFiles.length) return;
    setLoading(true);
    window.gtag?.('event', 'tool_used', { tool_name: 'merge_pdf' });
    try {
      const PDFDocument = await getPDFLib();            // ← lazy load
      const merged = await PDFDocument.create();
      for (const pf of pdfFiles) {
        const buf = await pf.file.arrayBuffer();
        const doc = await PDFDocument.load(buf);
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      }
      const bytes = await merged.save();
      dlBytes(bytes, `zenistack-pdf-merged-${Date.now()}.pdf`, "application/pdf");
      showToast("Merged PDF saved!");
    } catch { showToast("Merge failed.", "error"); }
    setLoading(false);
  };

  // ── PDF Split ──────────────────────────────────────────────────────────────
  const [splitFile, setSplitFile]           = useState(null);
  const [splitPageCount, setSplitPageCount] = useState(0);
  const [splitRanges, setSplitRanges]       = useState("");
  const [splitMode, setSplitMode]           = useState("ranges");
  const [splitEvery, setSplitEvery]         = useState(1);

  const loadSplitFile = async (files) => {
    const f = files.find(f => f.type === "application/pdf");
    if (!f) return;
    if (f.size > MAX_SPLIT_SIZE_MB * 1024 * 1024) {
      showToast(`File exceeds ${MAX_SPLIT_SIZE_MB}MB limit.`, "error");
      return;
    }
    const PDFDocument = await getPDFLib();              // ← lazy load
    setSplitFile({ id: crypto.randomUUID(), file: f });
    const buf = await f.arrayBuffer();
    const doc = await PDFDocument.load(buf);
    setSplitPageCount(doc.getPageCount());
    setSplitRanges("");
  };

  const parseRanges = (str, total) =>
    str.split(",").map((s) => s.trim()).filter(Boolean).map((part) => {
      const [a, b] = part.split("-").map((n) => parseInt(n.trim(), 10));
      const from = Math.max(1, a) - 1;
      const to   = b ? Math.min(total, b) - 1 : from;
      return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    }).filter((g) => g.length > 0);

  const splitPdf = async () => {
    if (!splitFile) return;
    setLoading(true);
    window.gtag?.('event', 'tool_used', { tool_name: 'split_pdf' });
    try {
      const PDFDocument = await getPDFLib();            // ← lazy load
      const buf   = await splitFile.file.arrayBuffer();
      const src   = await PDFDocument.load(buf);
      const total = src.getPageCount();
      let groups  = [];

      if (splitMode === "all") {
        groups = Array.from({ length: total }, (_, i) => [i]);
      } else if (splitMode === "every") {
        const n = Math.max(1, splitEvery);
        for (let i = 0; i < total; i += n)
          groups.push(Array.from({ length: Math.min(n, total - i) }, (_, j) => i + j));
      } else {
        groups = parseRanges(splitRanges, total);
        if (!groups.length) { showToast("No valid ranges entered.", "error"); setLoading(false); return; }
      }

      for (let g = 0; g < groups.length; g++) {
        const out   = await PDFDocument.create();
        const pages = await out.copyPages(src, groups[g]);
        pages.forEach((p) => out.addPage(p));
        const label = splitMode === "ranges"
          ? `part-${g + 1}`
          : `pages-${groups[g][0] + 1}-${groups[g][groups[g].length - 1] + 1}`;
        dlBytes(await out.save(), `zenistack-pdf-split-${label}.pdf`, "application/pdf");
        await new Promise((r) => setTimeout(r, 150));
      }
      showToast(`${groups.length} PDF${groups.length > 1 ? "s" : ""} saved!`);
    } catch { showToast("Split failed. Is the PDF valid?", "error"); }
    setLoading(false);
  };

  // ── PDF Compress ───────────────────────────────────────────────────────────
  const [compressFile, setCompressFile]         = useState(null);
  const [compressQuality, setCompressQuality]   = useState(60);
  const [compressResult, setCompressResult]     = useState(null);
  const [compressProgress, setCompressProgress] = useState(null);

  const loadCompressFile = (files) => {
    const f = files.find(f => f.type === "application/pdf");
    if (!f) return;
    if (f.size > MAX_COMPRESS_SIZE_MB * 1024 * 1024) {
      showToast(`File exceeds ${MAX_COMPRESS_SIZE_MB}MB limit.`, "error");
      return;
    }
    setCompressFile({ id: crypto.randomUUID(), file: f });
    setCompressResult(null);
  };

  const compressPdf = async () => {
    if (!compressFile) return;
    setLoading(true);
    window.gtag?.('event', 'tool_used', { tool_name: 'compress_pdf' });
    setCompressProgress(null);
    setCompressResult(null);
    try {
      const origSize = compressFile.file.size;
      const q        = compressQuality / 100;
      const scale    = 0.5 + q * 1.0;

      // compressPdfViaCanvas calls getPDFLib() internally — no extra call needed here
      const outBytes = await compressPdfViaCanvas(
        compressFile.file,
        q,
        scale,
        (done, total) => setCompressProgress({ done, total })
      );

      const newSize = outBytes.byteLength;
      setCompressResult({ bytes: outBytes, origSize, newSize });
      const pct = (((origSize - newSize) / origSize) * 100).toFixed(1);
      showToast(newSize < origSize ? `Reduced by ${pct}%` : "File already well-optimised");
    } catch (err) {
      console.error(err);
      showToast("Compression failed — PDF may be encrypted or corrupted.", "error");
    }
    setCompressProgress(null);
    setLoading(false);
  };

  const downloadCompressed = () => {
    if (!compressResult) return;
    dlBytes(compressResult.bytes, `zenistack-pdf-compressed-${Date.now()}.pdf`, "application/pdf");
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function dlBytes(bytes, name, mime) {
    const blob = new Blob([bytes], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  function fmtBytes(b) {
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / (1024 * 1024)).toFixed(2) + " MB";
  }

  // ═══════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans">

      {/* Grid texture */}
      <div className="pointer-events-none fixed inset-0 z-0" style={{
        backgroundImage: "linear-gradient(rgba(249,115,22,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(249,115,22,0.03) 1px,transparent 1px)",
        backgroundSize: "40px 40px",
      }}/>
      {/* Glow */}
      <div className="pointer-events-none fixed top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full z-0"
        style={{ background: "radial-gradient(circle,rgba(249,115,22,0.08) 0%,transparent 70%)" }}/>

      {/* ── NAV ── */}
      <nav className="relative z-10 w-full flex items-center justify-between px-6 py-4 border-b border-white/5 backdrop-blur-sm bg-black/20">
        <div className="flex items-center gap-3">
          <Logo size={33}/>
          <span className="text-lg font-extrabold tracking-tight text-white">
            Zeni<span className="text-orange-500">Stack</span>
          </span>
          <span className="hidden md:inline-block text-[12px] font-semibold uppercase tracking-widest text-orange-500/60 border border-orange-500/20 rounded-full px-2 py-0.5 ml-1">Beta</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-500">
          <a href="#tools" className="hover:text-orange-400 transition-colors hidden md:block">Tools</a>
          <a href="#about" className="hover:text-orange-400 transition-colors hidden md:block">About</a>
          <span className="text-xs border border-orange-500/30 text-orange-400 px-3 py-1.5 rounded-lg">Free Forever</span>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative z-10 w-full flex flex-col items-center text-center px-6 pt-14 pb-10">
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-orange-500/70 border border-orange-500/20 bg-orange-500/5 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"/>
          100% free · runs in your browser · no uploads to servers
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05] mb-4">
          Your digital<br/><span className="text-orange-500">utility stack.</span>
        </h1>
        <p className="text-gray-400 max-w-lg text-base md:text-lg">
          Fast, private PDF & file tools — no sign-up, no cloud, no nonsense. Built by Zenikhon Tech.
        </p>
      </section>

      {/* ── SEO keyword strip ── */}
      <div className="relative z-10 w-full flex flex-wrap justify-center gap-x-6 gap-y-2 px-6 pb-8 text-xs text-gray-600">
        <span>🔒 100% Private — Files Never Leave Your Device</span>
        <span>·</span>
        <span>Free PDF tools online</span>
        <span>·</span>
        <span>Merge PDF without uploading</span>
        <span>·</span>
        <span>Split PDF in browser</span>
        <span>·</span>
        <span>Compress PDF free</span>
      </div>

      {/* ── TABS ── */}
      <div id="tools" className="relative z-10 w-full flex justify-center px-4 mb-1">
        <div className="flex gap-2 flex-wrap justify-center bg-gray-950 border border-white/5 rounded-2xl p-1.5 max-w-xl w-full">
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[130px] flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-orange-500 text-white shadow-[0_0_16px_rgba(249,115,22,0.3)]"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }`}>
              <span>{tab.icon}</span><span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── TOOL PANEL ── */}
      <main className="relative z-10 flex flex-col items-center flex-grow px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
            className="w-full max-w-xl">

            {/* ══ IMAGE → PDF ══ */}
            {activeTab === "imageToPdf" && (
              <Panel title="Images → PDF" desc="Convert JPG, PNG, WebP and more into a single PDF. Reorder before converting.">
                <DropZone onFiles={addImages} acceptMime="image/*" acceptLabel="image files" hint="🖼️">
                  <FilePicker label="Choose Images" accept="image/*" multiple onFiles={addImages}/>
                  {images.length > 0 && (
                    <span className="text-xs text-orange-400 font-semibold">
                      {images.length} image{images.length > 1 ? "s" : ""} ready
                    </span>
                  )}
                  <span className="text-[11px] text-gray-700">
                    Max {MAX_IMAGE_COUNT} images · {MAX_IMAGE_SIZE_MB}MB each
                  </span>
                </DropZone>

                {images.length > 0 && (
                  <div className="mt-5">
                    <SectionLabel>Preview & reorder</SectionLabel>
                    <Reorder.Group axis="x" values={images} onReorder={setImages} className="flex gap-3 overflow-x-auto pb-2">
                      {images.map((img, i) => (
                        <DraggableImage key={img.id} img={img} src={objectUrls[img.id]} onRemove={() => removeImage(i)}/>
                      ))}
                    </Reorder.Group>
                    <ReorderHint show={images.length > 1}/>
                  </div>
                )}

                <div className="flex flex-col items-center gap-2 mt-6">
                  <OrangeBtn onClick={convertToPDF} disabled={loading || !images.length} className="w-full">
                    {loading ? <Spinner/> : "Convert to PDF"}
                  </OrangeBtn>
                  {images.length > 0 && <GhostBtn onClick={() => setImages([])}>Clear all images</GhostBtn>}
                </div>
              </Panel>
            )}

            {/* ══ PDF MERGE ══ */}
            {activeTab === "pdfMerge" && (
              <Panel title="Merge PDFs" desc="Combine multiple PDFs into one. Drag rows to set the final order.">
                <DropZone onFiles={addPdfs} acceptMime="application/pdf" acceptLabel="PDF files" hint="🔗">
                  <FilePicker label="Choose PDF Files" accept="application/pdf" multiple onFiles={addPdfs}/>
                  {pdfFiles.length > 0 && (
                    <span className="text-xs text-orange-400 font-semibold">
                      {pdfFiles.length} PDF{pdfFiles.length > 1 ? "s" : ""} queued
                    </span>
                  )}
                  <span className="text-[11px] text-gray-700">
                    Max {MAX_PDF_COUNT} files · {MAX_PDF_SIZE_MB}MB each
                  </span>
                </DropZone>

                {pdfFiles.length > 0 && (
                  <div className="mt-5">
                    <SectionLabel>Merge order</SectionLabel>
                    <Reorder.Group axis="y" values={pdfFiles} onReorder={setPdfFiles} className="flex flex-col gap-2">
                      {pdfFiles.map((pdf, i) => (
                        <DraggablePdf key={pdf.id} pdf={pdf} index={i} onRemove={() => removePdf(i)}/>
                      ))}
                    </Reorder.Group>
                    <ReorderHint show={pdfFiles.length > 1}/>
                  </div>
                )}

                <div className="flex flex-col items-center gap-2 mt-6">
                  <OrangeBtn onClick={mergePdfs} disabled={loading || pdfFiles.length < 2} className="w-full">
                    {loading ? <Spinner/> : "Merge PDFs"}
                  </OrangeBtn>
                  {pdfFiles.length > 0 && <GhostBtn onClick={() => setPdfFiles([])}>Clear all</GhostBtn>}
                </div>
              </Panel>
            )}

            {/* ══ PDF SPLIT ══ */}
            {activeTab === "pdfSplit" && (
              <Panel title="Split PDF" desc="Extract specific pages or ranges from any PDF into separate files.">
                <DropZone onFiles={loadSplitFile} acceptMime="application/pdf" acceptLabel="a PDF file" hint="✂️">
                  <FilePicker label="Choose PDF" accept="application/pdf" onFiles={loadSplitFile}/>
                  {splitFile && (
                    <span className="text-xs text-orange-400 font-semibold">
                      {splitFile.file.name} · {splitPageCount} pages
                    </span>
                  )}
                  <span className="text-[11px] text-gray-700">Max {MAX_SPLIT_SIZE_MB}MB</span>
                </DropZone>

                {splitFile && (
                  <div className="mt-5 space-y-4">
                    <SectionLabel>Split mode</SectionLabel>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { val: "ranges", label: "By ranges" },
                        { val: "every",  label: "Every N pages" },
                        { val: "all",    label: "All pages" },
                      ].map((m) => (
                        <button key={m.val} onClick={() => setSplitMode(m.val)}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                            splitMode === m.val
                              ? "border-orange-500 bg-orange-500/10 text-orange-400"
                              : "border-gray-800 text-gray-500 hover:border-gray-700"
                          }`}>{m.label}</button>
                      ))}
                    </div>

                    {splitMode === "ranges" && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">
                          Page ranges <span className="text-gray-700">(e.g. 1-3, 5, 7-10)</span>
                        </label>
                        <input type="text" value={splitRanges} onChange={(e) => setSplitRanges(e.target.value)}
                          placeholder={`1-3, 5, 7-${splitPageCount}`}
                          className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-orange-500/60 transition-colors"/>
                        <p className="text-xs text-gray-700 mt-1.5">Each comma-separated group becomes its own PDF. Total: {splitPageCount} pages.</p>
                      </div>
                    )}

                    {splitMode === "every" && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Split every N pages</label>
                        <div className="flex items-center gap-3">
                          <input type="number" min={1} max={splitPageCount} value={splitEvery}
                            onChange={(e) => setSplitEvery(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-24 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500/60 transition-colors"/>
                          <span className="text-xs text-gray-600">
                            → {Math.ceil(splitPageCount / Math.max(1, splitEvery))} output files
                          </span>
                        </div>
                      </div>
                    )}

                    {splitMode === "all" && (
                      <p className="text-xs text-gray-500 bg-gray-900 rounded-xl px-4 py-3 border border-gray-800">
                        Each of the {splitPageCount} pages will be saved as its own PDF. Downloads stagger automatically.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-col items-center gap-2 mt-6">
                  <OrangeBtn onClick={splitPdf} disabled={loading || !splitFile} className="w-full">
                    {loading ? <Spinner/> : "Split PDF"}
                  </OrangeBtn>
                  {splitFile && (
                    <GhostBtn onClick={() => { setSplitFile(null); setSplitPageCount(0); setSplitRanges(""); }}>
                      Remove file
                    </GhostBtn>
                  )}
                </div>
              </Panel>
            )}

            {/* ══ PDF COMPRESS ══ */}
            {activeTab === "pdfCompress" && (
              <Panel title="Compress PDF" desc="Re-renders every page as an optimised JPEG image. Best for scanned docs and image-heavy PDFs.">
                <DropZone onFiles={loadCompressFile} acceptMime="application/pdf" acceptLabel="a PDF file" hint="🗜️">
                  <FilePicker label="Choose PDF" accept="application/pdf" onFiles={loadCompressFile}/>
                  {compressFile && (
                    <span className="text-xs text-orange-400 font-semibold">
                      {compressFile.file.name} · {fmtBytes(compressFile.file.size)}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-700">Max {MAX_COMPRESS_SIZE_MB}MB</span>
                </DropZone>

                {compressFile && (
                  <div className="mt-5 space-y-4">
                    <SectionLabel>Compression level</SectionLabel>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Smaller file</span>
                        <span className="text-orange-400 font-bold">{compressQuality}%</span>
                        <span>Better quality</span>
                      </div>
                      <input type="range" min={10} max={95} step={5} value={compressQuality}
                        onChange={(e) => { setCompressQuality(+e.target.value); setCompressResult(null); }}
                        className="w-full accent-orange-500"/>
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        {[
                          { label: "Small",    q: 25, hint: "~70–85% smaller" },
                          { label: "Balanced", q: 55, hint: "~40–60% smaller" },
                          { label: "High",     q: 80, hint: "~15–30% smaller" },
                        ].map((p) => (
                          <button key={p.q} onClick={() => { setCompressQuality(p.q); setCompressResult(null); }}
                            className={`py-2 rounded-xl text-xs border transition-all ${
                              compressQuality === p.q
                                ? "border-orange-500 bg-orange-500/10 text-orange-400"
                                : "border-gray-800 text-gray-600 hover:border-gray-700"
                            }`}>
                            <div className="font-bold">{p.label}</div>
                            <div className="text-[10px] text-gray-600">{p.hint}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {compressProgress && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Rendering pages…</span>
                          <span>{compressProgress.done} / {compressProgress.total}</span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-orange-500 h-full rounded-full transition-all duration-200"
                            style={{ width: `${(compressProgress.done / compressProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Result card */}
                    {compressResult && (
                      <div className="bg-gray-900 border border-green-500/20 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
                        <div className="text-sm space-y-0.5">
                          <div className="text-gray-400">
                            <span className="line-through text-gray-600">{fmtBytes(compressResult.origSize)}</span>
                            {" → "}
                            <span className="text-green-400 font-bold">{fmtBytes(compressResult.newSize)}</span>
                          </div>
                          <div className="text-xs text-green-500/70">
                            {compressResult.newSize < compressResult.origSize
                              ? `${(((compressResult.origSize - compressResult.newSize) / compressResult.origSize) * 100).toFixed(1)}% smaller`
                              : "File already optimised"}
                          </div>
                        </div>
                        <button onClick={downloadCompressed}
                          className="shrink-0 text-xs font-bold text-orange-400 border border-orange-500/30 px-4 py-2 rounded-xl hover:bg-orange-500/10 transition-all">
                          ↓ Download
                        </button>
                      </div>
                    )}

                    <p className="text-xs text-gray-700">
                      ℹ️ This tool re-renders every page as a JPEG image. Text remains readable but is no longer selectable. Ideal for scanned documents, photo PDFs, and large reports.
                    </p>
                  </div>
                )}

                <div className="flex flex-col items-center gap-2 mt-6">
                  <OrangeBtn onClick={compressPdf} disabled={loading || !compressFile} className="w-full">
                    {loading ? <Spinner/> : "Compress PDF"}
                  </OrangeBtn>
                  {compressFile && (
                    <GhostBtn onClick={() => { setCompressFile(null); setCompressResult(null); setCompressProgress(null); }}>
                      Remove file
                    </GhostBtn>
                  )}
                </div>
              </Panel>
            )}

          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── COMING SOON ── */}
      <section className="relative z-10 w-full border-t border-white/5 py-8 overflow-hidden">
        <div className="text-center mb-4">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-orange-500/50">✦ More tools coming soon ✦</span>
        </div>
        <div className="relative overflow-hidden">
          <div className="flex animate-[scroll_18s_linear_infinite] gap-4 w-max">
            {[...COMING_SOON, ...COMING_SOON].map((tool, i) => (
              <span key={i} className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 border border-gray-800 bg-gray-950 rounded-full px-4 py-1.5 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500/30"/>
                {tool}
              </span>
            ))}
          </div>
          <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#0a0a0a] to-transparent pointer-events-none"/>
          <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#0a0a0a] to-transparent pointer-events-none"/>
        </div>
      </section>

      {/* ── ABOUT ── */}
      <section id="about" className="relative z-10 w-full border-t border-white/5 py-16 px-6 flex flex-col items-center text-center">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-orange-500/70 border border-orange-500/20 bg-orange-500/5 rounded-full px-4 py-1.5 mb-6">
            ✦ About ZeniStack
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white mb-4">
            Built for people, not profit.
          </h2>
          <p className="text-gray-400 text-sm md:text-base leading-relaxed mb-4">
            ZeniStack is a free digital utility suite built by{" "}
            <span className="text-orange-400 font-semibold">Zenikhon Tech</span>. We
            believe everyday file tasks — converting, merging, splitting, compressing
            — shouldn't require a paid subscription, a cloud account, or a privacy
            trade-off.
          </p>
          <p className="text-gray-500 text-sm leading-relaxed mb-4">
            Every tool on this site runs entirely inside your browser. Your files
            never leave your device — no servers, no storage, no tracking. What you
            do here stays here.
          </p>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            We're just getting started. More tools are on the way — all free, all
            private, all fast. If ZeniStack saves you time, tell a friend 😉
          </p>
          <a
            href="https://ko-fi.com/zenikhontech"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-semibold border border-yellow-500/30 text-yellow-400 bg-yellow-500/5 hover:bg-yellow-500/10 px-4 py-2 rounded-xl transition-all hover:scale-105"
          >
            ☕ Support ZeniStack
          </a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t border-white/5 py-6 px-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <Logo size={20}/>
          <span>ZeniStack by <span className="text-gray-500">Zenikhon Tech</span></span>
        </div>
        <span>© {new Date().getFullYear()} Zenikhon Tech. All rights reserved.</span>
        <span className="text-gray-700">Built with privacy in mind.</span>
      </footer>

      {/* ── TOAST ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl border ${
              toast.type === "error"
                ? "bg-red-950 border-red-500/30 text-red-300"
                : "bg-gray-950 border-orange-500/30 text-orange-300"
            }`}>
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function Panel({ title, desc, children }) {
  return (
    <div className="bg-gray-950 border border-white/5 rounded-2xl p-6 md:p-8 shadow-xl">
      <div className="mb-6">
        <h2 className="text-xl font-extrabold tracking-tight text-white mb-1">{title}</h2>
        <p className="text-sm text-gray-500">{desc}</p>
      </div>
      {children}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <span className="flex items-center gap-2 justify-center">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      Working…
    </span>
  );
}
