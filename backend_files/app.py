"""
Flask backend for the SuperKart sales forecasting model.

Two endpoints:
  POST /v1/predict       online inference for a single product-store record (JSON body)
  POST /v1/predictbatch  batch inference for a CSV file of records (multipart/form-data)

The serialized pipeline (preprocessing plus trained regressor) loads once at
process start and is reused across requests.
"""

import io
import os

import joblib
import pandas as pd
from flask import Flask, jsonify, request

superkart_api = Flask(__name__)

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "superkart_model.joblib")
model = joblib.load(MODEL_PATH)

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


@superkart_api.get("/")
def home():
    """Health check and a quick pointer to the available endpoints."""
    return jsonify(
        {
            "message": "SuperKart Sales Forecasting API is up and running.",
            "endpoints": ["/v1/predict [POST]", "/v1/predictbatch [POST]"],
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

    return jsonify({"Product_Store_Sales_Total_Prediction": round(float(prediction), 2)})


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
    return jsonify(response)


if __name__ == "__main__":
    # host 0.0.0.0 so the port is reachable from outside the container
    superkart_api.run(host="0.0.0.0", port=7860)
