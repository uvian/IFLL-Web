/* IFLL PDF Viewer Logic */
import * as pdfjsLib from 'https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

let pdfDoc = null;
let allTextBlocks = [];
let isTranslating = false;

const viewer = document.getElementById('pdfViewer');
const transContent = document.getElementById('transContent');
const status = document.getElementById('status');
const filename = document.getElementById('filename');
const urlInput = document.getElementById('pdfUrlInput');
const openBtn = document.getElementById('openPdf');
const translateBtn = document.getElementById('translateAll');

/* Drop zone */
viewer.addEventListener('dragover', e => { e.preventDefault(); viewer.classList.add('ifll-pdf-dragover'); });
viewer.addEventListener('dragleave', () => viewer.classList.remove('ifll-pdf-dragover'));
viewer.addEventListener('drop', async e => {
  e.preventDefault();
  viewer.classList.remove('ifll-pdf-dragover');
  const file = e.dataTransfer.files[0];
  if (file?.type === 'application/pdf') {
    const url = URL.createObjectURL(file);
    filename.textContent = file.name;
    urlInput.value = file.name;
    await loadPdf(url);
  }
});

/* URL open */
openBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) return;
  filename.textContent = url.split('/').pop() || 'Document';
  await loadPdf(url);
});

/* Translate */
translateBtn.addEventListener('click', () => translateAll());

/* Load from URL param */
const params = new URLSearchParams(window.location.search);
if (params.has('url')) {
  const url = decodeURIComponent(params.get('url'));
  urlInput.value = url;
  filename.textContent = url.split('/').pop() || 'Document';
  loadPdf(url);
}

async function loadPdf(url) {
  try {
    status.textContent = '⏳ 加载中...';
    translateBtn.disabled = true;
    allTextBlocks = [];
    transContent.innerHTML = '<p class="ifll-pdf-trans-empty">点击「全部翻译」开始</p>';

    pdfDoc = await pdfjsLib.getDocument(url).promise;
    const pages = pdfDoc.numPages;
    status.textContent = `${pages} 页`;
    translateBtn.disabled = false;

    viewer.innerHTML = '';
    for (let i = 1; i <= pages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: ctx, viewport }).promise;

      const textContent = await page.getTextContent();
      const text = textContent.items.map(it => it.str).join(' ');
      allTextBlocks.push({ page: i, text });

      const pageDiv = document.createElement('div');
      pageDiv.className = 'ifll-pdf-page';
      pageDiv.innerHTML = `
        <canvas data-page="${i}"></canvas>
        <div class="ifll-pdf-page-text" data-page="${i}">${text || '(无文字层)'}</div>`;
      pageDiv.querySelector('canvas').getContext('2d').drawImage(canvas, 0, 0);
      viewer.appendChild(pageDiv);
    }
  } catch (err) {
    status.textContent = `❌ ${err.message}`;
    console.error('PDF load error:', err);
  }
}

async function translateAll() {
  if (isTranslating || !allTextBlocks.length) return;
  const s = await IFLL_STORAGE.get();
  if (!s.apiKey) {
    transContent.innerHTML = '<p class="ifll-pdf-trans-empty">🔑 请先在 IFLL 弹出窗配置 AI API Key</p>';
    return;
  }
  isTranslating = true;
  translateBtn.textContent = '⏳ 翻译中...';
  translateBtn.disabled = true;
  transContent.innerHTML = '';

  for (const block of allTextBlocks) {
    if (!block.text || block.text === '(无文字层)') continue;
    const result = await translateBlock(block, s);
    if (result) {
      const div = document.createElement('div');
      div.className = 'ifll-pdf-trans-block';
      div.innerHTML = `<em>第 ${block.page} 页</em>${result}`;
      transContent.appendChild(div);
      transContent.scrollTop = transContent.scrollHeight;
    }
  }

  isTranslating = false;
  translateBtn.textContent = '全部翻译';
  translateBtn.disabled = false;
}

async function translateBlock(block, settings) {
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'IFLL_AI_PDF_TRANSLATE',
      text: block.text,
      apiKey: settings.apiKey,
      apiEndpoint: settings.apiEndpoint,
      apiModel: settings.apiModel
    });
    if (result?.success) return result.translation;
  } catch (_) {}
  return null;
}
