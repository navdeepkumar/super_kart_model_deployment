/*
 * SuperKart Sales Forecasting: workflow frontend.
 *
 * A single ES module that defines the whole application as native Web
 * Components (Custom Elements with Shadow DOM). No build step, no bundler,
 * no framework, just what a modern browser already provides.
 *
 * Two things sit above the forecasting wizard itself:
 *   - Routing: <app-shell> reads window.location.hash to decide whether to
 *     show the wizard or one of the static pages (History, Docs, Help,
 *     Contact). Plain anchor tags with href="#/whatever" drive it, the
 *     browser's own back and forward buttons work for free.
 *   - Persistence: every successful prediction is recorded server side by
 *     the Flask backend (see history_store.py), the History page and the
 *     sidebar both read that same record through GET /v1/history, so what
 *     a user sees survives a reload or even a different browser tab.
 *
 * Every step and page element only ever talks back to <app-shell> through
 * CustomEvents, it never reaches into its parent or its siblings directly,
 * which keeps each one easy to read, change, and reuse on its own.
 */

// =====================================================================
// Backend connection
//
// The browser calls the Flask API directly, so the base URL has to be one
// the browser itself can reach. That is different in every environment:
//   - No Docker: http://127.0.0.1:7860
//   - Docker on one machine: http://localhost:7860 (the published port)
//   - GitHub Codespaces: the forwarded URL for the backend's port, which
//     is only known once the Codespace has started and that port has been
//     made public
// env.js supplies a sensible default for the first two cases and is
// regenerated from the BACKEND_URL environment variable when this runs in
// a container. The settings panel in the header lets the URL be overridden
// at any time without rebuilding or redeploying anything, which is what
// the Codespaces case needs.
// =====================================================================
const BACKEND_URL_STORAGE_KEY = "superkart_backend_url";
const REPO_URL = "https://github.com/navdeepkumar/super_kart_model_deployment";
const NOTEBOOK_REPO_URL = "https://github.com/navdeepkumar/model_deployment_dba";
const CONTACT_EMAIL = "nkumar.navdeep@gmail.com";

function getBackendUrl() {
  const stored = window.localStorage.getItem(BACKEND_URL_STORAGE_KEY);
  const fallback = window.__BACKEND_URL__ || "http://127.0.0.1:7860";
  return (stored || fallback).replace(/\/+$/, "");
}

function setBackendUrl(url) {
  window.localStorage.setItem(BACKEND_URL_STORAGE_KEY, url.replace(/\/+$/, ""));
}

