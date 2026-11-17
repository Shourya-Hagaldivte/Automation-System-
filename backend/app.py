from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
from uuid import uuid4
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import os
import json
import re
import smtplib
from urllib.parse import quote
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().with_name(".env"))
    load_dotenv()
except Exception:
    pass

from agents.sales_agent import scrape_rfp_links, download_pdf
from agents.rfp_identification_agent import process_rfps
from utils.pdf_extractor import extract_text_from_pdf
from agents.parser_agent import parse_rfp_from_pdf, parse_rfp_text
from agents.matcher_agent import match_rfp_with_products, save_matching_results
from services.procurement_intelligence import generate_tender_recommendations
from services.rfp_document_service import create_rfp_pdf
from agents.pricing_agent import build_tender_matches, rfp_document_lines
from utils.simple_pdf import build_pdf

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend connection
jobs = {}
notification_history_store = {}


@app.route("/")
def home():
    return jsonify({
        "message": "RFP Agent Backend API",
        "status": "running",
        "endpoints": [
            "/scan-web",
            "/match-products",
            "/job/<job_id>",
            "/identify-rfps",
            "/upload-rfp",
            "/health",
            "/api/products",
            "/api/rfp-summaries",
            "/api/stats",
            "/api/tender-recommendations",
            "/api/tender-matches",
            "/api/generate-rfp",
            "/api/generate-rfp-document",
            "/api/calculate-pricing",
            "/api/place-order",
            "/api/send-order-email",
            "/api/generate-purchase-order",
            "/api/upload-document",
            "/api/extract-document-fields",
            "/api/three-way-match",
            "/api/resend-email",
            "/api/notification-history/<request_id>"
        ]
    })


@app.route("/health")
def health():
    return jsonify({"status": "ok", "message": "Backend server is running"})


@app.post("/scan-web")
def scan_web():
    job_id = str(uuid4())
    jobs[job_id] = {"status": "Scanning website for RFP links..."}

    tender_list_url = request.json.get("url", "http://localhost:3001/tender.html")

    # 1. Scrape PDF links from the webpage
    pdf_links = scrape_rfp_links(tender_list_url)
    jobs[job_id]["pdf_links"] = pdf_links
    jobs[job_id]["status"] = "PDF links found"

    # 2. Download PDF files
    downloaded_files = []
    for i, link in enumerate(pdf_links, start=1):
        file_name = f"rfp_{i}.pdf"
        file_path = download_pdf(link, file_name)
        downloaded_files.append(file_path)

    jobs[job_id]["downloaded_files"] = downloaded_files
    jobs[job_id]["status"] = "PDFs downloaded successfully"

    jobs[job_id]["status"] = "Running Gemini Parser Agent..."

    # 3. Use Gemini to parse the PDF directly
    print(f"\n📄 Parsing PDF: {downloaded_files[0]}")
    structured = parse_rfp_from_pdf(downloaded_files[0])

    # Fallback to text extraction if Gemini fails
    if not structured:
        print("⚠️  Gemini parsing failed, using fallback text extraction...")
        jobs[job_id]["status"] = "Gemini parsing failed, using fallback..."
        raw_text = extract_text_from_pdf(downloaded_files[0])
        jobs[job_id]["raw_text_preview"] = raw_text[:2000]
        structured = parse_rfp_text(raw_text)
    else:
        print("✅ Gemini parsing successful!")
        # Save parsed output to JSON file
        os.makedirs("rfp_summary", exist_ok=True)
        output_file = "rfp_summary/parsed_output.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(structured, f, indent=2, ensure_ascii=False)
        print(f"💾 Saved to {output_file}")
        jobs[job_id]["output_file"] = output_file

    jobs[job_id]["structured_data"] = structured
    jobs[job_id]["status"] = "Structured RFP ready"

    return jsonify({
        "job_id": job_id,
        "message": "RFP processed successfully",
        "structured_data": structured
    })


@app.post("/match-products")
def match_products():
    """
    Match RFP items with products from catalog
    """
    rfp_file = request.json.get("rfp_file", "rfp_summary/parsed_output.json")

    if not os.path.exists(rfp_file):
        return jsonify({"error": f"RFP file not found: {rfp_file}"}), 404

    # Run matcher agent
    matching_results = match_rfp_with_products(rfp_file)

    # Save results
    output_file = save_matching_results(matching_results)

    return jsonify({
        "message": "Product matching completed",
        "output_file": output_file,
        "summary": matching_results.get('summary', {}),
        "matching_results": matching_results
    })


@app.get("/job/<job_id>")
def job_status(job_id):
    return jsonify(jobs.get(job_id, {"error": "job not found"}))


@app.post("/identify-rfps")
def identify_rfps():
    """
    Identify and select best RFP from provided URLs using the identification agent.

    Expected JSON:
    {
        "urls": ["https://example.com/rfps", "https://another-site.com/tenders"]
    }

    Returns:
    {
        "success": true,
        "all_rfps": [...],
        "selected_rfp": {...}
    }
    """
    try:
        data = request.json
        urls = data.get("urls", [])

        if not urls:
            return jsonify({
                "success": False,
                "error": "No URLs provided. Please provide a list of URLs to scan."
            }), 400

        # Call the RFP identification agent
        result = process_rfps(urls)

        return jsonify({
            "success": True,
            "all_rfps": result.get("all_upcoming_rfps", []),
            "selected_rfp": result.get("selected_rfp"),
            "total_found": len(result.get("all_upcoming_rfps", []))
        })

    except Exception as e:
        print(f"[identify-rfps] Request failed: {e}", flush=True)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.post("/upload-rfp")
def upload_rfp():
    """
    Handle RFP file upload from drag-and-drop.

    Expects: multipart/form-data with 'file' field
    """
    try:
        if 'file' not in request.files:
            return jsonify({
                "success": False,
                "error": "No file provided"
            }), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({
                "success": False,
                "error": "No file selected"
            }), 400

        # Save file temporarily
        upload_folder = "uploads"
        os.makedirs(upload_folder, exist_ok=True)

        file_path = os.path.join(upload_folder, file.filename)
        file.save(file_path)

        # Extract text from PDF
        rfp_text = extract_text_from_pdf(file_path)

        return jsonify({
            "success": True,
            "filename": file.filename,
            "text_preview": rfp_text[:1000],
            "file_path": file_path
        })

    except Exception as e:
        print(f"[upload-rfp] Request failed: {e}", flush=True)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.get("/api/products")
