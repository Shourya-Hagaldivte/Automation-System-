# Agentic Procurement Automation Platform

A B2B procurement assistant for organizations such as schools, colleges, hospitals, offices, public-sector teams, parks, construction companies and facility-management companies.

The workflow collects detailed purchase requirements, runs AI-assisted supplier and tender matching, compares product prices and company-wise quotes, recommends a supplier/tender, and creates approval plus delivery-tracking details.

## Run the app

### Backend
```bash
cd backend
pip install -r requirements.txt
python app.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Gmail tracking email after approval

The approval page creates a delivery order and tracking details. To send tracking emails automatically through Gmail SMTP, copy `backend/.env.example` to `backend/.env` and set:

```bash
GMAIL_USER=your-gmail-address@gmail.com
GMAIL_APP_PASSWORD=your-gmail-app-password
SMTP_FROM=your-gmail-address@gmail.com
```

Use a Gmail App Password. Without SMTP settings, the app still creates the delivery order and shows a Gmail compose link containing the tracking details.

## Optional live pricing

The catalog contains source-linked demo price snapshots. You can override prices with a live feed by setting:

```bash
RFP_PRICE_FEED_URL=https://your-price-feed.example.com/items.json
# or
RFP_PRICE_FEED_FILE=/absolute/path/to/price-feed.json
```

## Approval and order tracking API

After approval, the frontend calls:

```http
POST /api/place-order
```

The backend also exposes:

```http
POST /api/send-order-email
```

The email endpoint accepts fields such as `companyEmail`, `orderDetails`, `selectedSupplier`, `totalQuote`, `deliveryDays`, `purchaseOrderId`, and `trackingId`. When SMTP/Gmail is not configured, the UI displays a mock sent confirmation and a Gmail compose link for the prepared tracking email.
