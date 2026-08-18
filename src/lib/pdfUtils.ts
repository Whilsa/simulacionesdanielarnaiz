import html2pdf from 'html2pdf.js';

// Canvas 2D context for native browser color parsing
const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;

/**
 * Gamma function for linear sRGB to non-linear sRGB
 */
function srgbGamma(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/**
 * Converts OKLAB parameters (L, aVal, bVal, alpha) to "rgb(r, g, b)" or "rgba(r, g, b, a)"
 */
export function oklabToRgbValues(L: number, aVal: number, bVal: number, alpha: number = 1): string {
  const l_ = L + 0.3963377774 * aVal + 0.2158037573 * bVal;
  const m_ = L - 0.1055613458 * aVal - 0.0638541728 * bVal;
  const s_ = L - 0.0894841775 * aVal - 1.2914855480 * bVal;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r_lin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g_lin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b_lin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const r = Math.min(255, Math.max(0, Math.round(srgbGamma(r_lin) * 255)));
  const g = Math.min(255, Math.max(0, Math.round(srgbGamma(g_lin) * 255)));
  const b = Math.min(255, Math.max(0, Math.round(srgbGamma(b_lin) * 255)));

  if (alpha < 0.999) {
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Converts OKLCH color strings e.g. "oklch(0.65 0.24 250)" or "oklch(65% 0.24 250 / 0.8)" to RGB
 */
export function oklchToRgb(oklchStr: string): string {
  try {
    const match = oklchStr.match(/oklch\(\s*([\d.%]+)[\s,]+([\d.]+)(?:[\s,]+([-\d.]+))?(?:\s*[\/,]\s*([\d.%]+))?\s*\)/i);
    if (!match) return oklchStr;

    let [, lStr, cStr, hStr, aStr] = match;
    let L = parseFloat(lStr);
    if (lStr && lStr.includes('%')) L = L / 100;

    let C = parseFloat(cStr || '0');
    let H = parseFloat(hStr || '0');

    let alpha = 1;
    if (aStr) {
      alpha = parseFloat(aStr);
      if (aStr.includes('%')) alpha = alpha / 100;
    }

    const hRad = (H * Math.PI) / 180;
    const aVal = C * Math.cos(hRad);
    const bVal = C * Math.sin(hRad);

    return oklabToRgbValues(L, aVal, bVal, alpha);
  } catch {
    return 'rgb(15, 23, 42)';
  }
}

/**
 * Converts OKLAB color strings e.g. "oklab(0.7 0.1 -0.1)" or "oklab(70% 0.1 -0.1 / 80%)" to RGB
 */
export function oklabToRgb(oklabStr: string): string {
  try {
    const match = oklabStr.match(/oklab\(\s*([\d.%]+)[\s,]+([-\d.]+)(?:[\s,]+([-\d.]+))?(?:\s*[\/,]\s*([\d.%]+))?\s*\)/i);
    if (!match) return oklabStr;

    let [, lStr, aStr, bStr, alphaStr] = match;
    let L = parseFloat(lStr);
    if (lStr && lStr.includes('%')) L = L / 100;

    let aVal = parseFloat(aStr || '0');
    let bVal = parseFloat(bStr || '0');

    let alpha = 1;
    if (alphaStr) {
      alpha = parseFloat(alphaStr);
      if (alphaStr.includes('%')) alpha = alpha / 100;
    }

    return oklabToRgbValues(L, aVal, bVal, alpha);
  } catch {
    return 'rgb(15, 23, 42)';
  }
}

/**
 * Converts ANY CSS color string to a standard RGB / RGBA / Hex string
 */
export function parseColorToRgb(colorStr: string): string {
  if (!colorStr || colorStr === 'transparent' || colorStr === 'inherit' || colorStr === 'initial') {
    return colorStr;
  }

  // 1. Attempt native browser canvas resolution first
  if (ctx) {
    try {
      ctx.fillStyle = 'rgb(1, 2, 3)'; // sentinel
      ctx.fillStyle = colorStr;
      const resolved = ctx.fillStyle;
      if (
        resolved &&
        resolved !== 'rgb(1, 2, 3)' &&
        !resolved.includes('oklch') &&
        !resolved.includes('oklab') &&
        !resolved.includes('color-mix')
      ) {
        return resolved;
      }
    } catch {
      // Fall through
    }
  }

  // 2. Math-based conversion for oklch / oklab
  if (colorStr.includes('oklch')) {
    return oklchToRgb(colorStr);
  }
  if (colorStr.includes('oklab')) {
    return oklabToRgb(colorStr);
  }

  return colorStr;
}

/**
 * Replaces modern CSS color functions in stylesheets with standard RGB strings
 */
export function replaceModernCssColors(cssText: string): string {
  if (!cssText) return cssText;
  let result = cssText;

  if (result.includes('oklch')) {
    result = result.replace(/oklch\([^)]+\)/gi, (match) => parseColorToRgb(match));
  }
  if (result.includes('oklab')) {
    result = result.replace(/oklab\([^)]+\)/gi, (match) => parseColorToRgb(match));
  }
  if (result.includes('color-mix')) {
    result = result.replace(/color-mix\([^)]+\)/gi, 'rgba(15, 23, 42, 0.1)');
  }

  return result;
}

