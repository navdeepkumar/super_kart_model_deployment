FROM python:3.11-slim

WORKDIR /app

# Dependencies first for better layer caching on rebuilds
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY history_store.py .
COPY superkart_model.joblib .

EXPOSE 7860

# gunicorn instead of the Flask dev server, for a process that can actually
# handle concurrent requests. Deliberately not using --preload: it loads
# app.py, and therefore the XGBoost model, once in the master before
# forking, and XGBoost's own thread pool does not survive a fork cleanly,
# workers built that way can hang on their first prediction. Each worker
# importing app.py independently costs a slightly slower startup, a
# trade worth making for workers that actually respond.
CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "2", "--timeout", "120", "app:superkart_api"]
