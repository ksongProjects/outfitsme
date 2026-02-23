FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=5000
EXPOSE 5000

CMD ["sh", "-c", "gunicorn --workers 3 --worker-class gthread --threads 4 --bind 0.0.0.0:${PORT:-5000} --timeout 120 run:app"]