def get_products():
    """Get all products from the catalog"""
    try:
        products_file = "data/products.json"
        if os.path.exists(products_file):
            with open(products_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Handle different product JSON structures
                if isinstance(data, dict) and 'polycab_sku_master_list' in data:
                    products = data['polycab_sku_master_list']
                elif isinstance(data, list):
                    products = data
                else:
                    products = []

                return jsonify({
                    "success": True,
                    "products": products,
                    "total": len(products)
                })
        else:
            return jsonify({"success": False, "error": "Products file not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.get("/api/rfp-summaries")
def get_rfp_summaries():
    """Get all RFP summaries"""
    try:
        summaries_dir = "rfp_summary"
        if not os.path.exists(summaries_dir):
            return jsonify({"success": True, "summaries": [], "total": 0})

        summaries = []
        for filename in os.listdir(summaries_dir):
            if filename.endswith('.json'):
                file_path = os.path.join(summaries_dir, filename)
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    summaries.append({
                        "filename": filename,
                        "data": data
                    })

        return jsonify({
            "success": True,
            "summaries": summaries,
            "total": len(summaries)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.get("/api/stats")
def get_stats():
    """Get dashboard statistics"""
    try:
        # Count RFPs in rfp_summary directory
        rfp_summary_dir = "rfp_summary"
        total_rfps = 0
        if os.path.exists(rfp_summary_dir):
            total_rfps = len([f for f in os.listdir(rfp_summary_dir) if f.endswith('.json')])

        # Count products
        products_file = "data/products.json"
        total_products = 0
        if os.path.exists(products_file):
            with open(products_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict) and 'polycab_sku_master_list' in data:
                    total_products = len(data['polycab_sku_master_list'])
                elif isinstance(data, list):
                    total_products = len(data)

        return jsonify({
            "success": True,
            "stats": {
                "totalRFPs": total_rfps,
                "totalProducts": total_products,
                "pendingRFPs": 0,
                "completedRFPs": total_rfps,
                "winRate": 75 if total_rfps > 0 else 0
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500



def _safe_float(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(str(value).replace("₹", "").replace(",", "").strip())
    except (TypeError, ValueError):
        return default


def _format_inr(value):
    amount = round(_safe_float(value, 0.0))
    return f"₹{amount:,}"


def _email_safe(value, fallback="Not specified"):
    value = "" if value is None else str(value).strip()
    return value or fallback


def _lead_days(tender):
    if isinstance(tender, dict):
        lead_text = tender.get("leadTime") or tender.get("deliveryDays") or ""
    else:
        lead_text = tender or ""
    match = re.search(r"\d+", str(lead_text))
    if match:
        return max(1, int(match.group(0)))
    return 14


def _first_supplier_source(tender):
    if not isinstance(tender, dict):
        return "Supplier source as per selected tender"
    for line in tender.get("lines") or []:
        for key in ("supplierName", "supplier", "sourceName", "priceSource"):
            if line.get(key):
                return str(line.get(key))
    return tender.get("website") or tender.get("tenderUrl") or tender.get("catalogueUrl") or "Supplier source as per selected tender"


def _order_lines_text(tender):
    tender_dict = tender if isinstance(tender, dict) else {}
    lines = []
    for index, line in enumerate(tender_dict.get("lines") or [], start=1):
        item_name = line.get("itemName") or line.get("matchedProduct") or "Item"
        product_name = line.get("matchedProduct") or item_name
        quantity = f"{line.get('quantity') or 0} {line.get('unit') or 'units'}".strip()
        unit_price = _format_inr(line.get("unitPrice"))
        total = _format_inr(line.get("totalPrice"))
        source = line.get("productUrl") or line.get("sourceUrl") or line.get("supplierName") or "Supplier source to be confirmed"
        lines.append(
            f"{index}. {product_name} | Requested: {item_name} | Quantity: {quantity} | "
            f"Unit Price: {unit_price} | Total: {total} | Supplier/Source: {source}"
        )
    return "\n".join(lines) if lines else "No item lines were attached."


def _delivery_order_email_subject():
    return "Purchase Order Approved – Delivery and Tracking Details"



def _request_id_from_payload(payload, order=None):
    order = order or payload.get("order") or payload.get("orderDetails") or {}
    req = payload.get("requirements") or {}
    return str(
        payload.get("requestId")
        or order.get("purchaseOrderId")
        or order.get("orderId")
        or req.get("requestId")
        or req.get("title")
        or "default-request"
    )


def _record_notification(request_id, item):
    request_id = str(request_id or "default-request")
    record = {
        "id": item.get("id") or f"notification-{uuid4().hex[:8]}",
        "type": item.get("type") or "Notification",
        "message": item.get("message") or "Notification generated.",
        "recipient": item.get("recipient") or "",
        "timestamp": item.get("timestamp") or datetime.now(timezone.utc).isoformat(),
        "status": item.get("status") or "Sent",
        "reason": item.get("reason") or item.get("error") or "",
    }
    notification_history_store.setdefault(request_id, []).insert(0, record)
    return record


def _line_value(line, *keys, default=""):
    for key in keys:
        if isinstance(line, dict) and line.get(key) not in (None, ""):
            return line.get(key)
    return default


def _purchase_order_lines(payload):
    tender = payload.get("selectedTender") or payload.get("tender") or (payload.get("tenderAnalysis") or {}).get("recommendedTender") or {}
    order = payload.get("order") or payload.get("orderDetails") or {}
    lines = order.get("items") or tender.get("lines") or payload.get("items") or []
    return lines if isinstance(lines, list) else []


def _build_purchase_order_pdf_lines(payload):
    requirements = payload.get("requirements") or {}
    tender = payload.get("selectedTender") or payload.get("tender") or (payload.get("tenderAnalysis") or {}).get("recommendedTender") or {}
    order = payload.get("order") or payload.get("orderDetails") or _build_delivery_order(payload)
    summary = tender.get("summary") or {}
    item_total = _safe_float(summary.get("itemTotal") or summary.get("materialTotal") or order.get("totalQuote"), 0)
    gst = _safe_float(summary.get("gst"), item_total * 0.18 if item_total else 0)
    total = _safe_float(summary.get("grandTotal") or order.get("totalQuote"), item_total + gst)
    lines = [
        "PURCHASE ORDER",
        "",
        f"PO Number: {order.get('purchaseOrderId') or order.get('orderId') or 'PO pending'}",
        f"Approval Status: Approved by business user",
        f"Order Tracking ID: {order.get('trackingId') or order.get('trackingNumber') or 'Tracking pending'}",
        f"Generated On: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "BUYER / COMPANY DETAILS",
        f"Company: {_email_safe(requirements.get('organization') or order.get('buyerOrganization'))}",
        f"Company Email: {_email_safe(requirements.get('companyEmail') or order.get('recipientEmail'))}",
        f"Organization Type: {_email_safe(requirements.get('organizationType'))}",
        f"Project / Requirement: {_email_safe(requirements.get('title') or order.get('projectTitle'))}",
        "",
        "SUPPLIER DETAILS",
        f"Supplier: {_email_safe(tender.get('company') or order.get('supplier'))}",
        f"Tender / Source Ref: {_email_safe(tender.get('tenderRef') or order.get('tenderRef'))}",
        f"Supplier Source: {_email_safe(tender.get('tenderUrl') or tender.get('website') or tender.get('catalogueUrl'))}",
        "",
        "DELIVERY TERMS",
        f"Delivery Address: {_email_safe(requirements.get('deliveryLocation') or order.get('deliveryLocation'))}",
        f"Expected Delivery Date: {_email_safe(order.get('expectedDeliveryDate'))}",
        f"Delivery Timeline: {_email_safe(order.get('deliveryDays'))} days",
        f"Delivery Terms: Supplier to deliver to buyer location with invoice, delivery note and warranty/compliance documents.",
        "",
        "PAYMENT TERMS",
        f"Payment Terms: {_email_safe(requirements.get('commercialTerms'), 'Payment after delivery inspection and document verification')}",
        "",
        "ITEM LIST",
    ]
    for index, line in enumerate(_purchase_order_lines(payload), start=1):
        qty = _safe_float(_line_value(line, 'quantity'), 0)
        unit_price = _safe_float(_line_value(line, 'unitPrice', 'price'), 0)
        line_total = _safe_float(_line_value(line, 'totalPrice', 'total'), qty * unit_price)
        line_gst = line_total * 0.18
        lines.append(f"{index}. {_email_safe(_line_value(line, 'matchedProduct', 'itemName', 'name'), 'Procurement item')}")
        lines.append(f"   Requested Item: {_email_safe(_line_value(line, 'itemName', 'name'))}")
        lines.append(f"   Quantity: {qty:g} {_email_safe(_line_value(line, 'unit'), 'units')}")
        lines.append(f"   Unit Price: {_format_inr(unit_price)}")
        lines.append(f"   GST/Tax Estimate: {_format_inr(line_gst)}")
        lines.append(f"   Line Total: {_format_inr(line_total)}")
        lines.append(f"   Supplier/Source: {_email_safe(_line_value(line, 'supplierName', 'sourceUrl', 'productUrl'), 'Supplier source to be confirmed')}")
    lines.extend([
        "",
        "COMMERCIAL SUMMARY",
        f"Material Total: {_format_inr(item_total)}",
        f"GST / Tax: {_format_inr(gst)}",
        f"Total Amount: {_format_inr(total)}",
        "",
        "SIGNATURE SECTION",
        "Buyer Authorized Signatory: ______________________________",
        "Supplier Authorized Signatory: ____________________________",
        "Date: ______________________",
        "",
        "Note: This purchase order was generated after automated supplier discovery and final business approval.",
    ])
    return lines


def _mock_extract_fields(filename='', document_type='', order=None, tender=None):
    order = order or {}
    tender = tender or {}
    lines = order.get('items') or tender.get('lines') or []
    first = lines[0] if lines else {}
    total = _safe_float(order.get('totalQuote') or (tender.get('summary') or {}).get('grandTotal'), 0)
    qty = _safe_float(first.get('quantity'), 0)
    unit_price = _safe_float(first.get('unitPrice'), 0)
    line_total = _safe_float(first.get('totalPrice'), qty * unit_price)
    doc_type = str(document_type or '').lower()
    return {
        'supplierName': order.get('supplier') or tender.get('company') or 'Selected supplier',
        'itemName': first.get('matchedProduct') or first.get('itemName') or 'Procurement item',
        'price': unit_price,
        'quantity': qty,
        'gstTax': round(line_total * 0.18, 2),
        'totalAmount': total or line_total,
        'deliveryDate': order.get('expectedDeliveryDate') or 'To be confirmed',
        'deliveryAddress': order.get('deliveryLocation') or 'Delivery address not specified',
        'warranty': 'Standard supplier warranty to be confirmed',
        'termsAndConditions': 'Payment after verification unless otherwise specified',
        'complianceDetails': 'GST invoice and delivery documentation required',
        'documentType': document_type or 'Uploaded document',
        'documentName': filename,
        'extractionMode': 'mock' if doc_type else 'mock',
        'reviewRequired': True,
    }


def _compare_amounts(label, po_value, other_value, tolerance=1.0):
    po = _safe_float(po_value, 0)
    other = _safe_float(other_value, 0)
    if abs(po - other) <= tolerance:
        return {'field': label, 'status': 'Matched', 'message': f'{label} matches.'}
    return {'field': label, 'status': f'{label} mismatch', 'message': f'Mismatch detected: PO {label.lower()} is {_format_inr(po)}, but document {label.lower()} is {_format_inr(other)}.'}


def _three_way_match_result(payload):
    po = payload.get('purchaseOrder') or payload.get('order') or {}
    tender = payload.get('selectedTender') or payload.get('tender') or {}
    invoice = payload.get('invoice') or payload.get('supplierInvoice') or {}
    delivery = payload.get('deliveryNote') or payload.get('deliveryReceipt') or {}
    if not invoice:
        return {'status': 'Invoice missing', 'paymentApproval': False, 'checks': [{'field': 'Invoice', 'status': 'Invoice missing', 'message': 'Supplier invoice has not been uploaded or extracted.'}]}
    if not delivery:
        return {'status': 'Delivery receipt missing', 'paymentApproval': False, 'checks': [{'field': 'Delivery receipt', 'status': 'Delivery receipt missing', 'message': 'Delivery note / receipt has not been uploaded or extracted.'}]}
    lines = po.get('items') or tender.get('lines') or []
    first = lines[0] if lines else {}
    checks = []
    po_supplier = str(po.get('supplier') or tender.get('company') or '').strip().lower()
    invoice_supplier = str(invoice.get('supplierName') or '').strip().lower()
    checks.append({'field': 'Supplier name', 'status': 'Matched' if po_supplier and po_supplier == invoice_supplier else 'Supplier mismatch', 'message': 'Supplier matches.' if po_supplier and po_supplier == invoice_supplier else f"Supplier mismatch: PO supplier is {po.get('supplier') or tender.get('company')}, invoice supplier is {invoice.get('supplierName') or 'missing'}."})
    po_qty = _safe_float(first.get('quantity'), 0)
    delivered_qty = _safe_float(delivery.get('quantity'), 0)
    checks.append({'field': 'Quantity', 'status': 'Matched' if po_qty == delivered_qty else 'Quantity mismatch', 'message': 'Quantity matches.' if po_qty == delivered_qty else f'Mismatch detected: PO quantity is {po_qty:g}, but delivered quantity is {delivered_qty:g}.'})
    checks.append(_compare_amounts('Unit price', first.get('unitPrice'), invoice.get('price')))
    checks.append(_compare_amounts('GST/tax', _safe_float(first.get('totalPrice'), 0) * 0.18, invoice.get('gstTax')))
    checks.append(_compare_amounts('Total amount', po.get('totalQuote') or (tender.get('summary') or {}).get('grandTotal'), invoice.get('totalAmount'), tolerance=5.0))
    po_address = str(po.get('deliveryLocation') or '').strip().lower()
    delivery_address = str(delivery.get('deliveryAddress') or '').strip().lower()
    checks.append({'field': 'Delivery address', 'status': 'Matched' if po_address and po_address == delivery_address else 'Delivery address mismatch', 'message': 'Delivery address matches.' if po_address and po_address == delivery_address else 'Delivery address requires review.'})
    mismatch = next((check for check in checks if check.get('status') != 'Matched'), None)
    return {'status': 'Matched: Payment can be approved' if not mismatch else mismatch.get('status'), 'paymentApproval': not bool(mismatch), 'checks': checks}


def _build_delivery_order(payload):
    requirements = payload.get("requirements") or {}
    tender = payload.get("selectedTender") or payload.get("tender") or (payload.get("tenderAnalysis") or {}).get("recommendedTender") or {}
    now = datetime.now(timezone.utc)
    delivery_days = _lead_days(tender)
    dispatch_date = now + timedelta(days=2)
    delivery_date = now + timedelta(days=delivery_days)
    po_number = str(abs(hash(f"{requirements.get('organization','')}-{tender.get('tenderRef','')}-{now.isoformat()}")))[:4].zfill(4)
    order_id = f"PO-{now.year}-{po_number}"
    tracking_number = f"TRK-IND-{str(uuid4()).replace('-', '')[:6].upper()}"
    tracking_url = f"https://track.aftership.com/{tracking_number}"
    lines = tender.get("lines") or []
    category = ", ".join(sorted({str(line.get("category") or line.get("itemName") or "Product") for line in lines if line}))[:120] or "Procurement products"
    total_quantity = sum(_safe_float(line.get("quantity"), 0.0) for line in lines)
    status_steps = [
        {"step": "Purchase Order Approved", "status": "completed", "date": now.date().isoformat()},
        {"step": "Order Placed with Supplier", "status": "completed", "date": now.date().isoformat()},
        {"step": "Delivery Scheduled", "status": "completed", "date": dispatch_date.date().isoformat()},
        {"step": "Tracking Details Generated", "status": "completed", "date": now.date().isoformat()},
        {"step": "Confirmation Email Sent", "status": "pending", "date": now.date().isoformat()},
        {"step": "Delivery and Handover", "status": "pending", "date": delivery_date.date().isoformat()},
    ]
    return {
        "orderId": order_id,
        "purchaseOrderId": order_id,
        "trackingNumber": tracking_number,
        "trackingId": tracking_number,
        "trackingUrl": tracking_url,
        "status": "Order placed and delivery scheduled",
        "currentStatus": "Order placed and delivery scheduled",
        "supplier": tender.get("company") or "Selected supplier",
        "tenderRef": tender.get("tenderRef") or tender.get("id") or order_id,
        "productCategory": category,
        "totalQuantity": round(total_quantity, 2),
        "totalQuote": _safe_float((tender.get("summary") or {}).get("grandTotal"), 0.0),
        "approvalDate": now.date().isoformat(),
        "dispatchDate": dispatch_date.date().isoformat(),
        "expectedDeliveryDate": delivery_date.date().isoformat(),
        "deliveryDays": delivery_days,
        "deliveryLocation": requirements.get("deliveryLocation") or "Delivery location not specified",
        "recipientEmail": requirements.get("companyEmail") or payload.get("toEmail") or payload.get("companyEmail") or "",
        "contactEmail": requirements.get("companyEmail") or payload.get("toEmail") or payload.get("companyEmail") or "",
        "buyerOrganization": requirements.get("organization") or "Buyer organization",
        "projectTitle": requirements.get("title") or "Procurement delivery order",
        "items": lines,
        "statusSteps": status_steps,
        "timeline": status_steps,
    }


ORDER_EMAIL_SUBJECT = "Purchase Order Approved – Delivery and Tracking Details"
EMAIL_FAILURE_MESSAGE = "Order approved, but email notification failed. Please check email configuration."


def _valid_email(value):
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", str(value or "").strip()))


def _first_present(*values, default=""):
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
        if value not in (None, "", [], {}):
            return value
    return default


def _supplier_source_from_tender(tender, lines):
    tender_dict = tender if isinstance(tender, dict) else {}
    for key in ("tenderUrl", "catalogueUrl", "website", "sourceUrl", "productUrl"):
        if tender_dict.get(key):
            return tender_dict.get(key)
    for line in lines or []:
        if not isinstance(line, dict):
            continue
        for key in ("sourceUrl", "productUrl"):
            if line.get(key):
                return line.get(key)
    return "Supplier source to be confirmed"


def _normalise_order_item(line):
    quantity = _safe_float(line.get("quantity"), 0.0)
    unit_price = _safe_float(line.get("unitPrice") or line.get("price") or line.get("unit_price"), 0.0)
    line_total = _safe_float(line.get("totalPrice") or line.get("total") or (unit_price * quantity), 0.0)
    return {
        "itemName": line.get("itemName") or line.get("name") or line.get("productName") or line.get("matchedProduct") or "Procurement item",
        "matchedProduct": line.get("matchedProduct") or line.get("productName") or line.get("name") or line.get("itemName") or "Selected product",
        "quantity": quantity,
        "unit": line.get("unit") or "units",
        "unitPrice": unit_price,
        "totalPrice": line_total,
        "supplierName": line.get("supplierName") or line.get("supplier") or "Selected supplier",
        "sourceUrl": line.get("sourceUrl") or line.get("productUrl") or line.get("url") or "",
    }


def _normalise_email_details(payload, order=None):
    payload = payload or {}
    requirements = payload.get("requirements") or {}
    order = order or payload.get("order") or payload.get("orderDetails") or {}
    if not isinstance(order, dict):
        order = {}
    raw_tender = payload.get("selectedTender") or payload.get("tender") or (payload.get("tenderAnalysis") or {}).get("recommendedTender") or {}
    tender = raw_tender if isinstance(raw_tender, dict) else {"tenderRef": str(raw_tender)}

    selected_supplier = payload.get("selectedSupplier") or order.get("supplier") or tender.get("company") or "Selected supplier"
    if isinstance(selected_supplier, dict):
        selected_supplier = selected_supplier.get("company") or selected_supplier.get("name") or "Selected supplier"

    selected_tender = payload.get("selectedTender") or payload.get("selectedTenderName") or order.get("tenderRef") or tender.get("tenderRef") or tender.get("id") or "Selected tender"
    if isinstance(selected_tender, dict):
        selected_tender = selected_tender.get("tenderRef") or selected_tender.get("id") or selected_tender.get("company") or "Selected tender"

    lines = payload.get("items") or order.get("items") or tender.get("lines") or []
    items = [_normalise_order_item(line) for line in lines]
    total_amount = _first_present(payload.get("totalAmount"), order.get("totalQuote"), (tender.get("summary") or {}).get("grandTotal"), default=0)
    delivery_days = _first_present(payload.get("deliveryDays"), order.get("deliveryDays"), _lead_days(tender), default="To be confirmed")
    company_email = _first_present(payload.get("companyEmail"), payload.get("recipient"), order.get("recipientEmail"), order.get("contactEmail"), requirements.get("companyEmail"), requirements.get("email"), default="")
    supplier_source = _first_present(payload.get("supplierContact"), payload.get("supplierSource"), order.get("trackingUrl"), _supplier_source_from_tender(tender, items), default="Supplier source to be confirmed")

    selected_products = ", ".join([item.get("matchedProduct") or item.get("itemName") for item in items[:5] if item.get("matchedProduct") or item.get("itemName")]) or "Selected procurement items"

    return {
        "companyEmail": str(company_email or "").strip(),
        "companyName": _first_present(payload.get("companyName"), requirements.get("organization"), order.get("buyerOrganization"), default="Buyer organization"),
        "projectName": _first_present(payload.get("projectName"), requirements.get("title"), order.get("projectTitle"), requirements.get("productCategory"), default="Procurement requirement"),
        "selectedSupplier": selected_supplier,
        "selectedTender": selected_tender,
        "selectedProducts": selected_products,
        "items": items,
        "totalAmount": _safe_float(total_amount, 0.0),
        "purchaseOrderId": _first_present(payload.get("purchaseOrderId"), order.get("purchaseOrderId"), order.get("orderId"), default="PO pending"),
        "trackingId": _first_present(payload.get("trackingId"), order.get("trackingId"), order.get("trackingNumber"), default="Tracking pending"),
        "deliveryAddress": _first_present(payload.get("deliveryAddress"), requirements.get("deliveryLocation"), order.get("deliveryLocation"), default="Delivery address not specified"),
        "deliveryDays": delivery_days,
        "expectedDeliveryDate": _first_present(payload.get("expectedDeliveryDate"), order.get("expectedDeliveryDate"), order.get("estimatedDeliveryDate"), default="To be confirmed"),
        "currentStatus": _first_present(payload.get("currentStatus"), order.get("currentStatus"), order.get("status"), default="Order placed and delivery scheduled"),
        "supplierContact": supplier_source,
        "approvalStatus": _first_present(payload.get("approvalStatus"), order.get("approvalStatus"), default="Approved by business user"),
    }


def _build_order_email(payload, order=None):
    details = _normalise_email_details(payload, order)
    item_lines = []
    for item in details["items"]:
        item_lines.append(
            f"{item['itemName']} | Quantity: {item['quantity']:g} {item['unit']} | "
            f"Unit Price: {_format_inr(item['unitPrice'])} | Total: {_format_inr(item['totalPrice'])} | "
            f"Product/Source: {item['matchedProduct']} {('- ' + item['sourceUrl']) if item['sourceUrl'] else ''}"
        )
    if not item_lines:
        item_lines.append("Item details will be confirmed from the approved purchase order.")
    delivery_timeline = str(details['deliveryDays']).strip() or "To be confirmed"
    if delivery_timeline.lower() != "to be confirmed" and not delivery_timeline.lower().endswith("days"):
        delivery_timeline = f"{delivery_timeline} days"

    body = f"""Dear Team,

Your procurement request has been approved successfully.

Order Summary:
Company Name: {details['companyName']}
Project/Requirement: {details['projectName']}
Selected Supplier: {details['selectedSupplier']}
Selected Tender: {details['selectedTender']}
Selected Product/Items: {details['selectedProducts']}
Total Quote Amount: {_format_inr(details['totalAmount'])}

Delivery Details:
Purchase Order ID: {details['purchaseOrderId']}
Tracking ID: {details['trackingId']}
Current Order Status: {details['currentStatus']}
Expected Delivery Timeline: {delivery_timeline}
Expected Delivery Date: {details['expectedDeliveryDate']}
Delivery Address: {details['deliveryAddress']}
Supplier Contact / Source: {details['supplierContact']}
Approval Status: {details['approvalStatus']}

Item Details:
{chr(10).join(item_lines)}

Next Steps:
The supplier has received the approved purchase order. Delivery tracking has been generated, and the order status will be updated as the delivery progresses.

Thank you,
Agentic Procurement Platform
"""
    return ORDER_EMAIL_SUBJECT, body, details


def _gmail_compose_url(recipient, subject, body):
    return (
        "https://mail.google.com/mail/?view=cm&fs=1"
        f"&to={quote(recipient or '')}"
        f"&su={quote(subject or '')}"
        f"&body={quote(body or '')}"
    )


def _send_delivery_order_email(to_email, subject, body):
    recipient = str(to_email or "").strip()
    compose_url = _gmail_compose_url(recipient, subject, body) if recipient else ""
    print(f"[order-email] Preparing order email. recipient={recipient or 'missing'}", flush=True)
    if not _valid_email(recipient):
        print("[order-email] Failed before SMTP: missing or invalid recipient email.", flush=True)
        return {
            "status": "failed",
            "mode": "missing-email",
            "message": "Company email is missing or invalid. Add a valid company email in the requirement form.",
            "gmailComposeUrl": "",
            "preview": body,
        }

    smtp_user = os.getenv("EMAIL_USER") or os.getenv("GMAIL_USER") or os.getenv("SMTP_USER") or os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("EMAIL_PASS") or os.getenv("GMAIL_APP_PASSWORD") or os.getenv("SMTP_PASSWORD")
    smtp_host = os.getenv("SMTP_HOST") or os.getenv("EMAIL_HOST") or ("smtp.gmail.com" if smtp_user else "")
    smtp_from = os.getenv("EMAIL_FROM") or os.getenv("SMTP_FROM") or smtp_user
    try:
        smtp_port = int(os.getenv("SMTP_PORT") or 587)
    except ValueError:
        smtp_port = 587

    print(f"[order-email] SMTP config check: host={'set' if smtp_host else 'missing'}, user={'set' if smtp_user else 'missing'}, password={'set' if smtp_password else 'missing'}, from={'set' if smtp_from else 'missing'}, port={smtp_port}", flush=True)

    if not smtp_host or not smtp_user or not smtp_password or not smtp_from:
        print("[order-email] SMTP credentials not configured. Returning mock preview mode.", flush=True)
        return {
            "status": "preview_only",
            "mode": "mock",
            "message": "Order approved successfully. Gmail/SMTP credentials are not configured, so a mock email preview was generated; no real email was sent.",
            "gmailComposeUrl": compose_url,
            "preview": body,
        }

    try:
        print(f"[order-email] Sending SMTP email via {smtp_host}:{smtp_port} from={smtp_from} to={recipient}", flush=True)
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = smtp_from
        msg["To"] = recipient
        msg.set_content(body)
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=20) as smtp:
                smtp.login(smtp_user, smtp_password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as smtp:
                smtp.starttls()
                smtp.login(smtp_user, smtp_password)
                smtp.send_message(msg)
        print(f"[order-email] SMTP email sent successfully to {recipient}", flush=True)
        return {
            "status": "sent",
            "mode": "smtp",
            "message": "Order approved successfully. Delivery and tracking details have been sent to the company email.",
            "gmailComposeUrl": compose_url,
            "preview": body,
        }
    except Exception as exc:
        print(f"[order-email] SMTP email failed for {recipient}: {exc}", flush=True)
        return {
            "status": "failed",
            "mode": "error",
            "message": EMAIL_FAILURE_MESSAGE,
            "error": str(exc),
            "gmailComposeUrl": compose_url,
            "preview": body,
        }


@app.post("/api/place-order")
def place_order():
    """Create a delivery order after approval and email tracking details to the company email."""
    try:
        payload = request.get_json(silent=True) or {}
        requirements = payload.get("requirements") or {}
        print(f"[place-order] Request received supplier={(payload.get('selectedTender') or {}).get('company')} companyEmail={requirements.get('companyEmail') or payload.get('toEmail') or payload.get('companyEmail')} skipEmail={bool(payload.get('skipEmail'))}", flush=True)
        order = _build_delivery_order(payload)
        subject, body, details = _build_order_email(payload, order)
        skip_email = bool(payload.get("skipEmail"))
        if skip_email:
            email_result = {
                "status": "pending",
                "mode": "deferred",
                "message": "Email notification will be sent by /api/send-order-email after approval.",
                "gmailComposeUrl": _gmail_compose_url(details.get("companyEmail"), subject, body) if details.get("companyEmail") else "",
                "preview": body,
            }
        else:
            email_result = _send_delivery_order_email(details.get("companyEmail"), subject, body)
        email_status = email_result.get("status")
        if order.get("statusSteps"):
            if email_status in {"sent", "preview_only"}:
                order["statusSteps"][-2]["status"] = "completed"
            elif email_status == "pending":
                order["statusSteps"][-2]["status"] = "pending"
            else:
                order["statusSteps"][-2]["status"] = "failed"
            order["timeline"] = order["statusSteps"]
        return jsonify({
            "success": True,
            "order": order,
            "email": {
                "recipient": details.get("companyEmail"),
                "subject": subject,
                "body": body,
                **email_result,
            },
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.post("/api/tender-recommendations")
def tender_recommendations():
    """Generate top company tender recommendations from procurement requirements."""
    try:
        payload = request.get_json(silent=True) or {}
        result = generate_tender_recommendations(payload)
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.post("/api/generate-rfp")
def generate_rfp_pdf():
    """Generate a downloadable PDF RFP document from requirements and tender analysis."""
    try:
        payload = request.get_json(silent=True) or {}
        pdf_path, filename = create_rfp_pdf(payload)
        return send_file(
            pdf_path,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename,
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.post("/api/tender-matches")
def tender_matches():
    """Return ranked company tender responses for the user's entered requirements."""
    try:
        requirements = request.get_json(silent=True) or {}
        # Accept both {requirements: {...}} and a direct requirements payload.
        if "requirements" in requirements and isinstance(requirements.get("requirements"), dict):
            requirements = requirements["requirements"]
        result = build_tender_matches(requirements)
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.post("/api/generate-rfp-document")
def generate_rfp_document_pdf():
    """Generate a downloadable RFP PDF without requiring extra dependencies."""
    try:
        payload = request.get_json(silent=True) or {}
        lines = rfp_document_lines(payload)
        pdf_bytes = build_pdf(lines, title="RFP Document")
        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={"Content-Disposition": "attachment; filename=Original_RFP_Document.pdf"},
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.get("/api/calculate-pricing")
def calculate_pricing():
    """Calculate pricing based on matched RFP data"""
    try:
        import csv

        # Load pricing data
        pricing_file = "data/pricing.csv"
        pricing_map = {}
        if os.path.exists(pricing_file):
            with open(pricing_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    pricing_map[row['sku_id']] = {
                        'product_name': row['product_name'],
                        'unit_price': float(row['unit_price']),
                        'category': row['category']
                    }

        # Load matching report
        matching_file = "rfp_summary/matching_report.json"
        materials = []
        material_total = 0

        if os.path.exists(matching_file):
            with open(matching_file, 'r', encoding='utf-8') as f:
                match_data = json.load(f)
                matches = match_data.get('matches', [])

                for match in matches:
                    sku_id = match.get('matched_sku_id')
                    rfp_qty = match.get('rfp_quantity', 0)

                    # Convert quantity to number
                    try:
                        quantity = float(str(rfp_qty).replace(',', ''))
                    except Exception:
                        quantity = 0

                    if sku_id in pricing_map and quantity > 0:
                        pricing_info = pricing_map[sku_id]
                        unit_price = pricing_info['unit_price']
                        total_price = unit_price * quantity

                        materials.append({
                            'sku': sku_id,
                            'name': pricing_info['product_name'],
                            'quantity': f"{quantity} {match.get('rfp_units', 'units')}",
                            'unitPrice': unit_price,
                            'totalPrice': total_price
                        })
                        material_total += total_price

        # Calculate testing costs (standard rates)
        tests = [
            {'testName': 'Type Test as per IS 694', 'applicableTo': 'All Wires', 'cost': 45000, 'duration': '7 days'},
            {'testName': 'Type Test as per IS 1554', 'applicableTo': 'Control Cables', 'cost': 38000, 'duration': '5 days'},
            {'testName': 'Routine Tests (All Products)', 'applicableTo': 'All', 'cost': 65000, 'duration': '3 days'},
            {'testName': 'Sample Testing', 'applicableTo': 'All', 'cost': 55000, 'duration': '4 days'},
            {'testName': 'Acceptance Tests at Site', 'applicableTo': 'All', 'cost': 75000, 'duration': '2 days'},
            {'testName': 'Third Party Inspection', 'applicableTo': 'All', 'cost': 42000, 'duration': '2 days'}
        ]
        test_total = sum(test['cost'] for test in tests)

        # Additional costs
        additional_costs = [
            {'item': 'Factory Inspection', 'cost': 25000},
            {'item': 'Third-party Certification', 'cost': 35000},
            {'item': 'Packaging & Drums', 'cost': 85000},
            {'item': 'Transportation to Site', 'cost': 125000},
            {'item': 'Insurance', 'cost': 45000}
        ]
        additional_total = sum(cost['cost'] for cost in additional_costs)

        # Calculate summary
        subtotal = material_total + test_total + additional_total
        gst = subtotal * 0.18
        grand_total = subtotal + gst

        return jsonify({
            "success": True,
            "pricing": {
                "materials": materials,
                "tests": tests,
                "additionalCosts": additional_costs,
                "summary": {
                    "materialTotal": material_total,
                    "testTotal": test_total,
                    "additionalTotal": additional_total,
                    "subtotal": subtotal,
                    "gst": gst,
                    "grandTotal": grand_total
                }
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500



@app.post("/api/send-order-email")
def send_order_email():
    """Send or mock an order tracking email after final approval.

    Expected JSON can be the explicit API shape:
    {
      "companyEmail": "",
      "companyName": "",
      "projectName": "",
      "selectedSupplier": "",
      "selectedTender": "",
      "items": [],
      "totalAmount": "",
      "purchaseOrderId": "",
      "trackingId": "",
      "deliveryAddress": "",
      "deliveryDays": "",
      "expectedDeliveryDate": "",
      "currentStatus": ""
    }

    Configure GMAIL_USER + GMAIL_APP_PASSWORD or SMTP_HOST/SMTP_USER/SMTP_PASSWORD
    to send automatically. Without credentials this endpoint returns mock mode with
    the complete email preview; it never silently fails.
    """
    try:
        payload = request.get_json(silent=True) or {}
        print(f"[send-order-email] Request received. payloadKeys={list(payload.keys())}")
        order = payload.get("orderDetails") or payload.get("order") or None
        subject, body, details = _build_order_email(payload, order)
        print(f"[send-order-email] Normalized recipient={details.get('companyEmail') or 'missing'} purchaseOrderId={details.get('purchaseOrderId')} trackingId={details.get('trackingId')}")
        email_result = _send_delivery_order_email(details.get("companyEmail"), subject, body)
        success = email_result.get("status") in {"sent", "preview_only"}
        print(f"[send-order-email] Result status={email_result.get('status')} mode={email_result.get('mode')} success={success}")
        return jsonify({
            "success": success,
            "recipient": details.get("companyEmail"),
            "subject": subject,
            "body": body,
            **email_result,
        }), (200 if success else 500)
    except Exception as e:
        print(f"[send-order-email] Request failed: {e}", flush=True)
        return jsonify({
            "success": False,
            "status": "failed",
            "mode": "error",
            "message": EMAIL_FAILURE_MESSAGE,
            "error": str(e),
        }), 500


@app.post("/api/generate-purchase-order")
def generate_purchase_order_pdf():
    """Generate a separate Purchase Order PDF after approval."""
    try:
        payload = request.get_json(silent=True) or {}
        request_id = _request_id_from_payload(payload)
        lines = _build_purchase_order_pdf_lines(payload)
        pdf_bytes = build_pdf(lines, title="Purchase Order")
        order = payload.get("order") or payload.get("orderDetails") or {}
        po_id = order.get("purchaseOrderId") or order.get("orderId") or f"PO-{datetime.now(timezone.utc).year}-{uuid4().hex[:4].upper()}"
        _record_notification(request_id, {
            "type": "PO generated",
            "message": f"Purchase Order PDF generated for {po_id}.",
            "status": "Sent",
        })
        filename = f"{str(po_id).replace('/', '-')}-Purchase-Order.pdf"
        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except Exception as e:
        print(f"[generate-purchase-order] Request failed: {e}", flush=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.post("/api/upload-document")
def upload_document():
    """Upload supplier quotation, invoice, delivery note or compliance document and return mock extraction fields."""
    try:
        file = request.files.get("file")
        if not file or not file.filename:
            return jsonify({"success": False, "error": "No file uploaded"}), 400
        document_type = request.form.get("documentType") or "Uploaded document"
        request_id = request.form.get("requestId") or "default-request"
        upload_dir = Path("uploads") / "procurement_documents"
        upload_dir.mkdir(parents=True, exist_ok=True)
        safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", file.filename)
        saved_name = f"{uuid4().hex[:8]}-{safe_name}"
        saved_path = upload_dir / saved_name
        file.save(saved_path)
        order = {}
        tender = {}
        try:
            order = json.loads(request.form.get("orderDetails") or "{}")
            tender = json.loads(request.form.get("selectedTender") or "{}")
        except Exception:
            order = {}
            tender = {}
        extracted = _mock_extract_fields(file.filename, document_type, order=order, tender=tender)
        record = _record_notification(request_id, {
            "type": f"{document_type} uploaded",
            "message": f"Document uploaded and extraction preview generated: {file.filename}",
            "status": "Sent",
        })
        return jsonify({
            "success": True,
            "document": {
                "id": saved_name,
                "filename": file.filename,
                "documentType": document_type,
                "path": str(saved_path),
                "uploadedAt": datetime.now(timezone.utc).isoformat(),
            },
            "extractedFields": extracted,
            "notification": record,
        })
    except Exception as e:
        print(f"[upload-document] Request failed: {e}", flush=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.post("/api/extract-document-fields")
def extract_document_fields():
    """Extract important fields from an uploaded procurement document. Uses mock mode when OCR is not configured."""
    try:
        payload = request.get_json(silent=True) or {}
        extracted = _mock_extract_fields(
            payload.get("filename") or payload.get("documentName") or "Uploaded document",
            payload.get("documentType") or "Uploaded document",
            order=payload.get("orderDetails") or payload.get("order") or {},
            tender=payload.get("selectedTender") or payload.get("tender") or {},
        )
        return jsonify({"success": True, "mode": "mock", "extractedFields": extracted})
    except Exception as e:
        print(f"[extract-document-fields] Request failed: {e}", flush=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.post("/api/three-way-match")
def three_way_match():
    """Compare purchase order, supplier invoice and delivery note."""
    try:
        payload = request.get_json(silent=True) or {}
        result = _three_way_match_result(payload)
        request_id = _request_id_from_payload(payload, payload.get("purchaseOrder") or payload.get("order") or {})
        _record_notification(request_id, {
            "type": "3-Way Matching",
            "message": result.get("status"),
            "status": "Sent" if result.get("paymentApproval") else "Pending",
        })
        return jsonify({"success": True, "result": result})
    except Exception as e:
        print(f"[three-way-match] Request failed: {e}", flush=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.post("/api/resend-email")
def resend_email():
    """Resend the purchase-order delivery tracking email and record notification history."""
    try:
        payload = request.get_json(silent=True) or {}
        print(f"[resend-email] Request received. payloadKeys={list(payload.keys())}", flush=True)
        order = payload.get("orderDetails") or payload.get("order") or None
        subject, body, details = _build_order_email(payload, order)
        result = _send_delivery_order_email(details.get("companyEmail"), subject, body)
        request_id = _request_id_from_payload(payload, order)
        status = "Sent" if result.get("status") == "sent" else "Pending" if result.get("status") == "preview_only" else "Failed"
        record = _record_notification(request_id, {
            "type": "Resend Email",
            "message": result.get("message") or "Email resend processed.",
            "recipient": details.get("companyEmail"),
            "status": status,
            "reason": result.get("error") or "",
        })
        success = result.get("status") in {"sent", "preview_only"}
        return jsonify({
            "success": success,
            "recipient": details.get("companyEmail"),
            "subject": subject,
            "body": body,
            "notification": record,
            **result,
        }), (200 if success else 500)
    except Exception as e:
        print(f"[resend-email] Request failed: {e}", flush=True)
        return jsonify({"success": False, "status": "failed", "error": str(e)}), 500


@app.get("/api/notification-history/<request_id>")
def notification_history(request_id):
    """Return notification history for a procurement request."""
    return jsonify({"success": True, "requestId": request_id, "notifications": notification_history_store.get(str(request_id), [])})


if __name__ == "__main__":
    print("Starting Flask server on http://0.0.0.0:8000")
    app.run(host='0.0.0.0', port=8000, debug=True, use_reloader=False)
