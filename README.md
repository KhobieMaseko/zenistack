# ZeniStack

> **Your digital utility stack.** — Free, private, browser-based PDF and file tools. No sign-up. No uploads. No nonsense.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-zenistack.vercel.app-orange?style=flat-square)](https://zenistack.vercel.app)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Built with React](https://img.shields.io/badge/Built%20with-React%2018-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Built with Vite](https://img.shields.io/badge/Bundler-Vite-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![Powered by pdf-lib](https://img.shields.io/badge/PDF%20Engine-pdf--lib-red?style=flat-square)](https://pdf-lib.js.org)

---

## Table of Contents

- [Overview](#overview)
- [Live Demo](#live-demo)
- [Features](#features)
- [Tools](#tools)
- [Tech Stack](#tech-stack)
- [Privacy Model](#privacy-model)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Deployment](#deployment)
- [SEO & Analytics](#seo--analytics)
- [File Limits](#file-limits)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Author](#author)
- [License](#license)

---

## Overview

**ZeniStack** is a free, open-source suite of browser-based file utility tools built by [Zenikhon Tech](https://zenistack.vercel.app). It was designed around a single principle: everyday file tasks — converting, merging, splitting, compressing — should not require a paid subscription, a cloud account, or a privacy trade-off.

Every tool runs entirely client-side using JavaScript. Files are processed in the user's browser using the device's own memory and CPU. Nothing is ever transmitted to a server. There is no backend, no database, and no user tracking beyond optional, anonymised Google Analytics events.

ZeniStack is built to be fast, honest, and accessible to anyone with a modern web browser.

---

## Live Demo

🔗 **[https://zenistack.vercel.app](https://zenistack.vercel.app)**

---

## Features

- ✅ **100% client-side** — all processing happens in the browser
- ✅ **Zero uploads** — files never leave the user's device
- ✅ **No account required** — open and use immediately
- ✅ **Drag & drop** — drop files directly onto any tool panel
- ✅ **Drag to reorder** — reorder images and PDFs before processing
- ✅ **Format validation** — wrong file type produces a clear inline error
- ✅ **File size & count limits** — transparent limits with user-facing hints
- ✅ **EXIF rotation correction** — phone photos are automatically straightened
- ✅ **Animated UI** — smooth tab transitions and toast notifications
- ✅ **Mobile friendly** — fully responsive, touch-drag support via Framer Motion
- ✅ **Dark theme** — low-eye-strain interface with orange accent palette
- ✅ **SEO optimised** — structured data, Open Graph, Twitter Card, canonical tags
- ✅ **Free forever** — no freemium tier, no paywalled features

---

## Tools

### 🖼️ Images → PDF
Convert one or more images (JPG, PNG, WebP, GIF, etc.) into a single PDF document.

- Supports multiple image formats
- Drag to reorder images before conversion
- Automatically corrects EXIF rotation on phone photos (orientations 1–8)
- White-fills transparent PNG alpha channels so they render correctly in PDF
- Each image becomes a full page sized to the image's aspect ratio

**Limits:** Max 20 images · Max 20MB per image

---

### 🔗 Merge PDFs
Combine multiple PDF files into a single output PDF, in any order you choose.

- Upload up to 10 PDFs
- Drag rows to set the final page order before merging
- Preserves all original page content, dimensions, and formatting
- Powered by `pdf-lib`'s `copyPages` API

**Limits:** Max 10 files · Max 50MB per file

---

### ✂️ Split PDF
Extract pages from a PDF into separate output files using three flexible modes:

| Mode | Description |
|---|---|
| **By ranges** | Enter comma-separated ranges like `1-3, 5, 7-10`. Each group becomes its own PDF. |
| **Every N pages** | Splits the entire document into equal chunks of N pages each. |
| **All pages** | Saves every page as its own individual PDF. Downloads stagger automatically. |

**Limits:** Max 100MB

---

### 🗜️ Compress PDF
Significantly reduces PDF file size by re-rendering every page as an optimised JPEG image via PDF.js, then rebuilding the PDF with `pdf-lib`.

- Three quality presets: Small (~70–85% smaller), Balanced (~40–60% smaller), High (~15–30% smaller)
- Fine-grained quality slider (10–95%)
- Live page-by-page progress bar during rendering
- Before/after size comparison with percentage reduction displayed
- Download button appears only after compression completes

> **Note:** This tool rasterises all pages to JPEG images. Text in the output PDF is not selectable or searchable. This is the intended trade-off for maximum compression and is identical to how tools like iLovePDF and Smallpdf achieve in-browser compression.

**Limits:** Max 100MB

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [React 18](https://react.dev) |
| Bundler | [Vite](https://vitejs.dev) |
| Styling | [Tailwind CSS v3](https://tailwindcss.com) |
| Animation | [Framer Motion](https://www.framer.com/motion/) |
| PDF manipulation | [pdf-lib](https://pdf-lib.js.org) |
| PDF rendering (compress) | [PDF.js 3.11](https://mozilla.github.io/pdf.js/) (loaded from CDN) |
| Image → PDF generation | [jsPDF](https://github.com/parallax/jsPDF) |
| Deployment | [Vercel](https://vercel.com) |

---

## Privacy Model

ZeniStack is architecturally private by design, not just by policy.

- **No server.** There is no backend. The application is a static site — an HTML file, a JS bundle, and a CSS file. There is nothing to send files to.
- **No storage.** Files loaded into the tools exist only in the browser's memory (RAM). They are never written to disk, a database, or a cloud bucket.
- **No cookies.** ZeniStack sets no cookies of any kind.
- **Optional analytics.** Google Analytics is used solely to count page views and tool usage events (e.g. "compress_pdf was used"). No file names, file contents, or personally identifiable information are ever included in analytics events. Analytics can be blocked entirely by any ad-blocker without affecting tool functionality.
- **Open source.** The entire codebase is public. Anyone can audit exactly what the application does.

---

## Project Structure

```
zenistack/
├── public/
│   ├── zenistack-favicon.svg       # SVG favicon (preferred by modern browsers)
│   └── zenistack-favicon-512.png   # PNG favicon (fallback + Apple touch icon)
├── src/
│   ├── App.jsx                     # Entire application — all tools, UI, logic
│   └── main.jsx                    # React entry point
├── index.html                      # HTML shell with SEO meta tags + Analytics
├── tailwind.config.js              # Tailwind configuration
├── vite.config.js                  # Vite build configuration
├── package.json
└── README.md
```

> All application logic lives in `src/App.jsx`. The file is intentionally kept as a single module for simplicity and ease of self-hosting. It can be refactored into separate component files at any time without changing behaviour.

---

## SEO & Analytics

### SEO

`index.html` is fully optimised for search engines and social sharing:

- Descriptive `<title>` targeting all four tool keywords
- `<meta name="description">` covering all tools
- `<link rel="canonical">` to prevent duplicate content penalties
- **Open Graph** tags for Facebook, LinkedIn, and WhatsApp link previews
- **Twitter Card** tags for X (formerly Twitter) link previews
- **JSON-LD structured data** registering the site as a free `WebApplication` for Google rich results
- `<link rel="preconnect">` to Cloudflare CDN for faster PDF.js loading

Visible on-page SEO keyword strip (rendered as real DOM text, not hidden):

```
🔒 100% Private — Files Never Leave Your Device
· Free PDF tools online · Merge PDF without uploading
· Split PDF in browser · Compress PDF free
```

### Google Analytics

Tool usage is tracked via anonymised GA4 events. I used the following:

1. Created a GA4 property at [analytics.google.com](https://analytics.google.com)
2. Copied a Measurement ID (`G-XXXXXXXXXX`)
3. Added the GA4 script tags to `index.html` (see the inline comments in the file)

Events fired:

| Event name | `tool_name` parameter | Fired when |
|---|---|---|
| `tool_used` | `image_to_pdf` | User clicks Convert to PDF |
| `tool_used` | `merge_pdf` | User clicks Merge PDFs |
| `tool_used` | `split_pdf` | User clicks Split PDF |
| `tool_used` | `compress_pdf` | User clicks Compress PDF |

---

## File Limits

Limits are enforced client-side with user-facing error toasts. They exist to prevent the browser tab from running out of memory on large files.

| Tool | Max file size | Max file count |
|---|---|---|
| Images → PDF | 20 MB per image | 20 images |
| Merge PDFs | 50 MB per file | 10 files |
| Split PDF | 100 MB | 1 file |
| Compress PDF | 100 MB | 1 file |

These values are defined as named constants at the top of the relevant functions in `App.jsx` and can be adjusted freely:

```js
const MAX_IMAGE_SIZE_MB  = 20;
const MAX_IMAGE_COUNT    = 20;
const MAX_PDF_SIZE_MB    = 50;
const MAX_PDF_COUNT      = 10;
const MAX_SPLIT_SIZE_MB  = 100;
const MAX_COMPRESS_SIZE_MB = 100;
```

---

## Roadmap

The following tools are planned for future releases:

- [ ] PDF → Word (`.docx`) conversion
- [ ] PDF → Excel (`.xlsx`) conversion
- [ ] PDF page rotation
- [ ] PDF watermark (text or image overlay)
- [ ] Image resizer (resize by dimensions or percentage)
- [ ] Background remover (AI-assisted, client-side)
- [ ] About page with full Zenikhon Tech information
- [ ] Tool usage statistics dashboard (public)

---

## Contributing

Contributions are welcome. If you find a bug, have a feature suggestion, or want to add a new tool, please open an issue or submit a pull request.

### How to contribute

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR-USERNAME/zenistack.git
cd zenistack

# 3. Create a feature branch
git checkout -b feature/your-feature-name

# 4. Make your changes and commit
git add .
git commit -m "Add: brief description of what you did"

# 5. Push to your fork
git push origin feature/your-feature-name

# 6. Open a Pull Request on GitHub
```

### Guidelines

- Keep all processing client-side. No server-side code or external API calls that transmit user files.
- Match the existing dark theme and orange accent palette.
- Add visible file size and count limits to any new tool.
- Test on both desktop and mobile before submitting.

---

## Author

**Zenikhon Tech**

- Website: [zenistack.vercel.app](https://zenistack.vercel.app)
- GitHub: [This Page](https://github.com/KhobieMaseko/zenistack/)

ZeniStack was designed, built, and is maintained by Zenikhon Tech as a free public utility. If it saves you time, consider sharing it or [buying a coffee](https://ko-fi.com/zenikhontech) to support continued development.

---

## License

This project is licensed under the **MIT License** — you are free to use, copy, modify, merge, publish, distribute, sublicense, and sell copies of this software, provided the original copyright notice is included.

See the [LICENSE](LICENSE) file for the full text.

---

<div align="center">
  <sub>Built with care by Zenikhon Tech · Free forever · Private by design</sub>
</div>
