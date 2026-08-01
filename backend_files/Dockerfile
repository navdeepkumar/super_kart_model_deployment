FROM python:3.11-slim

WORKDIR /app

# Dependencies first for better layer caching on rebuilds
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY superkart_model.joblib .

EXPOSE 7860

# gunicorn instead of the Flask dev server, for a process that can actually
# handle concurrent requests
CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "2", "--timeout", "120", "app:superkart_api"]