// =====================================================================
// API client
// =====================================================================
async function apiRequest(path, options) {
  const response = await fetch(`${getBackendUrl()}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }
  return data;
}

async function predictSingle(payload) {
  return apiRequest("/v1/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function predictBatch(file) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  return apiRequest("/v1/predictbatch", { method: "POST", body: formData });
}

async function fetchHistory(limit = 50) {
  const data = await apiRequest(`/v1/history?limit=${limit}`, { method: "GET" });
  return data.predictions || [];
}

async function clearHistoryOnServer() {
  return apiRequest("/v1/history", { method: "DELETE" });
}

// =====================================================================
// Reference data: mirrors the feature engineering step from the training
// notebook exactly, so a plain business input maps to the same columns the
// serialized model pipeline was trained on.
// =====================================================================
const CURRENT_YEAR = 2025;

const PRODUCT_TYPE_TO_ID_CHAR = {
  "Baking Goods": "FD", "Breads": "FD", "Breakfast": "FD", "Canned": "FD",
  "Dairy": "FD", "Frozen Foods": "FD", "Fruits and Vegetables": "FD",
  "Meat": "FD", "Seafood": "FD", "Snack Foods": "FD", "Starchy Foods": "FD",
  "Hard Drinks": "DR", "Soft Drinks": "DR",
  "Health and Hygiene": "NC", "Household": "NC", "Others": "NC",
};
const PERISHABLE_TYPES = new Set(["Dairy", "Meat", "Fruits and Vegetables", "Breads", "Breakfast", "Seafood"]);
const PRODUCT_TYPES = Object.keys(PRODUCT_TYPE_TO_ID_CHAR).sort();
const SUGAR_CONTENT_OPTIONS = ["Low Sugar", "Regular", "No Sugar"];
const STORE_SIZE_OPTIONS = ["Small", "Medium", "High"];
const CITY_TIER_OPTIONS = ["Tier 1", "Tier 2", "Tier 3"];
const STORE_TYPE_OPTIONS = ["Food Mart", "Supermarket Type1", "Supermarket Type2", "Departmental Store"];
const FEATURE_COLUMNS = [
  "Product_Weight", "Product_Sugar_Content", "Product_Allocated_Area", "Product_MRP",
  "Store_Size", "Store_Location_City_Type", "Store_Type", "Product_Id_char",
  "Store_Age_Years", "Product_Type_Category",
];

function deriveEngineeredFeatures(productType, storeEstablishmentYear) {
  return {
    Product_Id_char: PRODUCT_TYPE_TO_ID_CHAR[productType],
    Store_Age_Years: CURRENT_YEAR - storeEstablishmentYear,
    Product_Type_Category: PERISHABLE_TYPES.has(productType) ? "Perishables" : "Non Perishables",
  };
}

// A handful of realistic rows, in the exact shape /v1/predictbatch expects,
// for a user who wants to see the format before building their own file.
const SAMPLE_BATCH_ROWS = [
  { Product_Weight: 12.66, Product_Sugar_Content: "Low Sugar", Product_Allocated_Area: 0.03, Product_MRP: 117.08, Store_Size: "Medium", Store_Location_City_Type: "Tier 2", Store_Type: "Supermarket Type2", Product_Id_char: "FD", Store_Age_Years: 16, Product_Type_Category: "Non Perishables" },
  { Product_Weight: 8.93, Product_Sugar_Content: "Regular", Product_Allocated_Area: 0.045, Product_MRP: 89.5, Store_Size: "High", Store_Location_City_Type: "Tier 1", Store_Type: "Supermarket Type1", Product_Id_char: "DR", Store_Age_Years: 9, Product_Type_Category: "Non Perishables" },
  { Product_Weight: 15.2, Product_Sugar_Content: "No Sugar", Product_Allocated_Area: 0.02, Product_MRP: 204.3, Store_Size: "Small", Store_Location_City_Type: "Tier 3", Store_Type: "Food Mart", Product_Id_char: "NC", Store_Age_Years: 21, Product_Type_Category: "Non Perishables" },
  { Product_Weight: 6.42, Product_Sugar_Content: "Low Sugar", Product_Allocated_Area: 0.055, Product_MRP: 145.75, Store_Size: "Medium", Store_Location_City_Type: "Tier 2", Store_Type: "Departmental Store", Product_Id_char: "FD", Store_Age_Years: 12, Product_Type_Category: "Perishables" },
];

function buildSampleBatchCsv() {
  const lines = [FEATURE_COLUMNS.join(",")].concat(
    SAMPLE_BATCH_ROWS.map((row) => FEATURE_COLUMNS.map((c) => row[c]).join(","))
  );
  return lines.join("\n");
}

// =====================================================================
// A small CSV reader, just enough to preview an uploaded batch file and
// rebuild the results table client side. A plain comma split is enough
// here because every column in this dataset is either numeric or a short
// category with no embedded commas or quoting, a real general-purpose CSV
// parser would be overkill for this input shape.
// =====================================================================
function parseCsv(text, maxDataRows = Infinity) {
  const lines = text.split(/\r\n|\n/).filter((line) => line.length > 0);
  const splitLine = (line) => line.split(",").map((cell) => cell.trim());
  const header = lines.length > 0 ? splitLine(lines[0]) : [];
  const totalRows = Math.max(lines.length - 1, 0);
  const rows = lines.slice(1, 1 + Math.min(maxDataRows, totalRows)).map(splitLine);
  return { header, rows, totalRows };
}

function downloadTextFile(filename, mimeType, text) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatCurrency(value) {
  return `Rs. ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTimestamp(isoString) {
  try {
    return new Date(isoString).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return isoString;
  }
}

// =====================================================================
// Shared stylesheet, adopted by every component below. Buttons, cards,
// form fields, badges, tables, page layout, and animations all look
// consistent this way without copying the same rules into a dozen
// different Shadow DOM style blocks. Constructable stylesheets are built
// once and reused by reference, which is also cheaper than parsing the
// same CSS text over and over.
// =====================================================================
const sharedSheet = new CSSStyleSheet();
sharedSheet.replaceSync(`
  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    padding: var(--space-5);
  }
  .btn {
    font: inherit;
    font-weight: 600;
    font-size: 14px;
    padding: 10px 20px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: background-color .15s ease, border-color .15s ease, opacity .15s ease, transform .1s ease;
  }
  .btn:active:not(:disabled) { transform: scale(.97); }
  .btn:disabled { opacity: .55; cursor: not-allowed; }
  .btn-primary { background: var(--color-primary); color: #fff; }
  .btn-primary:hover:not(:disabled) { background: var(--color-primary-dark); }
  .btn-secondary { background: var(--color-surface); color: var(--color-text); border-color: var(--color-border); }
  .btn-secondary:hover:not(:disabled) { background: var(--color-bg); }
  .btn-danger { background: var(--color-danger-soft); color: var(--color-danger); border-color: transparent; }
  .btn-danger:hover:not(:disabled) { background: var(--color-danger); color: #fff; }
  .field { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-4); }
  .field label { font-size: 13px; font-weight: 600; color: var(--color-text-muted); }
  .field input, .field select {
    font: inherit;
    font-size: 14px;
    padding: 9px 11px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }
  .field input:focus, .field select:focus { outline: 2px solid var(--color-primary); outline-offset: 1px; }
  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
    padding: 3px 10px; border-radius: 999px;
  }
  .badge-success { background: var(--color-success-soft); color: var(--color-success); }
  .badge-primary { background: var(--color-primary-soft); color: var(--color-primary-dark); }
  table.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.data-table th, table.data-table td {
    padding: 8px 10px; border-bottom: 1px solid var(--color-border);
    text-align: left; white-space: nowrap;
  }
  table.data-table th { color: var(--color-text-muted); font-weight: 600; background: var(--color-bg); position: sticky; top: 0; }
  .table-wrap { max-height: 300px; overflow: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
  .spinner {
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, .4); border-top-color: #fff;
    display: inline-block; animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .helper-text { font-size: 12px; color: var(--color-text-muted); }
  .error-banner {
    background: var(--color-danger-soft); color: var(--color-danger);
    border-radius: var(--radius-md); padding: var(--space-3) var(--space-4);
    font-size: 13px; margin-bottom: var(--space-4);
  }

  /* Page and step transitions: a small fade and rise, restarted every time
     app-shell swaps content by removing then re-adding this class. */
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-in { animation: fadeSlideIn .35s cubic-bezier(.2, .7, .3, 1) both; }

  @keyframes popIn {
    from { opacity: 0; transform: scale(.85); }
    to { opacity: 1; transform: scale(1); }
  }

  /* Long-form content pages: Docs, Help, Contact */
  .page h2 { margin-top: 0; }
  .page h3 { font-size: 15px; margin: var(--space-6) 0 var(--space-2) 0; }
  .page h3:first-of-type { margin-top: var(--space-3); }
  .page p, .page li { font-size: 14px; line-height: 1.65; color: var(--color-text); }
  .page .lead { color: var(--color-text-muted); font-size: 14px; margin-top: -6px; }
  .doc-section {
    border: 1px solid var(--color-border); border-radius: var(--radius-md);
    padding: var(--space-4) var(--space-5); margin: var(--space-4) 0;
    background: var(--color-bg); transition: box-shadow .2s ease, transform .15s ease;
  }
  .doc-section:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
  .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-3); margin: var(--space-4) 0; }
  .metric-tile {
    background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4); text-align: center;
  }
  .metric-tile .value { font-size: 22px; font-weight: 800; color: var(--color-primary-dark); }
  .metric-tile .label { font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: .03em; margin-top: 4px; }
  code.inline { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 4px; padding: 1px 6px; font-size: 13px; }
  pre.code-block {
    background: #1c2333; color: #e4e8f1; border-radius: var(--radius-md);
    padding: var(--space-4); overflow-x: auto; font-size: 12.5px; line-height: 1.6;
  }
`);

function withSharedStyles(shadowRoot) {
  shadowRoot.adoptedStyleSheets = [sharedSheet];
}

// Every place content gets swapped in calls this on the freshly filled
// container, restarting the fade-in animation even if the same class was
// already present a moment ago (reading offsetWidth forces a reflow).
function animateIn(element) {
  element.classList.remove("animate-in");
  void element.offsetWidth;
  element.classList.add("animate-in");
}

// =====================================================================
// <toast-stack>
// A single instance lives outside every shadow root, directly in
// document.body, so any component anywhere can call the module level
// showToast() helper without needing a reference to it. Small, temporary,
// self-dismissing notices, not a replacement for inline error banners.
// =====================================================================
class ToastStack extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          position: fixed; right: var(--space-5); bottom: var(--space-5);
          z-index: 1000; display: flex; flex-direction: column; gap: var(--space-2);
          font-family: var(--font-sans);
        }
        .toast {
          background: var(--color-text); color: #fff;
          padding: 10px 18px; border-radius: var(--radius-md);
          font-size: 13px; font-weight: 600; box-shadow: var(--shadow-md);
          animation: popIn .2s ease both;
          display: flex; align-items: center; gap: 8px;
        }
        .toast.success { background: var(--color-success); }
        .toast.danger { background: var(--color-danger); }
        @keyframes popIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeOut { to { opacity: 0; transform: translateY(-6px); } }
      </style>
    `;
  }

  push(message, kind = "info") {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = message;
    this.shadowRoot.appendChild(el);
    setTimeout(() => {
      el.style.animation = "fadeOut .25s ease forwards";
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }
}
customElements.define("toast-stack", ToastStack);

function showToast(message, kind = "info") {
  let stack = document.querySelector("toast-stack");
  if (!stack) {
    stack = document.createElement("toast-stack");
    document.body.appendChild(stack);
  }
  stack.push(message, kind);
}

// =====================================================================
// <step-indicator current="1..4">
// Pure presentational. Shows the four wizard stages as numbered circles
// connected by a line, marking earlier stages complete and the current one
// active.
// =====================================================================
class StepIndicator extends HTMLElement {
  static STAGES = ["Mode", "Data", "Review", "Results"];

  static get observedAttributes() {
    return ["current"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    this._render();
  }

  get current() {
    return Number(this.getAttribute("current")) || 1;
  }

  _render() {
    withSharedStyles(this.shadowRoot);
    const current = this.current;
    const steps = StepIndicator.STAGES.map((label, i) => {
      const n = i + 1;
      const state = n < current ? "done" : n === current ? "active" : "";
      const inner = n < current ? "&#10003;" : String(n);
      const line = i < StepIndicator.STAGES.length - 1
        ? `<div class="line ${n < current ? "done" : ""}"></div>`
        : "";
      return `<div class="step ${state}"><div class="circle">${inner}</div><div class="label">${label}</div></div>${line}`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <style>
        .wrap { display: flex; align-items: center; }
        .step { display: flex; align-items: center; gap: 10px; }
        .circle {
          width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700;
          border: 2px solid var(--color-border); color: var(--color-text-muted);
          background: var(--color-surface);
          transition: background-color .25s ease, border-color .25s ease, transform .25s ease;
        }
        .step.done .circle { background: var(--color-primary); border-color: var(--color-primary); color: #fff; animation: popIn .3s ease; }
        .step.active .circle { border-color: var(--color-primary); color: var(--color-primary); box-shadow: 0 0 0 4px var(--color-primary-soft); }
        .label { font-size: 13px; font-weight: 600; color: var(--color-text-muted); }
        .step.active .label, .step.done .label { color: var(--color-text); }
        .line { width: 40px; height: 2px; background: var(--color-border); margin: 0 10px; transition: background-color .3s ease; }
        .line.done { background: var(--color-primary); }
      </style>
      <div class="wrap">${steps}</div>
    `;
  }
}
customElements.define("step-indicator", StepIndicator);

