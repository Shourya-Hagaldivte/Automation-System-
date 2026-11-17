"""PDF document generation for agentic procurement RFP documents."""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

BASE_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = BASE_DIR / "generated_rfps"


def _safe_text(value: Any, default: str = "Not specified") -> str:
    text = str(value if value not in (None, "") else default)
    text = text.replace("\u20b9", "INR ")
    return escape(text).replace("\n", "<br/>")


def _currency(value: Any) -> str:
    try:
        number = float(str(value).replace(",", "").replace("₹", ""))
    except (TypeError, ValueError):
        number = 0.0
    return f"INR {number:,.2f}"


def _url(value: Any) -> str:
    text = str(value or "").strip()
    return _safe_text(text) if text.startswith(("http://", "https://")) else "Not available"


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return slug or "procurement-rfp"


def _timeline_label(value: str) -> str:
    labels = {
        "urgent": "Urgent - within 2 weeks",
        "30-days": "Within 30 days",
        "60-days": "Within 60 days",
        "90-days": "Within 90 days",
    }
    return labels.get(value, value or "Not specified")


def _selected_tender(payload: dict[str, Any], tenders: list[dict[str, Any]]) -> dict[str, Any]:
    selected = payload.get("selectedTender") or {}
    if selected:
        return selected
    analysis = payload.get("tenderAnalysis") or {}
    return analysis.get("recommendedTender") or (tenders[0] if tenders else {})