/**
 * Sanitizes style tags inside a cloned document for html2canvas
 */
export function sanitizeClonedDocumentStyles(clonedDoc: Document) {
  try {
    const styleTags = clonedDoc.querySelectorAll('style');
    styleTags.forEach((styleTag) => {
      if (
        styleTag.textContent &&
        (styleTag.textContent.includes('oklch') ||
          styleTag.textContent.includes('oklab') ||
          styleTag.textContent.includes('color-mix'))
      ) {
        styleTag.textContent = replaceModernCssColors(styleTag.textContent);
      }
    });

    const allElements = clonedDoc.querySelectorAll('*');
    allElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (
        htmlEl.style &&
        htmlEl.style.cssText &&
        (htmlEl.style.cssText.includes('oklch') ||
          htmlEl.style.cssText.includes('oklab') ||
          htmlEl.style.cssText.includes('color-mix'))
      ) {
        htmlEl.style.cssText = replaceModernCssColors(htmlEl.style.cssText);
      }
    });
  } catch (err) {
    console.warn('Cloned styles sanitization warning:', err);
  }
}

/**
 * Copies evaluated computed styles (color, backgroundColor, border, fill, stroke) from live DOM to cloned DOM
 */
export function inlineComputedStylesToClone(originalEl: HTMLElement, cloneEl: HTMLElement) {
  try {
    const origNodes = [originalEl, ...Array.from(originalEl.querySelectorAll('*'))];
    const cloneNodes = [cloneEl, ...Array.from(cloneEl.querySelectorAll('*'))];

    const len = Math.min(origNodes.length, cloneNodes.length);
    for (let i = 0; i < len; i++) {
      const orig = origNodes[i] as HTMLElement;
      const clone = cloneNodes[i] as HTMLElement;

      if (!orig || !clone || !clone.style) continue;

      const computed = window.getComputedStyle(orig);

      if (computed.color && computed.color !== 'rgba(0, 0, 0, 0)') {
        clone.style.color = parseColorToRgb(computed.color);
      }
      if (
        computed.backgroundColor &&
        computed.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        computed.backgroundColor !== 'transparent'
      ) {
        clone.style.backgroundColor = parseColorToRgb(computed.backgroundColor);
      }
      if (
        computed.borderColor &&
        computed.borderColor !== 'rgba(0, 0, 0, 0)' &&
        computed.borderColor !== 'transparent'
      ) {
        clone.style.borderColor = parseColorToRgb(computed.borderColor);
      }
      if (computed.fill && computed.fill !== 'none') {
        clone.style.fill = parseColorToRgb(computed.fill);
      }
      if (computed.stroke && computed.stroke !== 'none') {
        clone.style.stroke = parseColorToRgb(computed.stroke);
      }
    }
  } catch (err) {
    console.warn('Computed styles inline copy warning:', err);
  }
}

/**
 * Prints a DOM element using a hidden iframe. Works seamlessly without opening new tabs or popups.
 */