// =====================================================================
// <step-mode-select>
// Step 1. Fires "mode-selected" with { mode: "single" | "batch" }.
// =====================================================================
class StepModeSelect extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    withSharedStyles(this.shadowRoot);
    this.shadowRoot.innerHTML = `
      <style>
        h2 { margin-top: 0; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-5); margin-top: var(--space-5); }
        @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
        .option {
          all: unset;
          box-sizing: border-box;
          display: block;
          width: 100%;
          text-align: left;
          cursor: pointer;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-6) var(--space-5);
          box-shadow: var(--shadow-sm);
          transition: border-color .15s ease, box-shadow .15s ease, transform .1s ease;
        }
        .option:hover { border-color: var(--color-primary); box-shadow: var(--shadow-md); transform: translateY(-3px); }
        .icon { font-size: 32px; margin-bottom: var(--space-3); transition: transform .2s ease; }
        .option:hover .icon { transform: scale(1.15) rotate(-4deg); }
        h3 { margin: 0 0 var(--space-2) 0; font-size: 17px; }
        p { margin: 0; font-size: 13px; color: var(--color-text-muted); line-height: 1.5; }
      </style>
      <div class="card">
        <h2>What would you like to forecast?</h2>
        <p class="helper-text">Choose a mode to get started. You can come back and change this later.</p>
        <div class="grid">
          <button type="button" class="option" data-mode="single">
            <div class="icon">&#128722;</div>
            <h3>Single Product Forecast</h3>
            <p>Enter the details of one product at one store and get an instant sales forecast.</p>
          </button>
          <button type="button" class="option" data-mode="batch">
            <div class="icon">&#128230;</div>
            <h3>Batch Upload</h3>
            <p>Upload a CSV of multiple product-store records and forecast all of them at once.</p>
          </button>
        </div>
      </div>
    `;

    this.shadowRoot.querySelectorAll(".option").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("mode-selected", {
          detail: { mode: btn.dataset.mode },
          bubbles: true,
          composed: true,
        }));
      });
    });
  }
}
customElements.define("step-mode-select", StepModeSelect);

