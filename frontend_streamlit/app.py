"""
Streamlit frontend for the SuperKart sales forecasting solution.

A second, parallel UI to the Web Components workflow in frontend_files/.
Both talk to the exact same Flask backend and therefore share the same
server side prediction history, a forecast made from either UI shows up
in both. This one favors a fast, form driven experience built entirely
with Streamlit's own widgets, useful when a plain data science tool is
preferred over the richer workflow app.

Collects plain business inputs from the user, derives the engineered
features the backend model expects (Product_Id_char, Store_Age_Years,
Product_Type_Category), and calls the Flask backend for:
  - Online inference (a single product-store record)
  - Batch inference (a CSV file of multiple records)
  - Prediction history (every forecast recorded server side, by either UI)
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
# Override with "http://127.0.0.1:7860" for a local, non-Docker run, or the
# forwarded Codespace URL when this app is opened from outside the container.
default_backend_url = os.environ.get("BACKEND_URL", "http://superkart-backend:7860")
backend_url = st.sidebar.text_input("Flask API base URL", value=default_backend_url).rstrip("/")
st.sidebar.caption(
    "Defaults to the BACKEND_URL environment variable if set. Use the Docker network "
    "hostname (http://superkart-backend:7860) when both containers share a network, "
    "http://127.0.0.1:7860 for a local run, or the forwarded Codespace URL from outside."
)
st.sidebar.markdown("---")
st.sidebar.caption(
    "This is a second, lightweight UI for the same model. The full workflow app, with "
    "richer navigation and documentation, lives on its own deployed URL. Both read and "
    "write the same prediction history through this backend."
)

st.title(":shopping_trolley: SuperKart Sales Forecasting")
st.write(
    "Forecast the expected total sales revenue of a product at a given SuperKart outlet "
    "for the upcoming quarter."
)

tab_single, tab_batch, tab_history = st.tabs(
    [":small_blue_diamond: Single Prediction", ":package: Batch Prediction", ":clock3: History"]
)

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
        product_allocated_area_percent = st.slider(
            "Product Allocated Area (% of total store display area)",
            min_value=0.0, max_value=100.0, value=3.0, step=0.1,
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
            "Product_Allocated_Area": product_allocated_area_percent / 100,
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

# ---------------------------------------------------------------------------
# Tab 3: prediction history, server side, shared with the other frontend
# ---------------------------------------------------------------------------
with tab_history:
    st.subheader("Prediction history")
    st.caption(
        "Every forecast this API has produced, from either frontend, most recent first, "
        "stored server side. GET /v1/history and DELETE /v1/history back this tab."
    )

    col_refresh, col_clear = st.columns([1, 1])
    with col_refresh:
        st.button(":arrows_counterclockwise: Refresh", key="history_refresh")
    with col_clear:
        if st.button(":wastebasket: Clear history", key="history_clear"):
            try:
                clear_response = requests.delete(f"{backend_url}/v1/history", timeout=15)
                clear_response.raise_for_status()
                st.success("History cleared.")
            except requests.exceptions.RequestException as exc:
                st.error(f"Could not clear history: {exc}")

    try:
        history_response = requests.get(f"{backend_url}/v1/history?limit=50", timeout=15)
        history_response.raise_for_status()
        records = history_response.json().get("predictions", [])

        if not records:
            st.info("No predictions recorded yet. Run a forecast above to see it show up here.")
        else:
            summary_df = pd.DataFrame(
                [
                    {"Mode": rec["mode"], "Summary": rec["summary"], "Created At": rec["createdAt"]}
                    for rec in records
                ]
            )
            st.dataframe(summary_df, use_container_width=True, hide_index=True)

            with st.expander("View the exact input and result behind each record"):
                for rec in records:
                    st.markdown(f"**#{rec['id']} &middot; {rec['mode']} &middot; {rec['createdAt']}**")
                    st.json({"input": rec["input"], "result": rec["result"]})
    except requests.exceptions.RequestException as exc:
        st.error(f"Could not reach the backend API: {exc}")
