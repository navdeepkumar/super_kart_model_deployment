# SuperKart Sales Forecasting: Deployment Package

This repository holds the deployable pieces of the SuperKart sales
forecasting solution: a Flask API serving the trained model, and a Web
Components frontend for using it. It does not include the training
notebook or the raw data. Those live in the project's main repository.
This one is meant to be opened directly in a GitHub Codespace (or run
locally) and built into two Docker containers.

## Live deployment

The app is running right now in a GitHub Codespace, both containers built
from this repository's `main` branch:

- Frontend (start here): https://superkart-deploy-v7r5rgvjx9hpgg6-8501.app.github.dev
- Backend API: https://superkart-deploy-v7r5rgvjx9hpgg6-7860.app.github.dev

The first visit to either link shows a one-time GitHub notice about
accessing a development port, this is normal, click Continue to reach the
app. A Codespace stops itself after a period of inactivity to avoid
burning hours needlessly. If the links above do not respond, the
Codespace has likely gone to sleep and needs restarting from the
[Codespaces list](https://github.com/codespaces), after which these same
URLs work again, they stay tied to this Codespace as long as it is not
deleted.

## What's in here

```
super_kart_model_deployment/
├── backend_files/
│   ├── app.py                    # Flask API: /v1/predict, /v1/predictbatch, /v1/history, CORS enabled
│   ├── history_store.py          # SQLite-backed persistence for prediction history
│   ├── requirements.txt
│   ├── Dockerfile
│   └── superkart_model.joblib    # trained pipeline (preprocessing + model)
└── frontend_files/
    ├── index.html                # entry point
    ├── env.js                    # default backend URL for local, no-Docker use
    ├── src/
    │   ├── tokens.css            # design tokens (colors, spacing, type)
    │   └── app.js                # every custom element: wizard steps, nav pages, <app-shell>, API client
    ├── Dockerfile                # Nginx-based, static files only, no Node build step
    ├── nginx.conf
    └── docker-entrypoint.d/
        └── 40-inject-backend-url.sh   # regenerates env.js from BACKEND_URL at container start
```

The backend loads `superkart_model.joblib` once at startup and exposes it
over HTTP, with CORS enabled since the browser calls it directly. Every
successful prediction is also recorded to a small SQLite file through
`history_store.py`, so it can be reviewed later, not just in the tab that
made it.

The frontend is a small application (native Web Components, no framework,
no build step) built around a four step wizard: pick single or batch,
enter or upload data, review it, see the result. It derives the handful of
engineered features the model expects from plain business inputs, entirely
in the browser, and calls the backend with `fetch()`. A top navigation bar
above the wizard adds four more pages, each addressable directly through
the URL hash:

- **History** (`#/history`): every prediction the backend has produced,
  most recent first, with the exact input parameters behind each one, and
  a way to clear everything stored.
- **Docs** (`#/docs`): the workflow explained end to end, plus the API
  reference below.
- **Help** (`#/help`): frequently asked questions and a Model Details
  section describing how the deployed model was built and how it performs.
- **Contact** (`#/contact`): how to reach the project owner.

The Batch Upload step also has a Sample CSV button, downloading a small
file in the exact shape the API expects.

## The one thing to get right: BACKEND_URL

Because the frontend is now a static site that calls the backend directly
from the browser, `BACKEND_URL` has to be a URL the **browser** can reach,
not a Docker-internal hostname the two containers merely use to find each
other:

| Environment | BACKEND_URL value |
|---|---|
| No Docker | `http://127.0.0.1:7860` (already the default in `env.js`, nothing to set) |
| Docker on your own machine | `http://localhost:7860`, the port published to the host |
| GitHub Codespaces | the forwarded URL for the backend's port 7860, only known once that port is made public |

If the wrong value is used, the app loads fine but every prediction fails
with "Failed to fetch" in the browser. `docker-entrypoint.d/` regenerates
`env.js` from this variable every time the frontend container starts, and
the gear icon in the app's header can also change it at any time from
inside the browser, no rebuild or restart needed, which is what makes the
Codespaces case workable despite the forwarded URL not being known ahead
of time.

## Option 1: Deploy in a GitHub Codespace (recommended)

1. On this repository's GitHub page, click **Code > Codespaces > Create
   codespace on main**. Wait for the Codespace to finish setting up. It
   comes with Docker preinstalled, no extra setup needed.
2. Open a terminal in the Codespace and build both images:
   ```bash
   docker build -t superkart-backend  ./backend_files
   docker build -t superkart-frontend ./frontend_files
   ```
3. Create a shared Docker network and start the backend on it:
   ```bash
   docker network create superkart-network
   docker run -d --name superkart-backend --network superkart-network -p 7860:7860 superkart-backend
   ```
4. Open the **Ports** tab in the Codespace, find port `7860`, set its
   visibility to **Public**, and copy the forwarded URL shown there
   (something like `https://<name>-7860.app.github.dev`).
5. Start the frontend, pointed at that forwarded URL:
   ```bash
   docker run -d --name superkart-frontend --network superkart-network \
     -p 8501:8501 -e BACKEND_URL="<paste the forwarded 7860 URL here>" superkart-frontend
   ```
6. Set port `8501` to **Public** as well and open its forwarded URL in a
   browser to use the app.
7. When you are done, stop the Codespace from the Codespaces list on
   GitHub, or it will keep billing against your included usage.

## Option 2: Run with Docker on your own machine

```bash
docker network create superkart-network
docker build -t superkart-backend  ./backend_files
docker build -t superkart-frontend ./frontend_files

docker run -d --name superkart-backend --network superkart-network -p 7860:7860 superkart-backend
docker run -d --name superkart-frontend --network superkart-network \
  -p 8501:8501 -e BACKEND_URL="http://localhost:7860" superkart-frontend
```

- Backend: `http://localhost:7860`
- Frontend: `http://localhost:8501`

## Option 3: Run without Docker at all

```bash
pip install -r backend_files/requirements.txt
```

```bash
# Terminal 1
python backend_files/app.py
# Serves on http://127.0.0.1:7860
```

```bash
# Terminal 2, a plain static file server is enough for the frontend
cd frontend_files
python -m http.server 8501
```

Open `http://localhost:8501`. `frontend_files/env.js` already defaults to
`http://127.0.0.1:7860`, so this works immediately with nothing else to
configure.

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

**`GET /v1/history?limit=50`** returns the most recently recorded
predictions, newest first, each with its full input and result.
**`DELETE /v1/history`** clears all of them. Both back the History page in
the frontend.

Prediction history lives in `history.db`, a SQLite file created inside the
backend container's own filesystem on first write. Recreating the backend
container starts with empty history, a deliberate, zero-configuration
default rather than a durability guarantee. Mount a volume at the
backend's working directory if history needs to survive that.
