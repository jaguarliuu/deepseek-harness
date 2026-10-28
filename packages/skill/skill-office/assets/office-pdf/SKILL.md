---
name: office-pdf
description: Read PDF text and metadata, merge PDFs, or extract selected pages using bundled Python libraries. No download is needed in Desktop.
---

# PDF documents

Call `load_workspace_dependencies` and use the returned absolute Python executable. The Desktop runtime includes `pypdf`; do not run pip or download another interpreter for these operations. Work on local files and preserve the originals unless replacement was requested.

Use `pypdf.PdfReader(path)` to inspect page count, metadata and text. Read each page with `page.extract_text()`, preserving page numbers in the result. Empty text can mean scanned images: report that OCR is unavailable rather than inventing content. Image OCR and encrypted PDFs requiring extra crypto libraries are outside this bundled workflow; do not download models or dependencies automatically.

For merging, create `pypdf.PdfWriter()`, call `writer.append(path)` for each input in the requested order, then `writer.write(output_path)`. For selected pages, use `writer.add_page(reader.pages[index])`; Python indices are zero-based, while user page numbers are one-based. Validate ranges against `len(reader.pages)` and retain the requested ordering. Save to a distinct output path and reopen it to verify page count and selected text. PDF signatures are not preserved by rewriting; report that limitation when signed inputs are involved.

To create a styled PDF from Word, Excel or PowerPoint, use `office-export-pdf`. For visual inspection or rendered page images, use `office-render`. Deliver the requested output through `present` when available. Do not claim OCR, layout fidelity or signature validation from successful text extraction alone.