def create_rfp_pdf(payload: dict[str, Any]) -> tuple[Path, str]:
    """Create a complete PDF RFP document and return the path and file name."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except Exception as exc:  # pragma: no cover - import guard for deployment
        raise RuntimeError("ReportLab is required to generate PDF RFP documents. Install reportlab from requirements.txt.") from exc

    requirements = payload.get("requirements") or {}
    requester = payload.get("requester") or {}
    analysis = payload.get("tenderAnalysis") or {}
    tenders = analysis.get("tenders") or []
    items = analysis.get("requestedItems") or requirements.get("items") or []
    selected = _selected_tender(payload, tenders)

    project_title = str(requirements.get("title") or "Procurement Requirement")
    organization = requirements.get("organization") or "Not specified"
    generated_at = datetime.now().strftime("%d %B %Y, %I:%M %p")
    document_id = f"RFP-{datetime.now().strftime('%Y%m%d%H%M%S')}"

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{_slug(project_title)}-rfp-document.pdf"
    output_path = OUTPUT_DIR / filename

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=0.52 * inch,
        leftMargin=0.52 * inch,
        topMargin=0.52 * inch,
        bottomMargin=0.52 * inch,
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="TitleCenter", parent=styles["Title"], alignment=TA_CENTER, fontSize=20, leading=24, spaceAfter=12))
    styles.add(ParagraphStyle(name="SectionTitle", parent=styles["Heading2"], fontSize=13, leading=16, spaceBefore=12, spaceAfter=8, textColor=colors.HexColor("#111827")))
    styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=8, leading=10, textColor=colors.HexColor("#4b5563")))
    styles.add(ParagraphStyle(name="Cell", parent=styles["BodyText"], fontSize=7.6, leading=9.2))
    styles.add(ParagraphStyle(name="HeaderCell", parent=styles["BodyText"], fontSize=7.5, leading=9.2, textColor=colors.white))

    def p(text: Any, style: str = "BodyText"):
        return Paragraph(_safe_text(text, ""), styles[style])

    def table(data: list[list[Any]], widths: list[float] | None = None) -> Table:
        normalized = []
        for row_index, row in enumerate(data):
            style_name = "HeaderCell" if row_index == 0 else "Cell"
            normalized.append([cell if hasattr(cell, "wrap") else p(cell, style_name) for cell in row])
        result = Table(normalized, colWidths=widths, repeatRows=1)
        result.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        return result

    story: list[Any] = []
    story.append(p("Request for Proposal (RFP)", "TitleCenter"))
    story.append(p(f"Document ID: {document_id} | Generated: {generated_at}", "Small"))
    story.append(Spacer(1, 8))

    story.append(p("1. Project and Buyer Details", "SectionTitle"))
    story.append(
        table(
            [
                ["Field", "Details"],
                ["Project Title", project_title],
                ["Buyer / Organization", organization],
                ["Company Email", requirements.get("companyEmail") or requester.get("email") or "Not captured"],
                ["Organization Type", requirements.get("organizationType")],
                ["Industry / Category", f"{requirements.get('industry') or 'Not specified'} / {requirements.get('productCategory') or 'Not specified'}"],
                ["Budget", _currency(requirements.get("budget"))],
                ["Delivery Location", requirements.get("deliveryLocation")],
                ["Required Delivery Deadline", requirements.get("deliveryDeadline") or _timeline_label(str(requirements.get("timeline") or ""))],
                ["Requester Email", requester.get("email") or "Not captured"],
            ],
            [1.75 * inch, 5.15 * inch],
        )
    )

    story.append(p("2. Requirement Terms", "SectionTitle"))
    story.append(
        table(
            [
                ["Requirement", "Details"],
                ["Warranty Requirement", requirements.get("warrantyRequirement")],
                ["Installation Requirement", requirements.get("installationRequirement")],
                ["Maintenance / Service Requirement", requirements.get("maintenanceRequirement")],
                ["Certification / Compliance", requirements.get("complianceRequirements")],
                ["Commercial Terms", requirements.get("commercialTerms")],
                ["Special Notes", requirements.get("specialNotes")],
            ],
            [2.05 * inch, 4.85 * inch],
        )
    )

    story.append(p("3. Required Bill of Quantities", "SectionTitle"))
    item_rows = [["S.No", "Category", "Item Name", "Quantity", "Unit", "Specs / Preferred Brand"]]
    for index, item in enumerate(items, start=1):
        item_rows.append([
            str(index),
            item.get("productCategory") or item.get("category") or "-",
            item.get("name") or item.get("itemName"),
            item.get("quantity"),
            item.get("unit"),
            f"{item.get('technicalSpecifications') or ''}\nPreferred brand: {item.get('preferredBrand') or 'Any suitable brand'}",
        ])
    if len(item_rows) == 1:
        item_rows.append(["1", "-", "No items entered", "0", "-", "-"])
    story.append(table(item_rows, [0.42 * inch, 1.0 * inch, 1.55 * inch, 0.65 * inch, 0.65 * inch, 2.25 * inch]))

    story.append(p("4. Agentic AI Procurement Process", "SectionTitle"))
    story.append(
        p(
            "Our AI agents automatically analyze requirements, identify products, discover suppliers, match tender/source opportunities, compare market prices, evaluate technical and commercial fit, check risk/compliance, and recommend the best option. The final decision remains with the business user."
        )
    )

    story.append(p("5. Company-wise Tender / Supplier Comparison", "SectionTitle"))
    comparison_rows = [["Rank", "Company / Links", "Tender Ref", "Overall", "Technical", "Commercial", "Lead Time", "Grand Total"]]
    for tender in tenders[:6]:
        comparison_rows.append(
            [
                tender.get("rank"),
                f"{tender.get('company')}\nTender: {_url(tender.get('tenderUrl'))}\nWebsite: {_url(tender.get('website'))}\nProducts: {_url(tender.get('catalogueUrl'))}",
                tender.get("tenderRef"),
                f"{tender.get('matchScore', 0)}%",
                f"{tender.get('technicalScore', 0)}%",
                f"{tender.get('commercialScore', 0)}%",
                tender.get("leadTime"),
                _currency((tender.get("summary") or {}).get("grandTotal")),
            ]
        )
    if len(comparison_rows) == 1:
        comparison_rows.append(["-", "No tender analysis available", "-", "-", "-", "-", "-", "-"])
    story.append(table(comparison_rows, [0.36 * inch, 1.65 * inch, 0.85 * inch, 0.55 * inch, 0.62 * inch, 0.7 * inch, 0.65 * inch, 0.9 * inch]))

    if selected:
        story.append(p("6. Selected Tender for Approval", "SectionTitle"))
        story.append(
            table(
                [
                    ["Field", "Details"],
                    ["Selected Company", selected.get("company")],
                    ["Tender Ref", selected.get("tenderRef")],
                    ["Overall / Technical / Commercial", f"{selected.get('matchScore', 0)}% / {selected.get('technicalScore', 0)}% / {selected.get('commercialScore', 0)}%"],
                    ["Total Quote", _currency((selected.get("summary") or {}).get("grandTotal"))],
                    ["Tender Link", _url(selected.get("tenderUrl"))],
                ],
                [1.75 * inch, 5.15 * inch],
            )
        )

    detail_start = 7 if selected else 6
    for tender in tenders[:3]:
        story.append(p(f"{detail_start}.{tender.get('rank')} Detailed Quote - {tender.get('company')}", "SectionTitle"))
        line_rows = [["Item", "Matched Product / SKU / Links", "Qty", "Unit Price", "Line Total"]]
        for line in tender.get("lines") or []:
            line_rows.append(
                [
                    line.get("itemName"),
                    f"{line.get('matchedProduct')}\nSKU: {line.get('sku')}\nSupplier: {line.get('supplierName')}\nSource: {line.get('priceSource')}\nProduct: {_url(line.get('productUrl'))}\nPrice: {_url(line.get('sourceUrl'))}",
                    f"{line.get('quantity')} {line.get('unit')}",
                    _currency(line.get("unitPrice")),
                    _currency(line.get("totalPrice")),
                ]
            )
        story.append(table(line_rows, [1.15 * inch, 2.75 * inch, 0.72 * inch, 0.9 * inch, 0.95 * inch]))
        summary = tender.get("summary") or {}
        story.append(
            table(
                [
                    ["Commercial Component", "Amount"],
                    ["Material Total", _currency(summary.get("itemTotal"))],
                    ["Freight / Logistics", _currency(summary.get("freight"))],
                    ["Testing / Inspection", _currency(summary.get("testing"))],
                    ["Insurance", _currency(summary.get("insurance"))],
                    ["GST", _currency(summary.get("gst"))],
                    ["Grand Total", _currency(summary.get("grandTotal"))],
                ],
                [4.6 * inch, 1.9 * inch],
            )
        )

    story.append(p("8. Evaluation Criteria", "SectionTitle"))
    criteria_rows = [["Score Area", "Basis"]]
    for name, basis in [
        ("Product match", "Match between requested product, category, specifications, pack/unit and matched SKU/source."),
        ("Quantity match", "Availability and quote coverage for the requested quantity."),
        ("Budget match", "Grand total compared with the entered budget."),
        ("Delivery location and timeline", "Feasibility for destination and requested deadline."),
        ("Technical score", "Product match, specs, warranty, compliance and delivery feasibility."),
        ("Commercial score", "Budget fit, price competitiveness, delivery terms and quantity coverage."),
        ("Supplier rating", "Source quality, catalog confidence, marketplace or supplier record."),
    ]:
        criteria_rows.append([name, basis])
    story.append(table(criteria_rows, [1.8 * inch, 5.0 * inch]))

    story.append(p("9. Vendor Submission Checklist", "SectionTitle"))
    checklist_rows = [["Document", "Required"]]
    for doc_name in [
        "Commercial quotation",
        "Technical compliance sheet",
        "Product datasheets / catalogues",
        "GST registration and company profile",
        "Warranty declaration",
        "Installation and maintenance declaration, if applicable",
        "Delivery schedule",
        "Deviation statement, if any",
    ]:
        checklist_rows.append([doc_name, "Yes"])
    story.append(table(checklist_rows, [4.9 * inch, 1.6 * inch]))

    story.append(p("10. Product Website Preview and Price Source Links", "SectionTitle"))
    source_rows = [["Company", "Requested Item", "Matched Product", "Product Preview", "Price Source"]]
    for tender in tenders[:6]:
        for line in tender.get("lines") or []:
            source_rows.append([
                line.get("supplierName") or tender.get("company"),
                line.get("itemName"),
                line.get("matchedProduct"),
                _url(line.get("productUrl")),
                _url(line.get("sourceUrl")),
            ])
    if len(source_rows) == 1:
        source_rows.append(["-", "No source-linked products available", "-", "-", "-"])
    story.append(table(source_rows, [1.05 * inch, 1.1 * inch, 1.55 * inch, 1.4 * inch, 1.4 * inch]))

    story.append(p("11. Pricing Source and Approval Note", "SectionTitle"))
    story.append(p(analysis.get("priceDisclaimer") or "AI-assisted supplier and tender matching uses source-linked price snapshots, marketplace and procurement source links and configured catalog data. Final approval remains with the business user."))
    story.append(p("This document is generated for procurement evaluation and approval workflow. Final purchase order terms should be approved by the buyer's authorized business user."))

    doc.build(story)
    return output_path, filename