// =====================================================================
// <step-single-form>
// Step 2, single record path. Fires "wizard-back" and "data-ready" with
// { mode: "single", payload, display, formState }.
// =====================================================================
class StepSingleForm extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._prior = null;
  }

  set initialData(value) {
    this._prior = value;
    if (this.isConnected) this._render();
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    withSharedStyles(this.shadowRoot);
    const d = this._prior || {};
    const opt = (value, selected) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`;
    // Stored internally as a 0 to 1 fraction, the unit the model was trained
    // on, but shown to the user as a percentage, which is what "how much of
    // the store's display area" actually means to a person filling this in.
    const areaPercent = Math.round((d.area ?? 0.03) * 1000) / 10;

    this.shadowRoot.innerHTML = `
      <style>
        h2 { margin-top: 0; }
        .field-section {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-bg);
          padding: var(--space-4) var(--space-5);
          margin-bottom: var(--space-5);
        }
        .section-header { display: flex; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-4); }
        .section-icon { font-size: 22px; line-height: 1; flex-shrink: 0; }
        .section-header h3 { margin: 0 0 2px 0; font-size: 15px; }
        .section-header p { margin: 0; }
        .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--space-5); }
        .section-grid .full-width { grid-column: 1 / -1; }
        @media (max-width: 640px) { .section-grid { grid-template-columns: 1fr; } }
        .slider-row { display: flex; align-items: center; gap: var(--space-4); }
        .slider-row input[type="range"] { flex: 1; accent-color: var(--color-primary); height: 4px; cursor: pointer; }
        .percent-box { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .percent-box input { width: 64px; text-align: right; }
        .percent-box span { font-size: 13px; color: var(--color-text-muted); font-weight: 600; }
        .actions { display: flex; justify-content: space-between; margin-top: var(--space-5); }
      </style>
      <div class="card">
        <h2>Product and store details</h2>
        <p class="helper-text" style="margin-top: -8px; margin-bottom: var(--space-5);">
          Fill in both sections below, then review everything on the next screen.
        </p>
        <div id="error-slot"></div>
        <form id="single-form">
          <section class="field-section">
            <div class="section-header">
              <span class="section-icon">&#128722;</span>
              <div>
                <h3>Product Details</h3>
                <p class="helper-text">What is being sold, and at what price</p>
              </div>
            </div>
            <div class="section-grid">
              <div class="field">
                <label for="productType">Product Type</label>
                <select id="productType">${PRODUCT_TYPES.map((t) => opt(t, d.productType || "Dairy")).join("")}</select>
              </div>
              <div class="field">
                <label for="mrp">Product MRP</label>
                <input id="mrp" type="number" min="0" step="0.01" value="${d.mrp ?? 117.08}" required>
              </div>
              <div class="field">
                <label for="productWeight">Product Weight</label>
                <input id="productWeight" type="number" min="0" step="0.01" value="${d.productWeight ?? 12.66}" required>
              </div>
              <div class="field">
                <label for="sugar">Product Sugar Content</label>
                <select id="sugar">${SUGAR_CONTENT_OPTIONS.map((s) => opt(s, d.sugar || "Low Sugar")).join("")}</select>
              </div>
              <div class="field full-width">
                <label for="areaSlider">Product Allocated Area</label>
                <div class="slider-row">
                  <input type="range" id="areaSlider" min="0" max="100" step="0.1" value="${areaPercent}">
                  <div class="percent-box">
                    <input type="number" id="areaPercent" min="0" max="100" step="0.1" value="${areaPercent}" required>
                    <span>%</span>
                  </div>
                </div>
                <p class="helper-text">Percentage of the store's total display area this product occupies</p>
              </div>
            </div>
          </section>

          <section class="field-section">
            <div class="section-header">
              <span class="section-icon">&#127970;</span>
              <div>
                <h3>Store Details</h3>
                <p class="helper-text">Which outlet this product is being sold at</p>
              </div>
            </div>
            <div class="section-grid">
              <div class="field">
                <label for="storeType">Store Type</label>
                <select id="storeType">${STORE_TYPE_OPTIONS.map((s) => opt(s, d.storeType || "Supermarket Type2")).join("")}</select>
              </div>
              <div class="field">
                <label for="storeSize">Store Size</label>
                <select id="storeSize">${STORE_SIZE_OPTIONS.map((s) => opt(s, d.storeSize || "Medium")).join("")}</select>
              </div>
              <div class="field">
                <label for="cityTier">Store Location City Type</label>
                <select id="cityTier">${CITY_TIER_OPTIONS.map((c) => opt(c, d.cityTier || "Tier 2")).join("")}</select>
              </div>
              <div class="field">
                <label for="year">Store Establishment Year</label>
                <input id="year" type="number" min="1980" max="${CURRENT_YEAR}" step="1" value="${d.year ?? 2009}" required>
              </div>
            </div>
          </section>

          <div class="actions">
            <button type="button" class="btn btn-secondary" id="back-btn">Back</button>
            <button type="submit" class="btn btn-primary">Review forecast &rarr;</button>
          </div>
        </form>
      </div>
    `;

    this.shadowRoot.getElementById("back-btn").addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("wizard-back", { bubbles: true, composed: true }));
    });

    this.shadowRoot.getElementById("single-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this._submit();
    });

    // Slider and number box represent the same value, either one can drive it
    const areaSlider = this.shadowRoot.getElementById("areaSlider");
    const areaPercentInput = this.shadowRoot.getElementById("areaPercent");
    areaSlider.addEventListener("input", () => {
      areaPercentInput.value = areaSlider.value;
    });
    areaPercentInput.addEventListener("input", () => {
      const value = Number(areaPercentInput.value);
      if (!Number.isNaN(value)) areaSlider.value = Math.min(100, Math.max(0, value));
    });
  }

  _submit() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const productType = $("productType").value;
    const productWeight = Number($("productWeight").value);
    const sugar = $("sugar").value;
    const areaPercent = Number($("areaPercent").value);
    const area = areaPercent / 100;
    const mrp = Number($("mrp").value);
    const storeSize = $("storeSize").value;
    const cityTier = $("cityTier").value;
    const storeType = $("storeType").value;
    const year = Number($("year").value);

    if ([productWeight, areaPercent, mrp, year].some((v) => Number.isNaN(v))) {
      this.shadowRoot.getElementById("error-slot").innerHTML =
        `<div class="error-banner">Please fill in every numeric field with a valid number.</div>`;
      return;
    }
    if (areaPercent < 0 || areaPercent > 100) {
      this.shadowRoot.getElementById("error-slot").innerHTML =
        `<div class="error-banner">Product Allocated Area must be between 0% and 100%.</div>`;
      return;
    }

    const engineered = deriveEngineeredFeatures(productType, year);
    const payload = {
      Product_Weight: productWeight,
      Product_Sugar_Content: sugar,
      Product_Allocated_Area: area,
      Product_MRP: mrp,
      Store_Size: storeSize,
      Store_Location_City_Type: cityTier,
      Store_Type: storeType,
      ...engineered,
    };

    const display = {
      "Product Type": productType,
      "Product MRP": mrp,
      "Product Weight": productWeight,
      "Product Sugar Content": sugar,
      "Product Allocated Area": `${areaPercent}%`,
      "Store Type": storeType,
      "Store Size": storeSize,
      "Store Location City Type": cityTier,
      "Store Establishment Year": year,
    };

    const formState = { productType, productWeight, sugar, area, mrp, storeSize, cityTier, storeType, year };

    this.dispatchEvent(new CustomEvent("data-ready", {
      detail: { mode: "single", payload, display, formState },
      bubbles: true,
      composed: true,
    }));
  }
}
customElements.define("step-single-form", StepSingleForm);

// =====================================================================
// <step-batch-upload>
// Step 2, batch path. Fires "wizard-back" and "data-ready" with
// { mode: "batch", file, preview }.
// =====================================================================
class StepBatchUpload extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._file = null;
    this._preview = null;
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    withSharedStyles(this.shadowRoot);
    this.shadowRoot.innerHTML = `
      <style>
        h2 { margin-top: 0; }
        .sample-row {
          display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
          background: var(--color-primary-soft); border-radius: var(--radius-md);
          padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4);
        }
        .sample-row p { margin: 0; font-size: 13px; color: var(--color-primary-dark); }
        .dropzone {
          display: block; box-sizing: border-box;
          border: 2px dashed var(--color-border); border-radius: var(--radius-md);
          padding: var(--space-6); text-align: center; cursor: pointer;
          background: var(--color-bg); transition: border-color .15s ease, background .15s ease;
        }
        .dropzone.dragging { border-color: var(--color-primary); background: var(--color-primary-soft); }
        .dropzone p { margin: var(--space-2) 0 0 0; color: var(--color-text-muted); font-size: 13px; }
        input[type="file"] { display: none; }
        .file-chip {
          display: inline-flex; align-items: center; gap: var(--space-2);
          background: var(--color-primary-soft); color: var(--color-primary-dark);
          padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 600;
          margin: var(--space-4) 0; animation: popIn .25s ease;
        }
        .actions { display: flex; justify-content: space-between; margin-top: var(--space-5); }
      </style>
      <div class="card">
        <h2>Upload a CSV for batch forecasting</h2>
        <p class="helper-text">Required columns: ${FEATURE_COLUMNS.join(", ")}</p>
        <div class="sample-row">
          <p>New to this format? Download a small sample file with the right columns and a few example rows.</p>
          <button type="button" class="btn btn-secondary" id="sample-btn">&#11015; Sample CSV</button>
        </div>
        <div id="error-slot"></div>
        <label class="dropzone" id="dropzone" for="file-input">
          <div style="font-size:28px;">&#128196;</div>
          <p><strong>Click to choose a file</strong> or drag and drop a CSV here</p>
        </label>
        <input type="file" id="file-input" accept=".csv">
        <div id="preview-slot"></div>
        <div class="actions">
          <button type="button" class="btn btn-secondary" id="back-btn">Back</button>
          <button type="button" class="btn btn-primary" id="next-btn" disabled>Review forecast &rarr;</button>
        </div>
      </div>
    `;

    const dropzone = this.shadowRoot.getElementById("dropzone");
    const fileInput = this.shadowRoot.getElementById("file-input");

    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) this._handleFile(fileInput.files[0]);
    });

    ["dragenter", "dragover"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add("dragging");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragging");
      })
    );
    dropzone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files[0];
      if (file) this._handleFile(file);
    });

    this.shadowRoot.getElementById("sample-btn").addEventListener("click", () => {
      downloadTextFile("superkart_sample_batch.csv", "text/csv", buildSampleBatchCsv());
      showToast("Sample CSV downloaded", "success");
    });

    this.shadowRoot.getElementById("back-btn").addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("wizard-back", { bubbles: true, composed: true }));
    });

    this.shadowRoot.getElementById("next-btn").addEventListener("click", () => {
      if (!this._file) return;
      this.dispatchEvent(new CustomEvent("data-ready", {
        detail: { mode: "batch", file: this._file, preview: this._preview },
        bubbles: true,
        composed: true,
      }));
    });
  }

  async _handleFile(file) {
    const errorSlot = this.shadowRoot.getElementById("error-slot");
    if (!file.name.toLowerCase().endsWith(".csv")) {
      errorSlot.innerHTML = `<div class="error-banner">Please choose a .csv file.</div>`;
      return;
    }

    this._file = file;
    const text = await file.text();
    this._preview = parseCsv(text, 5);

    const missing = FEATURE_COLUMNS.filter((c) => !this._preview.header.includes(c));
    errorSlot.innerHTML = missing.length
      ? `<div class="error-banner">Missing column(s) in this file: ${missing.join(", ")}. The backend will reject this file until they are added.</div>`
      : "";

    const previewSlot = this.shadowRoot.getElementById("preview-slot");
    previewSlot.innerHTML = `
      <div class="file-chip">&#128206; ${file.name} &middot; ${this._preview.totalRows} row(s)</div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${this._preview.header.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
          <tbody>${this._preview.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
    `;

    this.shadowRoot.getElementById("next-btn").disabled = missing.length > 0;
  }
}
customElements.define("step-batch-upload", StepBatchUpload);

// =====================================================================
// <step-review>
// Step 3. Properties: data, submitting, error.
// Fires "wizard-back" and "submit-requested".
// =====================================================================
class StepReview extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._data = null;
    this._submitting = false;
    this._error = null;
  }

  set data(value) {
    this._data = value;
    this._render();
  }

  set submitting(value) {
    this._submitting = value;
    this._render();
  }

  set error(value) {
    this._error = value;
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    if (!this._data) return;
    withSharedStyles(this.shadowRoot);

    const body = this._data.mode === "single"
      ? `
        <dl class="summary">
          ${Object.entries(this._data.display).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}
        </dl>
      `
      : `
        <p>
          <strong>${this._data.file.name}</strong> &middot;
          ${this._data.preview.totalRows} row(s) will be sent for batch forecasting.
        </p>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>${this._data.preview.header.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
            <tbody>${this._data.preview.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
      `;

    this.shadowRoot.innerHTML = `
      <style>
        h2 { margin-top: 0; }
        dl.summary { display: grid; grid-template-columns: max-content 1fr; gap: 8px 24px; margin: 0; }
        dl.summary dt { color: var(--color-text-muted); font-size: 13px; }
        dl.summary dd { margin: 0; font-size: 13px; font-weight: 600; }
        .actions { display: flex; justify-content: space-between; margin-top: var(--space-5); }
      </style>
      <div class="card">
        <h2>Review before submitting</h2>
        ${this._error ? `<div class="error-banner">${this._error}</div>` : ""}
        ${body}
        <div class="actions">
          <button type="button" class="btn btn-secondary" id="back-btn" ${this._submitting ? "disabled" : ""}>Back to edit</button>
          <button type="button" class="btn btn-primary" id="submit-btn" ${this._submitting ? "disabled" : ""}>
            ${this._submitting ? `<span class="spinner"></span> Forecasting...` : "Submit for forecast"}
          </button>
        </div>
      </div>
    `;

    this.shadowRoot.getElementById("back-btn").addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("wizard-back", { bubbles: true, composed: true }));
    });
    this.shadowRoot.getElementById("submit-btn").addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("submit-requested", { bubbles: true, composed: true }));
    });
  }
}
customElements.define("step-review", StepReview);

// =====================================================================
// <step-results>
// Step 4. Property: results, either
//   { mode: "single", singlePrediction }
//   { mode: "batch", batchRows }
// Fires "wizard-restart".
// =====================================================================
class StepResults extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._results = null;
  }

  set results(value) {
    this._results = value;
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    if (!this._results) return;
    withSharedStyles(this.shadowRoot);
    const r = this._results;

    const body = r.mode === "single"
      ? `
        <div class="result-hero">
          <div class="result-label">Predicted total sales revenue</div>
          <div class="result-value">${formatCurrency(r.singlePrediction)}</div>
        </div>
      `
      : `
        <p>Forecasted sales for <strong>${r.batchRows.length}</strong> record(s).</p>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>${Object.keys(r.batchRows[0]).map((h) => `<th>${h}</th>`).join("")}</tr></thead>
            <tbody>${r.batchRows.map((row) => `<tr>${Object.values(row).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
        <button type="button" class="btn btn-secondary" id="download-btn" style="margin-top: var(--space-4);">Download predictions as CSV</button>
      `;

    this.shadowRoot.innerHTML = `
      <style>
        h2 { margin-top: 0; }
        .result-hero { text-align: center; padding: var(--space-6) 0; }
        .result-label { font-size: 13px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: .04em; }
        .result-value { font-size: 40px; font-weight: 800; color: var(--color-success); margin-top: var(--space-2); animation: popIn .4s cubic-bezier(.2, .8, .3, 1.3); }
        .actions { display: flex; justify-content: flex-end; margin-top: var(--space-5); }
      </style>
      <div class="card">
        <h2>Forecast results</h2>
        ${body}
        <div class="actions">
          <button type="button" class="btn btn-primary" id="restart-btn">Start a new forecast</button>
        </div>
      </div>
    `;

    this.shadowRoot.getElementById("restart-btn").addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("wizard-restart", { bubbles: true, composed: true }));
    });

    const downloadBtn = this.shadowRoot.getElementById("download-btn");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        const header = Object.keys(r.batchRows[0]);
        const lines = [header.join(",")].concat(
          r.batchRows.map((row) => header.map((h) => row[h]).join(","))
        );
        downloadTextFile("superkart_predictions.csv", "text/csv", lines.join("\n"));
        showToast("Predictions downloaded", "success");
      });
    }
  }
}
customElements.define("step-results", StepResults);

