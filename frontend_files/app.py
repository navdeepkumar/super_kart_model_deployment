"""
Streamlit frontend for the SuperKart sales forecasting solution.

Collects plain business inputs from the user, derives the engineered features
the backend model expects (Product_Id_char, Store_Age_Years,
Product_Type_Category), and calls the Flask backend for:
  - Online inference (a single product-store record)
  - Batch inference (a CSV file of multiple records)
"""

import os

import pandas as pd
import requests
import streamlit as st

st.set_page_config(page_title="SuperKart Sales Forecast", page_icon=":shopping_trolley:", layout="centered")

# ---------------------------------------------------------------------------
# Reference data used to derive engineered features from plain user inputs.
# Kept in sync with the feature engineering step in the training notebook.
# ---------------------------------------------------------------------------
CURRENT_YEAR = 2025  # reference year used for Store_Age_Years at training time

PRODUCT_TYPE_TO_ID_CHAR = {
    "Baking Goods": "FD", "Breads": "FD", "Breakfast": "FD", "Canned": "FD",
    "Dairy": "FD", "Frozen Foods": "FD", "Fruits and Vegetables": "FD",
    "Meat": "FD", "Seafood": "FD", "Snack Foods": "FD", "Starchy Foods": "FD",
    "Hard Drinks": "DR", "Soft Drinks": "DR",
    "Health and Hygiene": "NC", "Household": "NC", "Others": "NC",
}
PERISHABLE_TYPES = {"Dairy", "Meat", "Fruits and Vegetables", "Breads", "Breakfast", "Seafood"}

PRODUCT_TYPES = sorted(PRODUCT_TYPE_TO_ID_CHAR.keys())
SUGAR_CONTENT_OPTIONS = ["Low Sugar", "Regular", "No Sugar"]
STORE_SIZE_OPTIONS = ["Small", "Medium", "High"]
CITY_TIER_OPTIONS = ["Tier 1", "Tier 2", "Tier 3"]
STORE_TYPE_OPTIONS = ["Food Mart", "Supermarket Type1", "Supermarket Type2", "Departmental Store"]

FEATURE_COLUMNS = [
    "Product_Weight", "Product_Sugar_Content", "Product_Allocated_Area", "Product_MRP",
    "Store_Size", "Store_Location_City_Type", "Store_Type", "Product_Id_char",
    "Store_Age_Years", "Product_Type_Category",
]


def derive_engineered_features(product_type: str, store_establishment_year: int) -> dict:
    """Maps plain business inputs to the engineered features the backend expects."""
    return {
        "Product_Id_char": PRODUCT_TYPE_TO_ID_CHAR[product_type],
        "Store_Age_Years": CURRENT_YEAR - store_establishment_year,
        "Product_Type_Category": "Perishables" if product_type in PERISHABLE_TYPES else "Non Perishables",
    }


# ---------------------------------------------------------------------------
# Sidebar: backend connection settings
# ---------------------------------------------------------------------------
st.sidebar.header("Backend connection")
# BACKEND_URL can be set at container or process start. Defaults to the
# Docker network hostname used when both containers run on the same network.
# Override with "http://127.0.0.1:7860" for a local, non-Docker run.
default_backend_url = os.environ.get("BACKEND_URL", "http://superkart-backend:7860")
backend_url = st.sidebar.text_input("Flask API base URL", value=default_backend_url).rstrip("/")
st.sidebar.caption(
    "Defaults to the BACKEND_URL environment variable if set. Use the Docker network "
    "hostname (http://superkart-backend:7860) when both containers share a network, "
    "http://127.0.0.1:7860 for a local run, or the forwarded Codespace URL from outside."
)

st.title(":shopping_trolley: SuperKart Sales Forecasting")
st.write(
    "Forecast the expected total sales revenue of a product at a given SuperKart outlet "
    "for the upcoming quarter."
)

tab_single, tab_batch = st.tabs([":small_blue_diamond: Single Prediction", ":package: Batch Prediction"])

