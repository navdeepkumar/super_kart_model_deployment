/*
 * SuperKart Sales Forecasting: workflow frontend.
 *
 * A single ES module that defines the whole application as native Web
 * Components (Custom Elements with Shadow DOM). No build step, no bundler,
 * no framework, just what a modern browser already provides. Each piece of
 * the four step wizard is its own custom element, and <app-shell> is the
 * only piece that knows about all four. It owns the wizard state and swaps
 * step elements in and out of the DOM. Every step element only ever talks
 * back to <app-shell> through CustomEvents, it never reaches into its
 * parent or its siblings directly, which keeps each one easy to read,
 * change, and reuse on its own.
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
async function predictSingle(payload) {
  const response = await fetch(`${getBackendUrl()}/v1/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }
  return data;
}

async function predictBatch(file) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  const response = await fetch(`${getBackendUrl()}/v1/predictbatch`, {
    method: "POST",
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }
  return data;
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

// =====================================================================
// Shared stylesheet, adopted by every component below. Buttons, cards,
// form fields, badges, and tables all look consistent this way without
// copying the same rules into nine different Shadow DOM style blocks.
// Constructable stylesheets are built once and reused by reference, which
// is also cheaper than parsing the same CSS text over and over.
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
    transition: background-color .15s ease, border-color .15s ease, opacity .15s ease;
  }
  .btn:disabled { opacity: .55; cursor: not-allowed; }
  .btn-primary { background: var(--color-primary); color: #fff; }
  .btn-primary:hover:not(:disabled) { background: var(--color-primary-dark); }
  .btn-secondary { background: var(--color-surface); color: var(--color-text); border-color: var(--color-border); }
  .btn-secondary:hover:not(:disabled) { background: var(--color-bg); }
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
`);

function withSharedStyles(shadowRoot) {
  shadowRoot.adoptedStyleSheets = [sharedSheet];
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
        }
        .step.done .circle { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .step.active .circle { border-color: var(--color-primary); color: var(--color-primary); }
        .label { font-size: 13px; font-weight: 600; color: var(--color-text-muted); }
        .step.active .label, .step.done .label { color: var(--color-text); }
        .line { width: 40px; height: 2px; background: var(--color-border); margin: 0 10px; }
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
        .option:hover { border-color: var(--color-primary); box-shadow: var(--shadow-md); transform: translateY(-1px); }
        .icon { font-size: 32px; margin-bottom: var(--space-3); }
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
                <label for="area">Product Allocated Area</label>
                <input id="area" type="number" min="0" max="1" step="0.001" value="${d.area ?? 0.03}" required>
                <p class="helper-text">Fraction of the store's total display area this product occupies, 0 to 1</p>
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
  }

  _submit() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const productType = $("productType").value;
    const productWeight = Number($("productWeight").value);
    const sugar = $("sugar").value;
    const area = Number($("area").value);
    const mrp = Number($("mrp").value);
    const storeSize = $("storeSize").value;
    const cityTier = $("cityTier").value;
    const storeType = $("storeType").value;
    const year = Number($("year").value);

    if ([productWeight, area, mrp, year].some((v) => Number.isNaN(v))) {
      this.shadowRoot.getElementById("error-slot").innerHTML =
        `<div class="error-banner">Please fill in every numeric field with a valid number.</div>`;
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
      "Product Allocated Area": area,
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
          margin: var(--space-4) 0;
        }
        .actions { display: flex; justify-content: space-between; margin-top: var(--space-5); }
      </style>
      <div class="card">
        <h2>Upload a CSV for batch forecasting</h2>
        <p class="helper-text">Required columns: ${FEATURE_COLUMNS.join(", ")}</p>
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
          <div class="result-value">Rs. ${r.singlePrediction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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
        .result-value { font-size: 40px; font-weight: 800; color: var(--color-success); margin-top: var(--space-2); }
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
        const blob = new Blob([lines.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "superkart_predictions.csv";
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  }
}
customElements.define("step-results", StepResults);

// =====================================================================
// <history-panel>
// Property: items, an array of { time, mode, summary, resultSummary },
// newest first. Purely a session-scoped, in-memory log, nothing is
// persisted or sent anywhere, it just gives the workflow a sense of place.
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
      : `<li class="empty">No predictions yet this session.</li>`;

    this.shadowRoot.innerHTML = `
      <style>
        h3 { margin: 0 0 var(--space-3) 0; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-text-muted); }
        ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); max-height: 480px; overflow: auto; }
        li { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); background: var(--color-surface); }
        li.empty { color: var(--color-text-muted); font-size: 13px; text-align: center; border-style: dashed; }
        .row-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .time { font-size: 11px; color: var(--color-text-muted); }
        .summary { font-size: 12px; color: var(--color-text-muted); margin-bottom: 4px; }
        .result { font-size: 13px; font-weight: 700; }
      </style>
      <div class="card">
        <h3>Recent predictions</h3>
        <ul>${rows}</ul>
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
      if (value) setBackendUrl(value);
      this._open = false;
      this._render();
    });
  }
}
customElements.define("backend-settings", BackendSettings);

// =====================================================================
// <app-shell>
// The controller. Owns the wizard state and renders exactly one step
// element into #content at a time, based on that state. All communication
// with step elements happens through CustomEvents bubbling up through the
// Shadow DOM (composed: true lets them cross the boundary) or through
// plain property assignment when handing data down.
// =====================================================================
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
    this._renderStep();
  }

  _buildSkeleton() {
    withSharedStyles(this.shadowRoot);
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        header {
          display: flex; align-items: center; justify-content: space-between;
          padding: var(--space-4) var(--space-6); background: var(--color-surface);
          border-bottom: 1px solid var(--color-border);
        }
        .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 17px; }
        main {
          max-width: 1100px; margin: 0 auto; padding: var(--space-6);
          display: grid; grid-template-columns: 1fr 300px; gap: var(--space-6);
          align-items: start;
        }
        @media (max-width: 860px) { main { grid-template-columns: 1fr; } }
        .indicator-row { display: flex; justify-content: center; margin-bottom: var(--space-6); }
      </style>
      <header>
        <div class="brand">&#128722; SuperKart Sales Forecasting</div>
        <backend-settings></backend-settings>
      </header>
      <main>
        <div>
          <div class="indicator-row"><step-indicator current="1"></step-indicator></div>
          <div id="content"></div>
        </div>
        <history-panel></history-panel>
      </main>
    `;
    this._stepIndicator = this.shadowRoot.querySelector("step-indicator");
    this._historyPanel = this.shadowRoot.querySelector("history-panel");
    this._content = this.shadowRoot.getElementById("content");
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
          resultSummary: `Rs. ${prediction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        });
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
      }
      this.state.submitting = false;
      this.state.step = 4;
    } catch (err) {
      this.state.submitting = false;
      this.state.submitError = err.message || "Could not reach the backend API.";
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