// =====================================================================
// <history-panel>
// Sidebar shown next to the wizard. Property: items, an array of
// { time, mode, summary, resultSummary }, newest first. Seeded from the
// server on load, then grown locally as new predictions come in during
// the session, avoiding a network round trip on every single submission.
// =====================================================================
class HistoryPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._items = [];
  }

  set items(value) {
    this._items = value || [];
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    withSharedStyles(this.shadowRoot);
    const rows = this._items.length
      ? this._items.map((item) => `
          <li>
            <div class="row-top">
              <span class="badge ${item.mode === "single" ? "badge-success" : "badge-primary"}">${item.mode}</span>
              <span class="time">${item.time}</span>
            </div>
            <div class="summary">${item.summary}</div>
            <div class="result">${item.resultSummary}</div>
          </li>
        `).join("")
      : `<li class="empty">No predictions yet.</li>`;

    this.shadowRoot.innerHTML = `
      <style>
        h3 { margin: 0 0 var(--space-3) 0; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-text-muted); }
        ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); max-height: 480px; overflow: auto; }
        li { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); background: var(--color-surface); transition: box-shadow .15s ease, transform .15s ease; }
        li:not(.empty):hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
        li.empty { color: var(--color-text-muted); font-size: 13px; text-align: center; border-style: dashed; }
        .row-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .time { font-size: 11px; color: var(--color-text-muted); }
        .summary { font-size: 12px; color: var(--color-text-muted); margin-bottom: 4px; }
        .result { font-size: 13px; font-weight: 700; }
        a.view-all { display: block; text-align: center; font-size: 12px; font-weight: 600; color: var(--color-primary); text-decoration: none; margin-top: var(--space-3); }
        a.view-all:hover { text-decoration: underline; }
      </style>
      <div class="card">
        <h3>Recent predictions</h3>
        <ul>${rows}</ul>
        <a class="view-all" href="#/history">View full history &rarr;</a>
      </div>
    `;
  }
}
customElements.define("history-panel", HistoryPanel);

// =====================================================================
// <backend-settings>
// A small header control showing the current backend URL, with an inline
// editor that saves an override to localStorage so it survives a reload.
// =====================================================================
class BackendSettings extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._open = false;
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    withSharedStyles(this.shadowRoot);
    const url = getBackendUrl();
    this.shadowRoot.innerHTML = `
      <style>
        .wrap { position: relative; font-size: 12px; }
        .toggle {
          font: inherit; background: none; border: 1px solid var(--color-border);
          border-radius: 999px; padding: 6px 14px; cursor: pointer; color: var(--color-text-muted);
          transition: border-color .15s ease, color .15s ease;
        }
        .toggle:hover { border-color: var(--color-primary); color: var(--color-primary); }
        .panel {
          position: absolute; right: 0; top: calc(100% + 8px); width: 320px;
          background: var(--color-surface); border: 1px solid var(--color-border);
          border-radius: var(--radius-md); box-shadow: var(--shadow-md); padding: var(--space-4);
          z-index: 20; display: ${this._open ? "block" : "none"};
        }
        .panel .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: var(--space-3); }
      </style>
      <div class="wrap">
        <button type="button" class="toggle" id="toggle-btn">&#9881; Backend: ${url}</button>
        <div class="panel">
          <div class="field">
            <label for="url-input">Flask API base URL</label>
            <input type="text" id="url-input" value="${url}">
          </div>
          <p class="helper-text">
            Use http://127.0.0.1:7860 for a local run without Docker, the published port
            (http://localhost:7860) for a local Docker run, or the forwarded Codespace URL
            for the backend once its port is public.
          </p>
          <div class="actions">
            <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
            <button type="button" class="btn btn-primary" id="save-btn">Save</button>
          </div>
        </div>
      </div>
    `;

    this.shadowRoot.getElementById("toggle-btn").addEventListener("click", () => {
      this._open = !this._open;
      this._render();
    });
    this.shadowRoot.getElementById("cancel-btn").addEventListener("click", () => {
      this._open = false;
      this._render();
    });
    this.shadowRoot.getElementById("save-btn").addEventListener("click", () => {
      const value = this.shadowRoot.getElementById("url-input").value.trim();
      if (value) {
        setBackendUrl(value);
        showToast("Backend URL updated", "success");
      }
      this._open = false;
      this._render();
    });
  }
}
customElements.define("backend-settings", BackendSettings);

