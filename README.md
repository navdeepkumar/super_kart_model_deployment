# SuperKart Sales Forecasting: Deployment Package

This repository holds the deployable pieces of the SuperKart sales
forecasting solution: a Flask API serving the trained model, and a Streamlit
app for using it. It does not include the training notebook or the raw
data. Those live in the project's main repository. This one is meant to be
opened directly in a GitHub Codespace (or run locally) and built into two
Docker containers.

## What's in here

```
super_kart_model_deployment/
├── backend_files/
│   ├── app.py                    # Flask API: /v1/predict and /v1/predictbatch
│   ├── requirements.txt
│   ├── Dockerfile
│   └── superkart_model.joblib    # trained pipeline (preprocessing + model)
└── frontend_files/
    ├── app.py                    # Streamlit UI: single + batch prediction
    ├── requirements.txt
    └── Dockerfile
```

The backend loads `superkart_model.joblib` once at startup and exposes it
over HTTP. The frontend collects plain business inputs, derives the handful
of engineered features the model expects, and calls the backend.

## Option 1: Deploy in a GitHub Codespace (recommended)

1. On this repository's GitHub page, click **Code > Codespaces > Create
   codespace on main**. Wait for the Codespace to finish setting up. It
   comes with Docker preinstalled, no extra setup needed.
2. Open a terminal in the Codespace and build both images:
   ```bash
   docker build -t superkart-backend  ./backend_files
   docker build -t superkart-frontend ./frontend_files
   ```
3. Create a shared Docker network so the two containers can reach each
   other by name:
   ```bash
   docker network create superkart-network
   ```
4. Run both containers on that network:
   ```bash
   docker run -d --name superkart-backend  --network superkart-network -p 7860:7860 superkart-backend
   docker run -d --name superkart-frontend --network superkart-network -p 8501:8501 superkart-frontend
   ```
   The frontend's `Dockerfile` already points `BACKEND_URL` at
   `http://superkart-backend:7860`, which resolves correctly because both
   containers share the `superkart-network` network.
5. Open the **Ports** tab in the Codespace, find port `7860`, and set its
   visibility to **Public**. Do the same for port `8501` if you want to
   share the UI, not just the API. Copy the forwarded URL(s) shown there.
6. Use the app:
   - Open the forwarded `8501` URL in a browser for the Streamlit UI.
   - Or call the forwarded `7860` URL directly, for example:
     ```bash
     curl -X POST "<forwarded-7860-url>/v1/predict" \
       -H "Content-Type: application/json" \
       -d '{"Product_Weight": 12.66, "Product_Sugar_Content": "Low Sugar", "Product_Allocated_Area": 0.027, "Product_MRP": 117.08, "Store_Size": "Medium", "Store_Location_City_Type": "Tier 2", "Store_Type": "Supermarket Type2", "Product_Id_char": "FD", "Store_Age_Years": 16, "Product_Type_Category": "Non Perishables"}'
     ```
7. When you are done, stop the Codespace from the Codespaces list on
   GitHub, or it will keep billing against your included usage.

## Option 2: Run with Docker on your own machine

Same four commands as steps 2 to 4 above, run locally instead of inside a
Codespace. Once both containers are up:
- Backend: `http://localhost:7860`
- Frontend: `http://localhost:8501`

## Option 3: Run without Docker at all

```bash
pip install -r backend_files/requirements.txt
pip install -r frontend_files/requirements.txt
```

```bash
# Terminal 1
python backend_files/app.py
# Serves on http://127.0.0.1:7860
```

```bash
# Terminal 2 (Windows PowerShell)
$env:BACKEND_URL = "http://127.0.0.1:7860"
streamlit run frontend_files/app.py

# Terminal 2 (macOS / Linux)
BACKEND_URL="http://127.0.0.1:7860" streamlit run frontend_files/app.py
```

Streamlit opens `http://localhost:8501` in your browser. `BACKEND_URL`
overrides the frontend's Docker-oriented default, which otherwise points at
the hostname `superkart-backend` and would not resolve outside a container.

## API reference

**`POST /v1/predict`**, single record, JSON body:

```json
{
  "Product_Weight": 12.66,
  "Product_Sugar_Content": "Low Sugar",
  "Product_Allocated_Area": 0.027,
  "Product_MRP": 117.08,
  "Store_Size": "Medium",
  "Store_Location_City_Type": "Tier 2",
  "Store_Type": "Supermarket Type2",
  "Product_Id_char": "FD",
  "Store_Age_Years": 16,
  "Product_Type_Category": "Non Perishables"
}
```

Returns `{"Product_Store_Sales_Total_Prediction": <number>}`.

**`POST /v1/predictbatch`**, multipart CSV upload under the field name
`file`, with the same columns as above. Returns a JSON object mapping each
row's position to its prediction.