export function printElementInHiddenIframe(element: HTMLElement, title: string = 'Documento'): boolean {
  try {
    const oldIframe = document.getElementById('app-hidden-print-iframe');
    if (oldIframe) oldIframe.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'app-hidden-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = '0px';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) return false;

    const clone = element.cloneNode(true) as HTMLElement;
    inlineComputedStylesToClone(element, clone);

    const noPrint = clone.querySelectorAll('.print\\:hidden, .no-print');
    noPrint.forEach((el) => el.remove());

    clone.style.width = '100%';
    clone.style.maxWidth = '800px';
    clone.style.margin = '0 auto';
    clone.style.boxShadow = 'none';

    let stylesHtml = '';
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((s) => {
      if (s.tagName.toLowerCase() === 'style' && s.textContent) {
        stylesHtml += `<style>${replaceModernCssColors(s.textContent)}</style>`;
      } else {
        stylesHtml += s.outerHTML;
      }
    });

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          ${stylesHtml}
          <style>
            @media print {
              @page { size: A4 portrait; margin: 10mm; }
              body {
                background-color: #ffffff !important;
                color: #0f172a !important;
                margin: 0 !important;
                padding: 0 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
            body {
              background-color: #ffffff !important;
              color: #0f172a !important;
              font-family: ui-sans-serif, system-ui, -apple-system, sans-serif !important;
              margin: 0 !important;
              padding: 24px !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          </style>
        </head>
        <body>
          <div style="max-width: 800px; margin: 0 auto;">
            ${clone.outerHTML}
          </div>
        </body>
      </html>
    `);
    iframeDoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('Print iframe error:', e);
      }
    }, 300);

    return true;
  } catch (err) {
    console.error('Hidden iframe print creation failed:', err);
    return false;
  }
}

/**
 * Opens a dedicated print window formatted for clean document printing
 */
export function openPrintWindow(element: HTMLElement, title: string = 'Factura'): boolean {
  try {
    const printWin = window.open('', '_blank');
    if (!printWin) return false;

    const clone = element.cloneNode(true) as HTMLElement;
    inlineComputedStylesToClone(element, clone);

    const noPrint = clone.querySelectorAll('.print\\:hidden, .no-print');
    noPrint.forEach((el) => el.remove());

    let stylesHtml = '';
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((s) => {
      if (s.tagName.toLowerCase() === 'style' && s.textContent) {
        stylesHtml += `<style>${replaceModernCssColors(s.textContent)}</style>`;
      } else {
        stylesHtml += s.outerHTML;
      }
    });

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          ${stylesHtml}
          <style>
            body {
              background-color: #ffffff !important;
              color: #0f172a !important;
              font-family: ui-sans-serif, system-ui, -apple-system, sans-serif !important;
              margin: 0 !important;
              padding: 24px !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            @media print {
              body { padding: 0 !important; }
              @page { margin: 10mm; }
            }
          </style>
        </head>
        <body>
          <div style="max-width: 800px; margin: 0 auto;">
            ${clone.outerHTML}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.focus();
                window.print();
              }, 300);
            };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
    return true;
  } catch (e) {
    console.error('Error opening print window:', e);
    return false;
  }
}

/**
 * Downloads a DOM element directly as a clean PDF file using html2pdf.js with full color fidelity
 */
export async function downloadElementAsPDF(
  element: HTMLElement,
  filename: string = 'documento.pdf'
): Promise<boolean> {
  try {
    const clone = element.cloneNode(true) as HTMLElement;

    // Inline evaluated computed RGB colors onto the clone element
    inlineComputedStylesToClone(element, clone);

    // Remove elements marked no-print
    const noPrintElements = clone.querySelectorAll('.print\\:hidden, .no-print');
    noPrintElements.forEach((el) => el.remove());

    // Apply layout styling overrides for clean A4 PDF output
    clone.style.width = '100%';
    clone.style.maxWidth = '800px';
    clone.style.padding = '24px';
    clone.style.margin = '0 auto';
    clone.style.backgroundColor = '#ffffff';
    clone.style.fontSize = '12px';
    clone.style.borderRadius = '0px';
    clone.style.boxShadow = 'none';

    // Temporary container element off-screen
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '800px';
    container.appendChild(clone);
    document.body.appendChild(container);

    const opt = {
      margin: [10, 10, 10, 10], // mm
      filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc: Document) => {
          // Sanitize ONLY inside html2canvas's isolated cloned document
          sanitizeClonedDocumentStyles(clonedDoc);
        }
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Render PDF using html2pdf
    await (html2pdf as any)().set(opt).from(clone).save();

    // Cleanup
    document.body.removeChild(container);
    return true;
  } catch (error) {
    console.error('Error generating PDF via html2pdf:', error);
    return printElementFallback(element, filename);
  }
}

/**
 * Handles printing or downloads PDF if direct print is blocked by iframe sandbox
 */
export async function printElementFallback(
  element: HTMLElement,
  filename: string = 'documento.pdf'
): Promise<boolean> {
  // 1. First try hidden iframe printing directly inside the page
  const successIframe = printElementInHiddenIframe(element, filename.replace('.pdf', ''));
  if (successIframe) return true;

  // 2. Try opening print window in new tab
  const successWin = openPrintWindow(element, filename.replace('.pdf', ''));
  if (successWin) return true;

  // 3. Fallback to direct PDF download
  return await downloadElementAsPDF(element, filename);
}