// =====================================================================
// <page-history>
// Full history page, GET /v1/history on every visit, with an expandable
// row for the exact parameters behind each prediction and a way to clear
// everything stored on the server.
// =====================================================================
class PageHistory extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._records = [];
    this._loading = true;
    this._error = null;
  }

  connectedCallback() {
    this._render();
    this._load();
  }

  async _load() {
    this._loading = true;
    this._error = null;
    this._render();
    try {
      this._records = await fetchHistory(100);
    } catch (err) {
      this._error = err.message || "Could not reach the backend API.";
    }
    this._loading = false;
    this._render();
  }

  async _clear() {
    if (!window.confirm("Clear all stored prediction history? This cannot be undone.")) return;
    try {
      await clearHistoryOnServer();
      this._records = [];
      showToast("History cleared", "success");
      this.dispatchEvent(new CustomEvent("history-cleared", { bubbles: true, composed: true }));
    } catch (err) {
      showToast(err.message || "Could not clear history.", "danger");
    }
    this._render();
  }

  _render() {
    withSharedStyles(this.shadowRoot);
    const rowsHtml = this._records.length
      ? this._records.map((rec, idx) => `
          <div class="history-row">
            <div class="row-head" data-idx="${idx}">
              <span class="badge ${rec.mode === "single" ? "badge-success" : "badge-primary"}">${rec.mode}</span>
              <span class="summary">${rec.summary}</span>
              <span class="time">${formatTimestamp(rec.createdAt)}</span>
              <span class="chevron">&#9662;</span>
            </div>
            <div class="row-detail" id="detail-${idx}">
              <pre class="code-block">${JSON.stringify({ input: rec.input, result: rec.result }, null, 2)}</pre>
            </div>
          </div>
        `).join("")
      : `<p class="helper-text">No predictions recorded yet. Run a forecast to see it show up here.</p>`;

    this.shadowRoot.innerHTML = `
      <style>
        .page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
        .history-row { border: 1px solid var(--color-border); border-radius: var(--radius-md); margin-bottom: var(--space-3); overflow: hidden; }
        .row-head {
          display: grid; grid-template-columns: auto 1fr auto auto; gap: var(--space-3); align-items: center;
          padding: var(--space-3) var(--space-4); cursor: pointer; background: var(--color-surface);
          transition: background-color .15s ease;
        }
        .row-head:hover { background: var(--color-bg); }
        .summary { font-size: 13px; font-weight: 600; }
        .time { font-size: 12px; color: var(--color-text-muted); }
        .chevron { transition: transform .2s ease; color: var(--color-text-muted); }
        .row-head.open .chevron { transform: rotate(180deg); }
        .row-detail { max-height: 0; overflow: hidden; transition: max-height .25s ease; background: var(--color-bg); }
        .row-detail.open { max-height: 400px; overflow-y: auto; }
        .row-detail pre { margin: 0; border-radius: 0; }
      </style>
      <div class="card page">
        <div class="page-head">
          <div>
            <h2>Prediction history</h2>
            <p class="lead">Every forecast this API has produced, most recent first, stored server side.</p>
          </div>
          <div style="display:flex; gap: var(--space-2);">
            <button type="button" class="btn btn-secondary" id="refresh-btn">&#8635; Refresh</button>
            <button type="button" class="btn btn-danger" id="clear-btn" ${this._records.length ? "" : "disabled"}>Clear history</button>
          </div>
        </div>
        ${this._error ? `<div class="error-banner">${this._error}</div>` : ""}
        ${this._loading ? `<p class="helper-text"><span class="spinner" style="border-top-color: var(--color-primary); border-color: var(--color-border);"></span> Loading...</p>` : rowsHtml}
      </div>
    `;

    this.shadowRoot.getElementById("refresh-btn").addEventListener("click", () => this._load());
    this.shadowRoot.getElementById("clear-btn").addEventListener("click", () => this._clear());
    this.shadowRoot.querySelectorAll(".row-head").forEach((head) => {
      head.addEventListener("click", () => {
        const idx = head.dataset.idx;
        head.classList.toggle("open");
        this.shadowRoot.getElementById(`detail-${idx}`).classList.toggle("open");
      });
    });
  }
}
customElements.define("page-history", PageHistory);

// =====================================================================
// <page-docs>
// Static documentation: how the app works, the API surface, and the
// environment variables that control where the frontend looks for the
// backend. No network calls, this is reference material.
// =====================================================================
class PageDocs extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    withSharedStyles(this.shadowRoot);
    this.shadowRoot.innerHTML = `
      <div class="card page">
        <h2>Documentation</h2>
        <p class="lead">How the forecasting workflow fits together, and the API behind it.</p>

        <h3>The four step workflow</h3>
        <div class="doc-section">
          <p><strong>1. Mode.</strong> Choose Single Product Forecast for one product-store combination, or Batch Upload for a CSV of many.</p>
          <p><strong>2. Data.</strong> Fill in the Product and Store detail sections, or upload and preview a CSV.</p>
          <p><strong>3. Review.</strong> Everything entered is shown back before anything is sent to the API, nothing is submitted by accident.</p>
          <p><strong>4. Results.</strong> The predicted revenue for a single record, or a downloadable table of predictions for a batch.</p>
        </div>

        <h3>Downloading a sample batch file</h3>
        <div class="doc-section">
          <p>The Batch Upload step has a Sample CSV button that downloads a small file in the exact shape the API expects, four rows covering a mix of product and store types. Use it as a starting point, keep the header row exactly as is, and add as many rows as needed.</p>
        </div>

        <h3>API reference</h3>
        <div class="doc-section">
          <p><code class="inline">POST /v1/predict</code>, a single product-store record as a JSON body:</p>
          <pre class="code-block">{
  "Product_Weight": 12.66,
  "Product_Sugar_Content": "Low Sugar",
  "Product_Allocated_Area": 0.03,
  "Product_MRP": 117.08,
  "Store_Size": "Medium",
  "Store_Location_City_Type": "Tier 2",
  "Store_Type": "Supermarket Type2",
  "Product_Id_char": "FD",
  "Store_Age_Years": 16,
  "Product_Type_Category": "Non Perishables"
}</pre>
          <p>Returns <code class="inline">{"Product_Store_Sales_Total_Prediction": &lt;number&gt;}</code>.</p>
        </div>
        <div class="doc-section">
          <p><code class="inline">POST /v1/predictbatch</code>, a multipart CSV upload under the field name <code class="inline">file</code>, same columns as above. Returns a JSON object mapping each row's position to its prediction.</p>
        </div>
        <div class="doc-section">
          <p><code class="inline">GET /v1/history?limit=50</code> returns the most recently recorded predictions. <code class="inline">DELETE /v1/history</code> clears all of them. Both back the History page in this app.</p>
        </div>

        <h3>Pointing the app at a different backend</h3>
        <div class="doc-section">
          <p>The gear icon in the header opens a small panel to change the backend URL at any time, no rebuild needed. This matters most in GitHub Codespaces, where the forwarded URL for the backend's port is only known once that port has been made public.</p>
        </div>

        <h3>Source</h3>
        <div class="doc-section">
          <p>This deployment's code lives at <a href="${REPO_URL}" target="_blank" rel="noopener">${REPO_URL}</a>. The full training notebook, exploratory analysis, and model comparison live in a separate repository, linked from the Model Details section of the Help page.</p>
        </div>
      </div>
    `;
  }
}
customElements.define("page-docs", PageDocs);