# ---------------------------------------------------------------------------
# Tab 1: online inference, single record
# ---------------------------------------------------------------------------
with tab_single:
    st.subheader("Enter product and store details")

    col1, col2 = st.columns(2)
    with col1:
        product_type = st.selectbox("Product Type", PRODUCT_TYPES, index=PRODUCT_TYPES.index("Dairy"))
        product_weight = st.number_input("Product Weight", min_value=0.0, value=12.66, step=0.01)
        product_sugar_content = st.selectbox("Product Sugar Content", SUGAR_CONTENT_OPTIONS)
        product_allocated_area = st.number_input(
            "Product Allocated Area (fraction of total store display area)",
            min_value=0.0, max_value=1.0, value=0.03, step=0.001, format="%.3f",
        )
        product_mrp = st.number_input("Product MRP", min_value=0.0, value=117.08, step=0.01)
    with col2:
        store_size = st.selectbox("Store Size", STORE_SIZE_OPTIONS, index=1)
        store_location_city_type = st.selectbox("Store Location City Type", CITY_TIER_OPTIONS, index=1)
        store_type = st.selectbox("Store Type", STORE_TYPE_OPTIONS, index=2)
        store_establishment_year = st.number_input(
            "Store Establishment Year", min_value=1980, max_value=CURRENT_YEAR, value=2009, step=1,
        )

    if st.button("Predict Sales", type="primary"):
        engineered = derive_engineered_features(product_type, int(store_establishment_year))
        payload = {
            "Product_Weight": product_weight,
            "Product_Sugar_Content": product_sugar_content,
            "Product_Allocated_Area": product_allocated_area,
            "Product_MRP": product_mrp,
            "Store_Size": store_size,
            "Store_Location_City_Type": store_location_city_type,
            "Store_Type": store_type,
            **engineered,
        }

        with st.spinner("Calling the forecasting API..."):
            try:
                response = requests.post(f"{backend_url}/v1/predict", json=payload, timeout=30)
                response.raise_for_status()
                result = response.json()
                st.success(
                    f"Predicted sales revenue: Rs. {result['Product_Store_Sales_Total_Prediction']:,.2f}"
                )
                with st.expander("Request payload sent to the API"):
                    st.json(payload)
            except requests.exceptions.RequestException as exc:
                st.error(f"Could not reach the backend API: {exc}")

# ---------------------------------------------------------------------------
# Tab 2: batch inference
# ---------------------------------------------------------------------------
with tab_batch:
    st.subheader("Upload a CSV file for batch forecasting")
    st.caption("Required columns: " + ", ".join(FEATURE_COLUMNS))

    uploaded_file = st.file_uploader("Choose a CSV file", type="csv")

    if uploaded_file is not None:
        batch_df = pd.read_csv(uploaded_file)
        st.write("Preview of uploaded data:")
        st.dataframe(batch_df.head())

        if st.button("Run Batch Prediction", type="primary"):
            uploaded_file.seek(0)
            with st.spinner("Calling the forecasting API..."):
                try:
                    files = {"file": ("batch.csv", uploaded_file.getvalue(), "text/csv")}
                    response = requests.post(f"{backend_url}/v1/predictbatch", files=files, timeout=60)
                    response.raise_for_status()
                    predictions = response.json()

                    result_df = batch_df.copy()
                    result_df["Predicted_Product_Store_Sales_Total"] = [
                        predictions[str(i)] for i in range(len(result_df))
                    ]
                    st.success(f"Forecasted sales for {len(result_df)} records.")
                    st.dataframe(result_df)

                    csv_bytes = result_df.to_csv(index=False).encode("utf-8")
                    st.download_button(
                        "Download predictions as CSV",
                        data=csv_bytes,
                        file_name="superkart_predictions.csv",
                        mime="text/csv",
                    )
                except requests.exceptions.RequestException as exc:
                    st.error(f"Could not reach the backend API: {exc}")
