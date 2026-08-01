"""
Flask backend for the SuperKart sales forecasting model.

Four endpoints:
  POST   /v1/predict       online inference for a single product-store record (JSON body)
  POST   /v1/predictbatch  batch inference for a CSV file of records (multipart/form-data)
  GET    /v1/history       the most recently recorded predictions, newest first
  DELETE /v1/history       clears all recorded prediction history

The serialized pipeline (preprocessing plus trained regressor) loads once at
process start and is reused across requests. Every successful prediction,
single or batch, is also recorded to a small SQLite file through
history_store, so a user can revisit what was asked and what came back.
"""

import io
import os

import joblib
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

import history_store

superkart_api = Flask(__name__)

# The frontend is a static site that calls this API directly from the
# browser with fetch(), not through a Python server acting on its behalf,
# so the browser enforces CORS on every request. Wide open here is
# appropriate for this API: there is no session, cookie, or credential to
# protect, every response is either a public prediction or an error.
CORS(superkart_api)

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "superkart_model.joblib")
model = joblib.load(MODEL_PATH)
history_store.init_db()

# Column order the trained pipeline expects. Kept as an explicit list rather
# than inferring it from the model, so a malformed request fails with a clear
# error message instead of a confusing sklearn exception.
FEATURE_COLUMNS = [
    "Product_Weight",
    "Product_Sugar_Content",
    "Product_Allocated_Area",
    "Product_MRP",
    "Store_Size",
    "Store_Location_City_Type",
    "Store_Type",
    "Product_Id_char",
    "Store_Age_Years",
    "Product_Type_Category",
]


def _validate_columns(frame: pd.DataFrame) -> None:
    missing = [c for c in FEATURE_COLUMNS if c not in frame.columns]
    if missing:
        raise ValueError(f"Missing required column(s): {missing}")


def _record_history_safely(mode, summary, input_data, result_data):
    """Persists a prediction, but never lets a storage problem fail the request.

    The caller is waiting on the actual prediction, already computed by the
    time this runs. A full disk or a locked database file should show up in
    the server logs, not as a 500 on an otherwise successful prediction.
    """
    try:
        history_store.record_prediction(mode, summary, input_data, result_data)
    except Exception:
        superkart_api.logger.warning("Failed to record prediction history", exc_info=True)


@superkart_api.get("/")
def home():
    """Health check and a quick pointer to the available endpoints."""
    return jsonify(
        {
            "message": "SuperKart Sales Forecasting API is up and running.",
            "endpoints": [
                "/v1/predict [POST]",
                "/v1/predictbatch [POST]",
                "/v1/history [GET]",
                "/v1/history [DELETE]",
            ],
        }
    )


@superkart_api.post("/v1/predict")
def predict():
    """Predicts total sales for a single product-store record."""
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "Request body must be valid JSON."}), 400

    try:
        record_df = pd.DataFrame([payload])
        _validate_columns(record_df)
        record_df = record_df[FEATURE_COLUMNS]
        prediction = model.predict(record_df)[0]
    except Exception as exc:
        # Catching broadly here on purpose: any bad input (wrong type, unknown
        # category, missing column) should come back as a 400 with a message
        # the caller can act on, not a 500 with a stack trace.
        return jsonify({"error": str(exc)}), 400

    prediction = round(float(prediction), 2)
    summary = (
        f"{payload.get('Product_Type_Category', 'Product')} at a "
        f"{payload.get('Store_Size', '?')} {payload.get('Store_Type', 'store')}"
    )
    _record_history_safely(
        "single", summary, payload, {"Product_Store_Sales_Total_Prediction": prediction}
    )
    return jsonify({"Product_Store_Sales_Total_Prediction": prediction})


@superkart_api.post("/v1/predictbatch")
def predict_batch():
    """Predicts total sales for every row of an uploaded CSV file."""
    if "file" not in request.files:
        return jsonify({"error": "No file part named 'file' found in the request."}), 400

    file = request.files["file"]
    try:
        batch_df = pd.read_csv(io.BytesIO(file.read()))
        _validate_columns(batch_df)
        predictions = model.predict(batch_df[FEATURE_COLUMNS])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

    # Keys are stringified row positions, values are the matching predictions
    response = {str(idx): round(float(pred), 2) for idx, pred in enumerate(predictions)}
    summary = f"{file.filename or 'batch file'}, {len(response)} record(s)"
    _record_history_safely(
        "batch", summary, {"filename": file.filename, "row_count": len(response)}, response
    )
    return jsonify(response)


@superkart_api.get("/v1/history")
def get_history():
    """Returns the most recently recorded predictions, newest first."""
    raw_limit = request.args.get("limit", default="50")
    try:
        limit = int(raw_limit)
        if limit < 1:
            raise ValueError
    except ValueError:
        return jsonify({"error": "limit must be a positive integer."}), 400

    return jsonify({"predictions": history_store.fetch_history(limit)})


@superkart_api.delete("/v1/history")
def delete_history():
    """Clears all recorded prediction history."""
    history_store.clear_history()
    return jsonify({"message": "History cleared."})


if __name__ == "__main__":
    # host 0.0.0.0 so the port is reachable from outside the container
    superkart_api.run(host="0.0.0.0", port=7860)