// =====================================================================
// <page-help>
// FAQ plus a Model Details section describing how the deployed model was
// built and how well it performs, pulled straight from the training
// notebook's own final evaluation, not restated from memory.
// =====================================================================
class PageHelp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    withSharedStyles(this.shadowRoot);
    this.shadowRoot.innerHTML = `
      <div class="card page">
        <h2>Help</h2>
        <p class="lead">Answers to common questions, and a look under the hood at the model itself.</p>

        <h3>Frequently asked questions</h3>
        <div class="doc-section">
          <p><strong>What does Product Allocated Area mean?</strong><br>
          The share of a store's total display space given to this product, shown here as a percentage. A product taking up 3% of the floor space would be entered as 3.</p>
        </div>
        <div class="doc-section">
          <p><strong>Why did my batch upload get rejected?</strong><br>
          The CSV is missing one or more required columns. The upload screen lists exactly which ones before it lets the file through, download the sample CSV from the Batch Upload step to see the expected header row.</p>
        </div>
        <div class="doc-section">
          <p><strong>I get "Failed to fetch" when I submit a forecast.</strong><br>
          The app cannot reach the backend URL currently configured in the gear icon panel in the header. Check that value against the environment this is running in, see the Docs page for the right value in each case.</p>
        </div>
        <div class="doc-section">
          <p><strong>Where does my prediction history go?</strong><br>
          Every prediction is saved by the backend the moment it is made. The History page in the top navigation shows everything recorded, with the exact inputs behind each one.</p>
        </div>

        <h3>Model details</h3>
        <div class="doc-section">
          <p>The deployed model predicts <code class="inline">Product_Store_Sales_Total</code>, the total revenue a product generates at a store, from product attributes (weight, MRP, sugar content, allocated display area) and store attributes (size, location tier, store type, age).</p>
          <p>Two features are engineered from the raw inputs before the model ever sees them: a broad product category derived from the product identifier, and how perishable a product type is. The app derives these automatically from the Product Type dropdown, nothing extra to fill in.</p>
        </div>
        <div class="doc-section">
          <p><strong>How the final model was chosen.</strong> Six regression model families were trained on the same 8,763 record training dataset, each first at library defaults, then again with hyperparameters tuned by grid search:</p>
          <p>Decision Tree, Bagging, Random Forest, AdaBoost, Gradient Boosting, and XGBoost, twelve candidates in total.</p>
          <p>The data was split 60% train, 20% validation, 20% test. All twelve candidates were ranked on validation set RMSE, the test set was never looked at until a single winner had already been picked, keeping that final number an honest estimate of real world performance rather than one the selection process had already seen.</p>
        </div>
        <div class="doc-section">
          <p><strong>Winner: XGBoost, tuned.</strong> Its performance on the held out test set:</p>
          <div class="metric-grid">
            <div class="metric-tile"><div class="value">283.78</div><div class="label">RMSE</div></div>
            <div class="metric-tile"><div class="value">114.30</div><div class="label">MAE</div></div>
            <div class="metric-tile"><div class="value">0.928</div><div class="label">R-squared</div></div>
            <div class="metric-tile"><div class="value">5.4%</div><div class="label">MAPE</div></div>
          </div>
          <p class="helper-text">R-squared of 0.928 means the model explains about 93% of the variation in product-store sales revenue across the test set. MAPE of 5.4% means a typical prediction is off by about that fraction of the true value.</p>
        </div>
        <div class="doc-section">
          <p><strong>Preprocessing.</strong> Numeric features are standardized (zero mean, unit variance), categorical features are one hot encoded, both wired together in a single scikit-learn pipeline alongside the model itself, saved as one artifact with <code class="inline">joblib</code> and loaded once when the backend starts.</p>
        </div>
        <div class="doc-section">
          <p>The full exploratory analysis, every model's baseline and tuned metrics side by side, and the reasoning behind each preprocessing choice are in the training notebook at
          <a href="${NOTEBOOK_REPO_URL}" target="_blank" rel="noopener">${NOTEBOOK_REPO_URL}</a>.</p>
        </div>
      </div>
    `;
  }
}
customElements.define("page-help", PageHelp);

// =====================================================================
// <page-contact>
// A simple contact card. The email is also exposed as a mailto: link and
// a one click copy button.
// =====================================================================
class PageContact extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    withSharedStyles(this.shadowRoot);
    this.shadowRoot.innerHTML = `
      <style>
        .contact-card {
          display: flex; align-items: center; gap: var(--space-5);
          padding: var(--space-6); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
          background: var(--color-bg);
        }
        .avatar {
          width: 64px; height: 64px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, var(--color-primary), var(--color-success));
          display: flex; align-items: center; justify-content: center;
          font-size: 26px; color: #fff;
        }
        .email-row { display: flex; align-items: center; gap: var(--space-2); margin-top: 6px; }
        .email-row a { color: var(--color-primary-dark); font-weight: 600; text-decoration: none; }
        .email-row a:hover { text-decoration: underline; }
        .copy-btn { font-size: 12px; padding: 4px 10px; }
      </style>
      <div class="card page">
        <h2>Contact</h2>
        <p class="lead">Questions, feedback, or something looks wrong with a forecast, reach out directly.</p>
        <div class="contact-card">
          <div class="avatar">&#9993;</div>
          <div>
            <div style="font-weight: 700; font-size: 15px;">Navdeep Kumar</div>
            <div class="helper-text">Project owner, SuperKart Sales Forecasting</div>
            <div class="email-row">
              <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
              <button type="button" class="btn btn-secondary copy-btn" id="copy-btn">Copy</button>
            </div>
          </div>
        </div>
        <h3>Elsewhere</h3>
        <div class="doc-section">
          <p>Source code and deployment instructions: <a href="${REPO_URL}" target="_blank" rel="noopener">${REPO_URL}</a></p>
        </div>
      </div>
    `;

    this.shadowRoot.getElementById("copy-btn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(CONTACT_EMAIL);
        showToast("Email copied to clipboard", "success");
      } catch {
        showToast("Could not copy automatically, the address is selectable above.", "danger");
      }
    });
  }
}
customElements.define("page-contact", PageContact);

// =====================================================================
// <site-footer>
// Shown at the bottom of every page. Purely presentational.
// =====================================================================
class SiteFooter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    withSharedStyles(this.shadowRoot);
    const year = new Date().getFullYear();
    this.shadowRoot.innerHTML = `
      <style>
        footer {
          margin-top: var(--space-8); padding: var(--space-5) var(--space-6);
          border-top: 1px solid var(--color-border); color: var(--color-text-muted); font-size: 12px;
          display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: center; justify-content: space-between;
        }
        a { color: var(--color-text-muted); text-decoration: none; }
        a:hover { color: var(--color-primary); text-decoration: underline; }
        .links { display: flex; gap: var(--space-4); }
      </style>
      <footer>
        <span>&copy; ${year} SuperKart Sales Forecasting</span>
        <div class="links">
          <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>
          <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
          <a href="#/docs">Docs</a>
          <a href="#/help">Help</a>
        </div>
      </footer>
    `;
  }
}
customElements.define("site-footer", SiteFooter);

// =====================================================================
// <app-shell>
// The controller. Owns the wizard state and the top level route, renders
// exactly one thing into #main-area at a time. All communication with
// step and page elements happens through CustomEvents bubbling up through
// the Shadow DOM (composed: true lets them cross the boundary) or through
// plain property assignment when handing data down.
// =====================================================================
const ROUTES = ["forecast", "history", "docs", "help", "contact"];

class AppShell extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.state = {
      step: 1,
      mode: null,
      singleFormState: null,
      pendingData: null,
      results: null,
      submitting: false,
      submitError: null,
      history: [],
    };
  }

  connectedCallback() {
    this._buildSkeleton();
    this.shadowRoot.addEventListener("mode-selected", (e) => this._onModeSelected(e.detail.mode));
    this.shadowRoot.addEventListener("data-ready", (e) => this._onDataReady(e.detail));
    this.shadowRoot.addEventListener("wizard-back", () => this._goBack());
    this.shadowRoot.addEventListener("submit-requested", () => this._onSubmit());
    this.shadowRoot.addEventListener("wizard-restart", () => this._reset());
    this.shadowRoot.addEventListener("history-cleared", () => {
      this.state.history = [];
    });
    window.addEventListener("hashchange", () => this._renderRoute());
    this._seedHistory();
    this._renderRoute();
  }

  _currentRoute() {
    const raw = (window.location.hash || "").replace(/^#\/?/, "");
    return ROUTES.includes(raw) ? raw : "forecast";
  }

  async _seedHistory() {
    try {
      const records = await fetchHistory(20);
      this.state.history = records.map((rec) => ({
        mode: rec.mode,
        summary: rec.summary,
        resultSummary: rec.mode === "single"
          ? formatCurrency(rec.result.Product_Store_Sales_Total_Prediction)
          : `${Object.keys(rec.result).length} record(s) forecasted`,
        time: formatTimestamp(rec.createdAt),
      }));
      if (this._currentRoute() === "forecast") this._renderStep();
    } catch {
      // No backend reachable yet, the sidebar just starts empty, not fatal
    }
  }

  _buildSkeleton() {
    withSharedStyles(this.shadowRoot);
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        header {
          display: flex; align-items: center; justify-content: space-between; gap: var(--space-5);
          padding: var(--space-4) var(--space-6); background: var(--color-surface);
          border-bottom: 1px solid var(--color-border); flex-wrap: wrap;
        }
        .brand {
          display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 17px;
          text-decoration: none; white-space: nowrap;
        }
        .brand-text {
          background: linear-gradient(90deg, var(--color-primary), var(--color-success), var(--color-primary));
          background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: gradientShift 8s ease infinite;
        }
        @keyframes gradientShift { to { background-position: 200% center; } }
        nav.top-nav { display: flex; gap: var(--space-5); flex-wrap: wrap; }
        nav.top-nav a {
          position: relative; padding: 6px 2px; color: var(--color-text-muted); text-decoration: none;
          font-weight: 600; font-size: 14px; transition: color .15s ease;
        }
        nav.top-nav a::after {
          content: ""; position: absolute; left: 0; bottom: -4px; width: 0; height: 2px;
          background: var(--color-primary); transition: width .2s ease;
        }
        nav.top-nav a:hover, nav.top-nav a.active { color: var(--color-text); }
        nav.top-nav a:hover::after, nav.top-nav a.active::after { width: 100%; }
        .header-actions { display: flex; align-items: center; gap: var(--space-3); }
        .repo-link {
          display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600;
          color: var(--color-text-muted); text-decoration: none; border: 1px solid var(--color-border);
          border-radius: 999px; padding: 6px 14px; transition: border-color .15s ease, color .15s ease;
        }
        .repo-link:hover { border-color: var(--color-primary); color: var(--color-primary); }
        main { max-width: 1100px; margin: 0 auto; padding: var(--space-6); }
        .wizard-grid {
          display: grid; grid-template-columns: 1fr 300px; gap: var(--space-6); align-items: start;
        }
        @media (max-width: 860px) { .wizard-grid { grid-template-columns: 1fr; } }
        .indicator-row { display: flex; justify-content: center; margin-bottom: var(--space-6); }
        .page-area { max-width: 820px; margin: 0 auto; }
      </style>
      <header>
        <a class="brand" href="#/forecast"><span>&#128722;</span><span class="brand-text">SuperKart Sales Forecasting</span></a>
        <nav class="top-nav">
          <a href="#/forecast" data-route="forecast">Forecast</a>
          <a href="#/history" data-route="history">History</a>
          <a href="#/docs" data-route="docs">Docs</a>
          <a href="#/help" data-route="help">Help</a>
          <a href="#/contact" data-route="contact">Contact</a>
        </nav>
        <div class="header-actions">
          <a class="repo-link" href="${REPO_URL}" target="_blank" rel="noopener">&#9733; GitHub</a>
          <backend-settings></backend-settings>
        </div>
      </header>
      <main id="main-area"></main>
      <site-footer></site-footer>
    `;
    this._navLinks = this.shadowRoot.querySelectorAll("nav.top-nav a");
    this._mainArea = this.shadowRoot.getElementById("main-area");
  }

  _renderRoute() {
    const route = this._currentRoute();
    this._navLinks.forEach((a) => a.classList.toggle("active", a.dataset.route === route));

    if (route === "forecast") {
      this._mainArea.innerHTML = `
        <div class="wizard-grid">
          <div>
            <div class="indicator-row"><step-indicator current="1"></step-indicator></div>
            <div id="content"></div>
          </div>
          <history-panel></history-panel>
        </div>
      `;
      this._stepIndicator = this._mainArea.querySelector("step-indicator");
      this._historyPanel = this._mainArea.querySelector("history-panel");
      this._content = this._mainArea.querySelector("#content");
      this._renderStep();
      return;
    }

    const tagByRoute = { history: "page-history", docs: "page-docs", help: "page-help", contact: "page-contact" };
    this._mainArea.innerHTML = `<div class="page-area"></div>`;
    const pageEl = document.createElement(tagByRoute[route]);
    this._mainArea.querySelector(".page-area").appendChild(pageEl);
    animateIn(this._mainArea);
  }

  _renderStep() {
    this._stepIndicator.setAttribute("current", String(this.state.step));
    this._historyPanel.items = this.state.history;
    this._content.innerHTML = "";

    let el;
    if (this.state.step === 1) {
      el = document.createElement("step-mode-select");
    } else if (this.state.step === 2) {
      el = document.createElement(this.state.mode === "single" ? "step-single-form" : "step-batch-upload");
      if (this.state.mode === "single" && this.state.singleFormState) {
        el.initialData = this.state.singleFormState;
      }
    } else if (this.state.step === 3) {
      el = document.createElement("step-review");
      el.data = this.state.pendingData;
      el.submitting = this.state.submitting;
      el.error = this.state.submitError;
    } else {
      el = document.createElement("step-results");
      el.results = this.state.results;
    }
    this._content.appendChild(el);
    animateIn(this._content);
  }

  _onModeSelected(mode) {
    this.state.mode = mode;
    this.state.step = 2;
    this._renderStep();
  }

  _onDataReady(detail) {
    this.state.pendingData = detail;
    if (detail.mode === "single") this.state.singleFormState = detail.formState;
    this.state.submitError = null;
    this.state.step = 3;
    this._renderStep();
  }

  _goBack() {
    if (this.state.step > 1) {
      this.state.step -= 1;
      this.state.submitError = null;
      this._renderStep();
    }
  }

  async _onSubmit() {
    this.state.submitting = true;
    this.state.submitError = null;
    this._renderStep();

    try {
      const data = this.state.pendingData;
      if (data.mode === "single") {
        const result = await predictSingle(data.payload);
        const prediction = result.Product_Store_Sales_Total_Prediction;
        this.state.results = { mode: "single", singlePrediction: prediction };
        this._pushHistory({
          mode: "single",
          summary: `${data.display["Product Type"]} at a ${data.display["Store Size"]} store`,
          resultSummary: formatCurrency(prediction),
        });
        showToast("Forecast complete", "success");
      } else {
        const predictions = await predictBatch(data.file);
        const text = await data.file.text();
        const full = parseCsv(text);
        const batchRows = full.rows.map((row, idx) => {
          const obj = {};
          full.header.forEach((h, i) => { obj[h] = row[i]; });
          obj["Predicted_Product_Store_Sales_Total"] = predictions[String(idx)];
          return obj;
        });
        this.state.results = { mode: "batch", batchRows };
        this._pushHistory({
          mode: "batch",
          summary: data.file.name,
          resultSummary: `${batchRows.length} record(s) forecasted`,
        });
        showToast("Batch forecast complete", "success");
      }
      this.state.submitting = false;
      this.state.step = 4;
    } catch (err) {
      this.state.submitting = false;
      this.state.submitError = err.message || "Could not reach the backend API.";
      showToast("Forecast failed", "danger");
    }
    this._renderStep();
  }

  _pushHistory(entry) {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    this.state.history = [{ ...entry, time }, ...this.state.history].slice(0, 20);
  }

  _reset() {
    this.state = {
      step: 1,
      mode: null,
      singleFormState: null,
      pendingData: null,
      results: null,
      submitting: false,
      submitError: null,
      history: this.state.history,
    };
    this._renderStep();
  }
}
customElements.define("app-shell", AppShell);
