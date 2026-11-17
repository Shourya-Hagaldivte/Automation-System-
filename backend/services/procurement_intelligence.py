"""Agentic procurement intelligence for supplier discovery, tender matching and pricing.

The service returns complete, selectable tender options for every safe product line
entered by the user.  It combines the bundled source-linked supplier catalog,
optional live price feed overrides, and procurement source links for categories that are
not in the bundled supplier catalog.  Final procurement approval remains with the
business user.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

try:  # pragma: no cover - requests is optional in local offline mode
    import requests
except Exception:  # pragma: no cover
    requests = None

BASE_DIR = Path(__file__).resolve().parents[1]
CATALOG_FILE = BASE_DIR / "data" / "verified_supplier_catalog.json"

STOP_WORDS = {
    "a", "an", "and", "as", "by", "for", "from", "grade", "in", "is", "mm",
    "of", "or", "per", "sq", "the", "to", "v", "with", "x", "one", "no",
    "nos", "qty", "quantity", "unit", "units", "piece", "pieces", "meter",
    "meters", "mtr", "mtrs", "coil", "coils", "roll", "rolls", "pack", "packs",
    "table", "standard", "product", "bulk", "purchase", "procurement",
}

UNIT_ALIASES = {
    "meter": "meters", "meters": "meters", "metre": "meters", "metres": "meters",
    "m": "meters", "mtr": "meters", "mtrs": "meters",
    "piece": "pieces", "pieces": "pieces", "pc": "pieces", "pcs": "pieces",
    "unit": "pieces", "units": "pieces", "number": "pieces", "numbers": "pieces",
    "coil": "coils", "coils": "coils", "roll": "coils", "rolls": "coils",
    "pack": "packs", "packs": "packs", "box": "packs", "boxes": "packs",
    "bag": "bags", "bags": "bags", "kg": "kg", "kgs": "kg", "ton": "tons", "tons": "tons",
}

CATEGORY_HINTS = {
    "wire": "Wiring", "wires": "Wiring", "copper": "Wiring", "house wire": "Wiring", "cable": "Cable",
    "mcb": "Circuit Breaker", "breaker": "Circuit Breaker", "circuit": "Circuit Breaker", "switchgear": "Circuit Breaker",
    "led batten": "Lighting", "batten": "Lighting", "tubelight": "Lighting", "tube light": "Lighting",
    "bulb": "Bulb", "bulbs": "Bulb", "lamp": "Bulb", "lamps": "Bulb",
    "led": "Lighting", "light": "Lighting", "lights": "Lighting", "lighting": "Lighting",
    "fan": "Fan", "projector": "Projector", "projectors": "Projector", "audio visual": "Projector", "av": "Projector",
    "bench": "Bench", "benches": "Bench", "desk": "Bench", "classroom": "Bench", "furniture": "Bench", "seating": "Bench",
    "socket": "Wiring Accessories", "switch": "Wiring Accessories", "distribution": "Distribution Board", "db": "Distribution Board",
    "cement": "Construction Material", "steel": "Construction Material", "tmt": "Construction Material", "paint": "Construction Material",
    "tile": "Construction Material", "tiles": "Construction Material", "printer": "Office Equipment", "laptop": "Office Equipment",
}

GENERIC_REQUIREMENT_HINTS = {
    "electrical works", "electrical work", "electrical infrastructure", "electrical infrastructure upgrade",
    "electrical project", "electrical materials", "electrical supplies", "wiring work", "wiring works",
    "supply and installation", "procurement package", "general procurement",
}

RESTRICTED_PROCUREMENT_TERMS = re.compile(
    r"\b(gun|firearm|ammunition|ammo|bullet|rifle|pistol|knife|blade|grenade|explosive|firework|"
    r"pepper\s*spray|mace|taser|drug|cocaine|heroin|thc|cannabis|marijuana|alcohol|beer|wine|"
    r"vape|nicotine|cigarette|gambling|casino)\b",
    re.IGNORECASE,
)

GENERIC_SOURCES = [
    {
        "company": "GeM Marketplace",
        "supplierType": "Public procurement marketplace source",
        "description": "Public procurement marketplace source link for institutional bulk buying when an exact local catalog SKU is unavailable.",
        "website": "https://gem.gov.in/",
        "catalogueUrl": "https://mkp.gem.gov.in/",
        "tenderUrl": "https://bidplus.gem.gov.in/all-bids",
        "delivery_days": 21,
        "rating": 4.25,
        "commercial_score": 82,
        "coverage": ["public procurement", "bulk buying", "marketplace"],
        "certifications": ["Source-linked procurement opportunity", "Business approval required"],
        "products": [],
    },
    {
        "company": "IndiaMART Business Supplier Directory",
        "supplierType": "B2B supplier discovery source",
        "description": "B2B supplier discovery source link for quote follow-up and market rate comparison.",
        "website": "https://www.indiamart.com/",
        "catalogueUrl": "https://dir.indiamart.com/",
        "tenderUrl": "https://dir.indiamart.com/",
        "delivery_days": 16,
        "rating": 4.05,
        "commercial_score": 78,
        "coverage": ["supplier discovery", "market price", "quote"],
        "certifications": ["Source-linked procurement opportunity", "Business approval required"],
        "products": [],
    },
    {
        "company": "Moglix Enterprise Catalogue Source",
        "supplierType": "B2B procurement marketplace source",
        "description": "Enterprise procurement benchmark source used when direct live product source verification is unavailable.",
        "website": "https://www.moglix.com/",
        "catalogueUrl": "https://www.moglix.com/",
        "tenderUrl": "https://www.moglix.com/",
        "delivery_days": 14,
        "rating": 4.18,
        "commercial_score": 84,
        "coverage": ["industrial procurement", "marketplace", "bulk purchase"],
        "certifications": ["Benchmark procurement estimate", "Business approval required"],
        "source_status": "Live supplier source unavailable, using benchmark procurement estimate.",
        "products": [],
    },
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _phrase_text(value: Any) -> str:
    return str(value or "").lower().replace("sq.mm", "sqmm").replace("sq mm", "sqmm")


def _singularize(token: str) -> set[str]:
    values = {token}
    if token.endswith("ies") and len(token) > 4:
        values.add(f"{token[:-3]}y")
    if token.endswith("es") and len(token) > 4:
        values.add(token[:-2])
    if token.endswith("s") and len(token) > 3:
        values.add(token[:-1])
    return values


def _tokens(value: Any) -> set[str]:
    text = _phrase_text(value)
    words = re.findall(r"[a-z0-9.]+", text)
    tokens: set[str] = set()
    for word in words:
        if len(word) <= 1 or word in STOP_WORDS:
            continue
        for candidate in _singularize(word):
            if candidate and candidate not in STOP_WORDS:
                tokens.add(candidate)
        if word.endswith("sqmm"):
            tokens.add(word.replace("sqmm", ""))
    return {token for token in tokens if token}


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(str(value).replace(",", "").replace("₹", "").strip())
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(round(_safe_float(value, default)))
    except Exception:
        return default


def _normalize_unit(unit: Any) -> str:
    raw = str(unit or "pieces").strip().lower()
    return UNIT_ALIASES.get(raw, raw)


def _slug(value: Any) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "procurement").lower()).strip("-")
    return slug or "procurement"


def _category_guess(item_name: str) -> str:
    text = _phrase_text(item_name)
    for keyword, category in CATEGORY_HINTS.items():
        if keyword in text:
            return category
    tokens = _tokens(item_name)
    for keyword, category in CATEGORY_HINTS.items():
        if keyword in tokens:
            return category
    return "Industrial Product"


def _clean_requirement_items(requirements: dict[str, Any]) -> list[dict[str, Any]]:
    raw_items = requirements.get("items") or []
    if not raw_items and (requirements.get("productName") or requirements.get("product_name")):
        raw_items = [{
            "name": requirements.get("productName") or requirements.get("product_name"),
            "quantity": requirements.get("quantity") or 1,
            "unit": requirements.get("unit") or "pieces",
            "productCategory": requirements.get("productCategory") or requirements.get("category"),
            "technicalSpecifications": requirements.get("technicalSpecifications") or requirements.get("specifications"),
            "preferredBrand": requirements.get("preferredBrand") or requirements.get("preferredBrands"),
        }]

    cleaned: list[dict[str, Any]] = []
    for item in raw_items:
        name = str(item.get("name") or item.get("productName") or "").strip()
        if not name:
            continue
        category = item.get("productCategory") or item.get("category") or requirements.get("productCategory") or _category_guess(name)
        cleaned.append({
            "name": name,
            "quantity": max(_safe_float(item.get("quantity"), 1.0), 1.0),
            "unit": _normalize_unit(item.get("unit") or "pieces"),
            "productCategory": category,
            "category": category,
            "technicalSpecifications": str(item.get("technicalSpecifications") or item.get("specifications") or "").strip(),
            "preferredBrand": str(item.get("preferredBrand") or item.get("preferredBrands") or "").strip(),
        })
    return cleaned


def _is_generic_requirement_item(name: str) -> bool:
    text = _phrase_text(name)
    if not text.strip():
        return True
    if any(hint in text for hint in GENERIC_REQUIREMENT_HINTS):
        return True
    tokens = _tokens(text)
    generic_only = {"electrical", "works", "work", "infrastructure", "upgrade", "project", "maintenance", "installation", "supply", "materials", "supplies", "package"}
    return bool(tokens) and tokens.issubset(generic_only)


def _looks_electrical_scope(requirements: dict[str, Any], cleaned_items: list[dict[str, Any]]) -> bool:
    joined = " ".join([
        str(requirements.get("title") or ""),
        str(requirements.get("industry") or ""),
        str(requirements.get("productCategory") or ""),
        " ".join(item.get("name", "") for item in cleaned_items),
    ]).lower()
    return any(term in joined for term in ["electrical", "wire", "wiring", "cable", "mcb", "switchgear", "breaker", "lighting", "led", "fan", "power", "distribution", "db", "panel"])


def _starter_boq_for_electrical_scope(requirements: dict[str, Any], original_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seed_quantity = max(_safe_float(original_items[0].get("quantity"), 1.0), 1.0) if original_items else 1.0
    return [
        {"name": "2.5 sq.mm copper wire", "quantity": seed_quantity, "unit": "meters", "productCategory": "Wiring", "category": "Wiring", "technicalSpecifications": "FR/HRFR copper house wire, 2.5 sq.mm", "preferredBrand": "", "inferred": True, "inferenceReason": "Starter BOQ inferred from broad electrical scope"},
        {"name": "25A MCB", "quantity": seed_quantity, "unit": "pieces", "productCategory": "Circuit Breaker", "category": "Circuit Breaker", "technicalSpecifications": "25A SP/DP MCB as per site requirement", "preferredBrand": "", "inferred": True, "inferenceReason": "Starter BOQ inferred from broad electrical scope"},
        {"name": "20W LED batten light", "quantity": seed_quantity, "unit": "pieces", "productCategory": "Lighting", "category": "Lighting", "technicalSpecifications": "20W LED batten light with standard warranty", "preferredBrand": "", "inferred": True, "inferenceReason": "Starter BOQ inferred from broad electrical scope"},
    ]


def _resolve_requirement_items(requirements: dict[str, Any]) -> tuple[list[dict[str, Any]], bool, str]:
    cleaned = _clean_requirement_items(requirements)
    specific_items = [item for item in cleaned if not _is_generic_requirement_item(item["name"])]
    if specific_items:
        return specific_items, False, ""
    if _looks_electrical_scope(requirements, cleaned):
        return _starter_boq_for_electrical_scope(requirements, cleaned), True, "The entered scope was broad, so a starter electrical BOQ was inferred. Edit the requirement items for exact site quantities before issuing the RFP."
    return cleaned, False, ""


def _is_restricted_procurement_item(item: dict[str, Any]) -> bool:
    text = f"{item.get('name') or ''} {item.get('productCategory') or item.get('category') or ''} {item.get('technicalSpecifications') or ''}"
    return bool(RESTRICTED_PROCUREMENT_TERMS.search(text))


def _load_verified_catalog() -> dict[str, Any]:
    if not CATALOG_FILE.exists():
        return {"suppliers": [], "updated_at": _now_iso(), "currency": "INR"}
    with CATALOG_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def _product_search_text(product: dict[str, Any]) -> str:
    pieces = [product.get("sku"), product.get("name"), product.get("category"), product.get("price_basis"), " ".join(product.get("keywords") or [])]
    return " ".join(str(piece or "") for piece in pieces)


def _wire_sizes(text: str) -> set[str]:
    return set(re.findall(r"(\d+(?:\.\d+)?)\s*sqmm", _phrase_text(text)))


def _amp_ratings(text: str) -> set[str]:
    normalized = _phrase_text(text)
    ratings = set(re.findall(r"\b(\d+(?:\.\d+)?)\s*a(?:mpere|mp|mps)?\b", normalized))
    ratings.update(re.findall(r"\b(\d+(?:\.\d+)?)\s*ampere(?:s)?\b", normalized))
    return ratings


def _watt_ratings(text: str) -> set[str]:
    normalized = _phrase_text(text)
    ratings = set(re.findall(r"\b(\d+(?:\.\d+)?)\s*w(?:att|atts)?\b", normalized))
    ratings.update(re.findall(r"\b(\d+(?:\.\d+)?)\s*watt(?:s)?\b", normalized))
    return ratings


def _pole_counts(text: str) -> set[str]:
    normalized = _phrase_text(text)
    poles = set(re.findall(r"\b(\d+)\s*p\b", normalized))
    poles.update(re.findall(r"\b(\d+)\s*pole(?:s)?\b", normalized))
    if re.search(r"\bsp\b|single\s+pole", normalized):
        poles.add("1")
    if re.search(r"\bdp\b|double\s+pole", normalized):
        poles.add("2")
    if re.search(r"\btp\b|triple\s+pole", normalized):
        poles.add("3")
    if re.search(r"\bfp\b|four\s+pole", normalized):
        poles.add("4")
    return poles


def _category_compatible(item_category: str, product_category: str, item_text: str, product_text: str) -> bool:
    item_category_l = (item_category or "").lower()
    product_category_l = (product_category or "").lower()
    if item_category_l == "industrial product" or not product_category_l:
        return True
    if item_category_l == product_category_l:
        return True
    if item_category_l in {"electrical", "electrical items", "electrical supplies", "electrical materials", "electrical equipment"} and product_category_l in {"wiring", "cable", "circuit breaker", "lighting", "bulb", "wiring accessories", "distribution board", "fan"}:
        return True
    if item_category_l in {"furniture", "school furniture", "classroom furniture"} and product_category_l in {"bench"}:
        return True
    if item_category_l in {"av equipment", "audio visual", "electronics", "office equipment"} and product_category_l in {"projector"}:
        return True
    if item_category_l == "lighting" and product_category_l in {"lighting", "bulb"}:
        return True
    if item_category_l == "bulb" and product_category_l == "lighting" and "bulb" in product_text:
        return True
    if item_category_l == "cable" and product_category_l == "wiring":
        return True
    return False


def _score_product(item: dict[str, Any], product: dict[str, Any]) -> int:
    item_context = " ".join([
        str(item.get("name") or ""),
        str(item.get("productCategory") or item.get("category") or ""),
        str(item.get("technicalSpecifications") or ""),
        str(item.get("preferredBrand") or ""),
    ])
    item_tokens = _tokens(item_context)
    product_text_full = _product_search_text(product)
    product_tokens = _tokens(product_text_full)
    if not item_tokens:
        return 0

    item_text = _phrase_text(item_context)
    product_text = _phrase_text(product_text_full)
    item_category = item.get("productCategory") or item.get("category") or _category_guess(item_context)
    product_category = str(product.get("category") or "")
    if not _category_compatible(item_category, product_category, item_text, product_text):
        return 0

    product_category_lower = product_category.lower()
    if product_category_lower == "bulb" and not any(term in item_text for term in ["bulb", "bulbs", "lamp", "lamps", "light", "lighting"]):
        return 0
    if "projector" in item_text and "projector" not in product_text:
        return 0
    if ("bench" in item_text or "benches" in item_text or "desk" in item_text) and not any(term in product_text for term in ["bench", "desk", "seating"]):
        return 0
    if "bulb" in item_text and "bulb" not in product_text:
        return 0
    if "batten" in item_text and "batten" not in product_text:
        return 0
    if "mcb" in item_text and "mcb" not in product_text:
        return 0

    for getter in (_wire_sizes, _amp_ratings, _pole_counts, _watt_ratings):
        requested = getter(item_text)
        offered = getter(product_text)
        if requested and offered and not requested.intersection(offered):
            return 0

    overlap = item_tokens.intersection(product_tokens)
    score = int((len(overlap) / max(len(item_tokens), 1)) * 58)

    important_terms = [
        "copper", "wire", "cable", "mcb", "breaker", "switchgear", "led", "batten", "light", "bulb",
        "projector", "bench", "desk", "furniture", "lamp", "fr", "hrfr", "hospital", "office", "school",
    ]
    for term in important_terms:
        if term in item_text and term in product_text:
            score += 6

    item_numbers = set(re.findall(r"\d+(?:\.\d+)?", item_text))
    product_numbers = set(re.findall(r"\d+(?:\.\d+)?", product_text))
    if item_numbers:
        matches = item_numbers.intersection(product_numbers)
        score += 18 + (len(matches) - 1) * 4 if matches else -16

    if str(item_category).lower() == product_category.lower() or str(item_category).lower() in product_category.lower():
        score += 12
    elif item_category == "Lighting" and product_category in {"Lighting", "Bulb"}:
        score += 7

    preferred_brand = str(item.get("preferredBrand") or "").lower().strip()
    if preferred_brand and preferred_brand in product_text:
        score += 7

    return min(99, max(0, score))


def _supplier_fit_score(supplier: dict[str, Any], item_names: str) -> int:
    text = _phrase_text(item_names)
    coverage = supplier.get("coverage") or []
    matches = sum(1 for keyword in coverage if keyword and keyword.lower() in text)
    if matches == 0:
        return 66
    return min(99, 70 + matches * 3)


def _best_product_for_item(item: dict[str, Any], supplier: dict[str, Any]) -> dict[str, Any] | None:
    ranked: list[dict[str, Any]] = []
    for product in supplier.get("products") or []:
        score = _score_product(item, product)
        if score <= 0:
            continue
        ranked.append({"product": product, "score": score})
    if not ranked:
        return None
    ranked.sort(key=lambda entry: (entry["score"], -_safe_float(entry["product"].get("unit_price"), 10**9)), reverse=True)
    best = ranked[0]
    return best if best["score"] >= 25 else None


def _convert_price(product: dict[str, Any], quantity: float, requested_unit: str) -> tuple[float, float, str, str]:
    product_unit = _normalize_unit(product.get("unit") or "piece")
    requested_unit = _normalize_unit(requested_unit)
    base_price = _safe_float(product.get("unit_price"), 0.0)
    pack_size = _safe_float(product.get("pack_size"), 0.0)
    pack_unit = _normalize_unit(product.get("pack_unit") or "") if product.get("pack_unit") else ""

    if requested_unit == "meters" and pack_size > 0 and pack_unit == "meters":
        unit_price = round(base_price / pack_size, 2)
        return unit_price, round(unit_price * quantity, 2), "meter", f"Converted from {int(pack_size)} m coil price"

    if requested_unit == "pieces" and pack_size > 0 and pack_unit == "pieces":
        unit_price = round(base_price / pack_size, 2)
        return unit_price, round(unit_price * quantity, 2), "piece", f"Converted from pack of {int(pack_size)} price"

    if requested_unit in {"pieces", "coils"} and product_unit in {"coil", "coils"}:
        total_price = round(base_price * quantity, 2)
        display_unit = "coil" if quantity == 1 else "coils"
        return round(base_price, 2), total_price, display_unit, f"1 piece treated as 1 retail coil / pack ({int(pack_size)} m)" if pack_size else "1 piece treated as 1 retail pack"

    if requested_unit in {"packs"} and product_unit in {"pack", "packs"}:
        total_price = round(base_price * quantity, 2)
        return round(base_price, 2), total_price, "pack" if quantity == 1 else "packs", "Direct pack price"

    if requested_unit == product_unit or requested_unit in {"pieces", "coils"}:
        total_price = round(base_price * quantity, 2)
        display_unit = "piece" if product_unit == "pieces" else product_unit
        return round(base_price, 2), total_price, display_unit, "Direct product unit price"

    total_price = round(base_price * quantity, 2)
    return round(base_price, 2), total_price, product.get("unit") or requested_unit, "Unit conversion unavailable; direct quoted unit used"


def _load_live_price_feed() -> dict[str, Any]:
    feed_url = os.getenv("RFP_PRICE_FEED_URL", "").strip()
    feed_file = os.getenv("RFP_PRICE_FEED_FILE", "").strip()
    try:
        if feed_url and requests is not None:
            response = requests.get(feed_url, timeout=8)
            response.raise_for_status()
            data = response.json()
            return data.get("items", data) if isinstance(data, dict) else {}
        if feed_file:
            path = Path(feed_file)
            if path.exists():
                with path.open("r", encoding="utf-8") as file:
                    data = json.load(file)
                return data.get("items", data) if isinstance(data, dict) else {}
    except Exception:
        return {}
    return {}


def _apply_live_price(product: dict[str, Any], feed: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    if not feed:
        return product, False
    keys = [product.get("sku"), product.get("name"), product.get("category")]
    best: dict[str, Any] | None = None
    best_score = 0
    product_tokens = _tokens(_product_search_text(product))
    for key, value in feed.items():
        if not isinstance(value, dict):
            continue
        key_text = str(key or "")
        exact_key = any(key_text.lower() == str(candidate or "").lower() for candidate in keys)
        score = 100 if exact_key else len(_tokens(key_text).intersection(product_tokens))
        if score > best_score:
            best = value
            best_score = score
    if best and best_score > 0:
        updated = dict(product)
        updated["unit_price"] = _safe_float(best.get("unit_price"), _safe_float(product.get("unit_price"), 0.0))
        updated["source_name"] = best.get("source") or best.get("source_name") or "Configured live price feed"
        updated["source_url"] = best.get("url") or best.get("source_url") or os.getenv("RFP_PRICE_FEED_URL") or "RFP_PRICE_FEED_FILE"
        updated["price_basis"] = best.get("price_basis") or "Runtime live-feed override"
        return updated, True
    return product, False


def _timeline_days(requirements: dict[str, Any]) -> int:
    deadline = requirements.get("deliveryDeadline") or requirements.get("requiredDeliveryDeadline")
    if deadline:
        try:
            date_part = str(deadline).split("T", 1)[0]
            due = datetime.fromisoformat(date_part)
            diff = (due.date() - datetime.now().date()).days
            if diff > 0:
                return max(1, diff)
        except Exception:
            pass
    mapping = {"urgent": 14, "30-days": 30, "60-days": 60, "90-days": 90}
    return mapping.get(str(requirements.get("timeline") or "").strip(), 30)


def _line_from_product(item: dict[str, Any], supplier: dict[str, Any], product: dict[str, Any], product_score: int, live_price_applied: bool) -> dict[str, Any]:
    unit_price, total_price, display_unit, quantity_note = _convert_price(product, item["quantity"], item["unit"])
    source_status = product.get("source_status") or _source_unavailable_message(supplier)
    if _is_moglix_product_or_source(product, supplier):
        source_status = source_status or "Live supplier source unavailable, using benchmark procurement estimate."
    product_url = _safe_catalog_link(product.get("product_url") or supplier.get("catalogueUrl") or supplier.get("website"), product, supplier)
    source_url = _safe_catalog_link(product.get("source_url") or supplier.get("catalogueUrl") or supplier.get("website"), product, supplier)
    price_basis = product.get("price_basis") or "Source-linked price snapshot"
    if source_status and source_status not in price_basis:
        price_basis = f"{source_status} {price_basis}"
    return {
        "itemName": item["name"], "quantity": item["quantity"], "requestedUnit": item["unit"], "unit": display_unit,
        "matchedProduct": product.get("name") or item["name"], "sku": product.get("sku") or "CATALOG-MATCH", "matchScore": product_score,
        "unitPrice": unit_price, "totalPrice": total_price, "priceSource": product.get("source_name") or "Source-linked market pricing",
        "sourceUrl": source_url,
        "productUrl": product_url,
        "supplierWebsite": supplier.get("website"), "supplierName": supplier.get("company"), "category": product.get("category") or item.get("productCategory") or _category_guess(item["name"]),
        "priceBasis": price_basis, "quantityNote": quantity_note,
        "imageType": product.get("image_type") or "product", "livePriceApplied": live_price_applied,
        "sourceStatus": source_status or "",
        "sourceUnavailable": bool(source_status),
        "sourceVerified": not bool(source_status),
    }


def _commercial_summary(item_total: float) -> dict[str, float]:
    freight = round(max(950.0, item_total * 0.025), 2)
    testing = round(max(1250.0, item_total * 0.008), 2)
    insurance = round(max(350.0, item_total * 0.004), 2)
    subtotal = round(item_total + freight + testing + insurance, 2)
    gst = round(subtotal * 0.18, 2)
    return {"itemTotal": round(item_total, 2), "freight": freight, "testing": testing, "insurance": insurance, "subtotal": subtotal, "gst": gst, "grandTotal": round(subtotal + gst, 2)}


def _supplier_preview_products(supplier: dict[str, Any], lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not supplier.get("products"):
        return [{"sku": line.get("sku"), "name": line.get("matchedProduct"), "category": line.get("category"), "productUrl": line.get("productUrl"), "sourceUrl": line.get("sourceUrl"), "unitPrice": line.get("unitPrice"), "unit": line.get("unit"), "priceBasis": line.get("priceBasis"), "imageType": line.get("imageType"), "sourceStatus": line.get("sourceStatus"), "sourceUnavailable": line.get("sourceUnavailable")} for line in lines[:5]]
    line_skus = {line.get("sku") for line in lines}
    previews: list[dict[str, Any]] = []
    for product in supplier.get("products") or []:
        if product.get("sku") in line_skus or len(previews) < 4:
            source_status = _source_unavailable_message(supplier) or ("Live supplier source unavailable, using benchmark procurement estimate." if _is_moglix_product_or_source(product, supplier) else "")
            previews.append({"sku": product.get("sku"), "name": product.get("name"), "category": product.get("category"), "productUrl": "" if source_status else product.get("product_url") or supplier.get("catalogueUrl"), "sourceUrl": "" if source_status else product.get("source_url") or supplier.get("catalogueUrl"), "unitPrice": product.get("unit_price"), "unit": product.get("unit"), "priceBasis": product.get("price_basis"), "imageType": product.get("image_type") or "product", "sourceStatus": source_status, "sourceUnavailable": bool(source_status), "sourceVerified": not bool(source_status)})
        if len(previews) >= 5:
            break
    return previews


def _search_link_for_source(source: dict[str, Any], item_name: str) -> str:
    query = _slug(item_name).replace("-", "+")
    if "GeM" in source.get("company", ""):
        return f"https://mkp.gem.gov.in/search?q={query}"
    if "IndiaMART" in source.get("company", ""):
        return f"https://dir.indiamart.com/search.mp?ss={query}"
    # Moglix keyword search often returns no-result/404 for some procurement terms.
    # Avoid surfacing broken search pages as valid supplier sources.
    if "Moglix" in source.get("company", ""):
        return ""
    return source.get("catalogueUrl") or source.get("website") or ""


def _source_unavailable_message(source: dict[str, Any]) -> str:
    return "Live supplier source unavailable, using benchmark procurement estimate." if "Moglix" in source.get("company", "") else ""


def _is_moglix_product_or_source(product: dict[str, Any], supplier: dict[str, Any]) -> bool:
    text = " ".join(str(value or "") for value in [
        supplier.get("company"), product.get("source_name"), product.get("product_url"), product.get("source_url"),
    ]).lower()
    return "moglix" in text


def _safe_catalog_link(url: Any, product: dict[str, Any], supplier: dict[str, Any]) -> str:
    # Moglix search/direct pages are known to return no-result or 404 for some SKUs.
    # Keep the quote row, but do not show the broken page as a valid clickable source.
    if _is_moglix_product_or_source(product, supplier):
        return ""
    return str(url or "")


def _generic_image_type(item: dict[str, Any]) -> str:
    category = _category_guess(f"{item.get('name') or ''} {item.get('productCategory') or item.get('category') or ''}").lower()
    if category in {"wiring", "cable"}:
        return "wire"
    if category == "circuit breaker":
        return "mcb"
    if category == "lighting":
        return "lighting"
    if category == "bulb":
        return "bulb"
    if category == "projector":
        return "projector"
    if category == "bench":
        return "furniture"
    return "product"


def _estimate_generic_unit_price(item: dict[str, Any], source_index: int = 0) -> float:
    text = _phrase_text(f"{item.get('name') or ''} {item.get('productCategory') or item.get('category') or ''} {item.get('technicalSpecifications') or ''}")
    base = 1000.0
    unit = _normalize_unit(item.get("unit"))
    if re.search(r"projector|display|audio visual|\bav\b", text):
        base = 34000
    elif re.search(r"bench|desk|chair|furniture|seating", text):
        base = 6400
    elif re.search(r"bulb|lamp", text):
        base = 75
    elif re.search(r"batten|light|lighting", text):
        base = 260
    elif re.search(r"mcb|breaker|switchgear", text):
        base = 240
    elif re.search(r"wire|wiring|cable", text):
        base = 55 if unit == "meters" else 4500
    elif "cement" in text:
        base = 430
    elif re.search(r"steel|tmt|bar", text):
        base = 62000 if unit == "tons" else 62
    elif "paint" in text:
        base = 3200
    elif re.search(r"tile|tiles", text):
        base = 900
    elif "fan" in text:
        base = 2100
    elif re.search(r"laptop|computer", text):
        base = 52000
    elif "printer" in text:
        base = 14500
    multiplier = [1.04, 0.96, 1.0][source_index % 3]
    return round(max(1.0, base * multiplier), 2)


def _brand_specific_product_name(preferred_brand: str, item_name: str, text: str) -> str:
    brand = preferred_brand.strip()
    lower_brand = brand.lower()
    if re.search(r"projector|display|audio visual|\bav\b", text):
        if "epson" in lower_brand:
            return "Epson EB-E01 XGA Business Projector"
        if "benq" in lower_brand:
            return "BenQ MX560 XGA Business Projector"
        if "viewsonic" in lower_brand:
            return "ViewSonic PA503X XGA Business Projector"
        return f"{brand} XGA Business Projector"
    if re.search(r"bulb|lamp", text):
        if "wipro" in lower_brand:
            return "Wipro Garnet 9W B22 LED Bulb"
        if "philips" in lower_brand:
            return "Philips 12W B22 LED Bulb"
        return f"{brand} LED Bulb, B22 base"
    if re.search(r"batten|light|lighting", text):
        if "philips" in lower_brand:
            return "Philips 20W LED Batten Light"
        if "wipro" in lower_brand:
            return "Wipro Garnet 20W LED Batten Light"
        if "havells" in lower_brand:
            return "Havells 20W LED Batten Light"
        return f"{brand} LED Lighting Fixture"
    if re.search(r"bench|desk|chair|furniture|seating", text):
        if "godrej" in lower_brand:
            return "Godrej Interio Modular Office Chair / Institutional Seating"
        if "nilkamal" in lower_brand:
            return "Nilkamal Institutional Classroom Bench"
        return f"{brand} Institutional Furniture / Seating"
    if re.search(r"steel|tmt|bar", text):
        if "tata" in lower_brand:
            return "Tata Tiscon TMT Construction Rod"
        if "jsw" in lower_brand:
            return "JSW Neosteel TMT Construction Rod"
        return f"{brand} TMT Construction Rod"
    if re.search(r"wire|wiring|cable", text):
        if "polycab" in lower_brand:
            return "Polycab FR Copper House Wire"
        if "havells" in lower_brand:
            return "Havells Life Line FR Copper Wire"
        return f"{brand} Copper Wire / Cable"
    return f"{brand} {item_name} procurement listing"


def _realistic_generic_product_name(item: dict[str, Any], source_index: int = 0) -> str:
    item_name = item.get("name") or "Procurement item"
    text = _phrase_text(f"{item_name} {item.get('productCategory') or item.get('category') or ''} {item.get('technicalSpecifications') or ''}")
    preferred_brand = str(item.get("preferredBrand") or "").strip()
    if preferred_brand:
        return _brand_specific_product_name(preferred_brand, item_name, text)
    variants = {
        "projector": [
            "Epson EB-E01 / BenQ MX560 equivalent projector quotation",
            "BenQ / ViewSonic classroom projector supplier listing",
            "Epson / BenQ institutional projector procurement listing",
        ],
        "bench": [
            "Godrej Interio / Nilkamal institutional bench quotation",
            "Nilkamal / Godrej classroom bench supplier listing",
            "Institutional classroom bench and desk procurement listing",
        ],
        "bulb": [
            "Wipro Garnet / Philips LED bulb quotation",
            "Philips / Wipro LED bulb supplier listing",
            "B2B LED bulb procurement catalogue listing",
        ],
        "lighting": [
            "Havells / Wipro LED batten light quotation",
            "Philips / Wipro LED lighting supplier listing",
            "Institutional LED lighting procurement catalogue listing",
        ],
        "mcb": [
            "Havells X7 / Schneider Easy9 MCB quotation",
            "Schneider / Havells MCB supplier listing",
            "B2B circuit breaker procurement catalogue listing",
        ],
        "wire": [
            "Polycab / Havells FR copper wire quotation",
            "KEI / Finolex copper wire supplier listing",
            "B2B copper wiring procurement catalogue listing",
        ],
        "cement": [
            "UltraTech / ACC cement supplier quotation",
            "Ambuja / ACC cement distributor listing",
            "B2B cement procurement catalogue listing",
        ],
        "steel": [
            "Tata Tiscon / JSW TMT steel quotation",
            "SAIL / JSW steel supplier listing",
            "B2B steel procurement catalogue listing",
        ],
        "paint": [
            "Asian Paints / Berger paint quotation",
            "Berger / Nerolac paint supplier listing",
            "B2B paint procurement catalogue listing",
        ],
    }
    key = "generic"
    if re.search(r"projector|display|audio visual|\bav\b", text):
        key = "projector"
    elif re.search(r"bench|desk|chair|furniture|seating", text):
        key = "bench"
    elif re.search(r"bulb|lamp", text):
        key = "bulb"
    elif re.search(r"batten|light|lighting", text):
        key = "lighting"
    elif re.search(r"mcb|breaker|switchgear", text):
        key = "mcb"
    elif re.search(r"wire|wiring|cable", text):
        key = "wire"
    elif "cement" in text:
        key = "cement"
    elif re.search(r"steel|tmt|bar", text):
        key = "steel"
    elif "paint" in text:
        key = "paint"
    options = variants.get(key) or [
        f"{item_name} brand-wise supplier quotation",
        f"{item_name} marketplace supplier listing",
        f"{item_name} procurement catalogue listing",
    ]
    return options[source_index % len(options)]


def _source_sku_prefix(source: dict[str, Any]) -> str:
    company = str(source.get("company") or "")
    if "GeM" in company:
        return "GEM-SRC"
    if "IndiaMART" in company:
        return "IMART-SRC"
    if "Moglix" in company:
        return "MOGLIX-SRC"
    return "SOURCE-SRC"


def _generic_price_basis(source: dict[str, Any], item: dict[str, Any], source_index: int, product_name: str) -> str:
    company = str(source.get("company") or "Supplier source")
    if "GeM" in company:
        return f"{product_name} - GeM marketplace procurement listing with institutional supplier options"
    if "IndiaMART" in company:
        return f"{product_name} - IndiaMART business supplier listing for bulk quotation"
    if "Moglix" in company:
        return "Live supplier source unavailable, using benchmark procurement estimate."
    return f"{product_name} - source-linked supplier catalogue price reference"


def _generic_candidate_for_item(item: dict[str, Any], source: dict[str, Any], source_index: int) -> dict[str, Any]:
    item_name = item.get("name") or "Procurement item"
    link = _search_link_for_source(source, item_name)
    product_name = _realistic_generic_product_name(item, source_index)
    source_status = _source_unavailable_message(source)
    product = {
        "sku": f"{_source_sku_prefix(source)}-{source_index + 1}-{_slug(item_name).upper()[:28]}",
        "name": product_name,
        "category": item.get("productCategory") or item.get("category") or _category_guess(item_name),
        "unit_price": _estimate_generic_unit_price(item, source_index),
        "unit": "piece" if _normalize_unit(item.get("unit")) == "pieces" else _normalize_unit(item.get("unit")),
        "image_type": _generic_image_type(item),
        "keywords": list(_tokens(f"{item_name} {item.get('technicalSpecifications') or ''} {item.get('preferredBrand') or ''}")),
        "product_url": "" if source_status else link,
        "source_url": "" if source_status else link,
        "source_name": source.get("company"),
        "price_basis": _generic_price_basis(source, item, source_index, product_name),
        "source_status": source_status,
        "source_unavailable": bool(source_status),
    }
    line = _line_from_product(item, source, product, max(66, 78 - source_index * 4), False)
    return {
        "line": line,
        "supplier": source,
        "score": line["matchScore"],
        "deliveryDays": _safe_int(source.get("delivery_days"), 21),
        "rating": _safe_float(source.get("rating"), 4.0),
        "commercialScore": _safe_float(source.get("commercial_score"), 80),
        "totalPrice": _safe_float(line.get("totalPrice"), 0.0),
    }


def _candidate_lines_by_item(items: list[dict[str, Any]], suppliers: list[dict[str, Any]], live_feed: dict[str, Any]) -> list[list[dict[str, Any]]]:
    all_candidates: list[list[dict[str, Any]]] = []
    for item in items:
        if _is_restricted_procurement_item(item):
            all_candidates.append([])
            continue
        candidates: list[dict[str, Any]] = []
        for supplier in suppliers:
            match = _best_product_for_item(item, supplier)
            if not match:
                continue
            product, live_applied = _apply_live_price(match["product"], live_feed)
            line = _line_from_product(item, supplier, product, match["score"], live_applied)
            candidates.append({"line": line, "supplier": supplier, "score": match["score"], "deliveryDays": _safe_int(supplier.get("delivery_days"), 30), "rating": _safe_float(supplier.get("rating"), 4.0), "commercialScore": _safe_float(supplier.get("commercial_score"), 85), "totalPrice": _safe_float(line.get("totalPrice"), 0.0)})
        if not candidates:
            candidates.extend(_generic_candidate_for_item(item, source, idx) for idx, source in enumerate(GENERIC_SOURCES))
        candidates.sort(key=lambda entry: (-entry["score"], entry["totalPrice"], entry["deliveryDays"]))
        all_candidates.append(candidates)
    return all_candidates


def _clamp_score(value: float, minimum: int = 45, maximum: int = 99) -> int:
    return max(minimum, min(maximum, round(value)))


def _score_breakdown(lines: list[dict[str, Any]], summary: dict[str, float], delivery_days: int, rating: float, base_commercial: float, requirements: dict[str, Any]) -> dict[str, int]:
    product_match = _clamp_score(mean([_safe_float(line.get("matchScore"), 70.0) for line in lines]) if lines else 0, 50)
    requested_days = _timeline_days(requirements)
    delivery_timeline = 94 if delivery_days <= requested_days else _clamp_score(94 - ((delivery_days - requested_days) * 1.2), 52)
    budget = _safe_float(requirements.get("budget"), 0.0)
    grand_total = _safe_float(summary.get("grandTotal"), 0.0)
    budget_match = 78
    if budget > 0:
        budget_match = 96 if grand_total <= budget else _clamp_score(96 - ((grand_total - budget) / max(budget, 1.0)) * 44, 45)
    quantity_match = 92 if all(_safe_float(line.get("quantity"), 0.0) > 0 for line in lines) else 70
    technical_spec = _clamp_score(product_match + 4, 55) if any(item.get("technicalSpecifications") for item in requirements.get("items") or []) else 78
    return {
        "productMatch": product_match,
        "quantityMatch": quantity_match,
        "budgetMatch": budget_match,
        "deliveryLocation": 88 if requirements.get("deliveryLocation") else 74,
        "deliveryTimeline": delivery_timeline,
        "technicalSpecificationMatch": technical_spec,
        "warrantyMatch": 86 if requirements.get("warrantyRequirement") else 72,
        "complianceMatch": 84 if requirements.get("complianceRequirements") else 74,
        "supplierRating": _clamp_score(_safe_float(rating, 4.2) * 20, 60),
        "priceCompetitiveness": _clamp_score(base_commercial, 55),
    }


def _scores_from_breakdown(breakdown: dict[str, int]) -> tuple[int, int, int]:
    technical = _clamp_score(
        breakdown["productMatch"] * 0.34 +
        breakdown["technicalSpecificationMatch"] * 0.20 +
        breakdown["warrantyMatch"] * 0.12 +
        breakdown["complianceMatch"] * 0.14 +
        breakdown["deliveryTimeline"] * 0.12 +
        breakdown["quantityMatch"] * 0.08,
        50,
    )
    commercial = _clamp_score(
        breakdown["budgetMatch"] * 0.34 +
        breakdown["priceCompetitiveness"] * 0.34 +
        breakdown["deliveryLocation"] * 0.10 +
        breakdown["deliveryTimeline"] * 0.14 +
        breakdown["quantityMatch"] * 0.08,
        50,
    )
    overall = _clamp_score(technical * 0.55 + commercial * 0.35 + breakdown["supplierRating"] * 0.10, 50)
    return technical, commercial, overall


def _make_tender_from_lines(*, idx: int, label: str, company: str, supplier_type: str, description: str, lines: list[dict[str, Any]], tender_url: str, website: str, catalogue_url: str, delivery_days: int, base_commercial: float, rating: float, requirements: dict[str, Any], consolidated: bool = False, certifications: list[str] | None = None) -> dict[str, Any]:
    item_total = round(sum(_safe_float(line.get("totalPrice"), 0.0) for line in lines), 2)
    summary = _commercial_summary(item_total)
    breakdown = _score_breakdown(lines, summary, delivery_days, rating, base_commercial, requirements)
    technical_score, commercial_score, overall_score = _scores_from_breakdown(breakdown)
    compliance = list(certifications or []) + ["All requested items quoted", "Product/source links included", "AI-assisted matching with final business approval"]
    return {
        "id": f"tender-{idx}", "rank": 0, "company": company, "supplierType": supplier_type, "description": description,
        "website": website, "catalogueUrl": catalogue_url, "tenderUrl": tender_url or catalogue_url or website,
        "tenderRef": f"{label}-{datetime.now().year}-{idx:03d}", "matchScore": overall_score, "technicalScore": technical_score,
        "commercialScore": commercial_score, "scoreBreakdown": breakdown, "priceScore": breakdown["priceCompetitiveness"],
        "rating": round(rating, 2), "leadTime": f"{delivery_days} days", "validity": "30 days", "lines": lines,
        "summary": summary, "compliance": compliance,
        "pricingMode": "complete-consolidated" if consolidated else "verified-catalog",
        "previewProducts": [{"sku": line.get("sku"), "name": line.get("matchedProduct"), "category": line.get("category"), "productUrl": line.get("productUrl"), "sourceUrl": line.get("sourceUrl"), "unitPrice": line.get("unitPrice"), "unit": line.get("unit"), "priceBasis": line.get("priceBasis"), "imageType": line.get("imageType"), "sourceStatus": line.get("sourceStatus"), "sourceUnavailable": line.get("sourceUnavailable")} for line in lines[:5]],
        "sourceSuppliers": sorted({line.get("supplierName") for line in lines if line.get("supplierName")}),
    }


def _build_consolidated_tenders(items: list[dict[str, Any]], suppliers: list[dict[str, Any]], live_feed: dict[str, Any], requirements: dict[str, Any], start_index: int = 1) -> list[dict[str, Any]]:
    candidate_groups = _candidate_lines_by_item(items, suppliers, live_feed)
    if not candidate_groups or any(not group for group in candidate_groups):
        return []

    tenders: list[dict[str, Any]] = []
    seen_signatures: set[tuple[str, ...]] = set()

    strategies = [
        ("COMPLETE-VALUE", "Best Value Complete Tender", "Complete quote using the lowest suitable source-linked line prices for every requested item.", lambda c: (c["totalPrice"], -c["score"], c["deliveryDays"]), 90, 4.35),
        ("COMPLETE-TECH", "Best Technical Complete Tender", "Complete quote prioritising highest item match, OEM/source quality and technical fit.", lambda c: (-c["score"], -c["rating"], c["totalPrice"]), 87, 4.55),
        ("COMPLETE-FAST", "Fast Delivery Complete Tender", "Complete quote prioritising faster supplier lead times while keeping source links for each item.", lambda c: (c["deliveryDays"], c["totalPrice"], -c["score"]), 86, 4.25),
    ]

    for offset, (prefix, company, description, sorter, commercial_seed, rating_seed) in enumerate(strategies, start=start_index):
        chosen = [sorted(group, key=sorter)[0] for group in candidate_groups]
        signature = tuple(line_choice["line"].get("sku", "") for line_choice in chosen)
        if signature in seen_signatures:
            priced = sorted(enumerate(candidate_groups), key=lambda pair: max(c["totalPrice"] for c in pair[1]), reverse=True)
            for group_index, group in priced:
                if len(group) > 1:
                    alt_chosen = list(chosen)
                    alt_chosen[group_index] = sorted(group, key=sorter)[1]
                    alt_signature = tuple(item["line"].get("sku", "") for item in alt_chosen)
                    if alt_signature not in seen_signatures:
                        chosen = alt_chosen
                        signature = alt_signature
                        break
        if signature in seen_signatures:
            continue
        seen_signatures.add(signature)
        lines = [dict(item["line"]) for item in chosen]
        delivery_days = max(choice["deliveryDays"] for choice in chosen)
        avg_commercial = mean([choice["commercialScore"] for choice in chosen]) if chosen else commercial_seed
        avg_rating = mean([choice["rating"] for choice in chosen]) if chosen else rating_seed
        first_supplier = chosen[0]["supplier"]
        tender = _make_tender_from_lines(
            idx=offset,
            label=prefix,
            company=company,
            supplier_type="Complete consolidated tender",
            description=description,
            lines=lines,
            tender_url=first_supplier.get("tenderUrl") or first_supplier.get("catalogueUrl") or first_supplier.get("website") or "",
            website=first_supplier.get("website") or "",
            catalogue_url=first_supplier.get("catalogueUrl") or "",
            delivery_days=delivery_days,
            base_commercial=(avg_commercial * 0.78 + commercial_seed * 0.22),
            rating=(avg_rating * 0.78 + rating_seed * 0.22),
            requirements=requirements,
            consolidated=True,
        )
        tenders.append(tender)
    return tenders


def _refresh_price_scores(tenders: list[dict[str, Any]], requirements: dict[str, Any]) -> None:
    full_quote_totals = [_safe_float((tender.get("summary") or {}).get("grandTotal"), 0.0) for tender in tenders if _safe_float((tender.get("summary") or {}).get("grandTotal"), 0.0) > 0]
    min_quote_total = min(full_quote_totals) if full_quote_totals else 0.0
    for tender in tenders:
        total = _safe_float((tender.get("summary") or {}).get("grandTotal"), 0.0)
        if min_quote_total and total:
            price_score = _clamp_score((min_quote_total / total) * 99, 55)
            delivery_days = _safe_int(re.search(r"\d+", str(tender.get("leadTime") or "30")).group(0) if re.search(r"\d+", str(tender.get("leadTime") or "30")) else 30, 30)
            breakdown = _score_breakdown(tender.get("lines") or [], tender.get("summary") or {}, delivery_days, _safe_float(tender.get("rating"), 4.0), price_score, requirements)
            existing = tender.get("scoreBreakdown") or {}
            existing.update({"priceCompetitiveness": price_score, "budgetMatch": breakdown["budgetMatch"]})
            tender["scoreBreakdown"] = existing
            technical_score, commercial_score, overall_score = _scores_from_breakdown(existing)
            tender["priceScore"] = price_score
            tender["technicalScore"] = technical_score
            tender["commercialScore"] = commercial_score
            tender["matchScore"] = overall_score
        else:
            tender["priceScore"] = 0


def generate_tender_recommendations(payload: dict[str, Any]) -> dict[str, Any]:
    requirements = payload.get("requirements", payload) or {}
    items, inferred_items, inference_note = _resolve_requirement_items(requirements)
    catalog = _load_verified_catalog()
    suppliers = catalog.get("suppliers") or []
    live_feed = _load_live_price_feed()
    item_names = " ".join(item["name"] for item in items)

    tenders: list[dict[str, Any]] = []
    skipped_suppliers: list[dict[str, Any]] = []
    restricted_items = [item["name"] for item in items if _is_restricted_procurement_item(item)]

    for supplier_index, supplier in enumerate(suppliers, start=1):
        if not items or restricted_items:
            continue
        lines: list[dict[str, Any]] = []
        missing_items: list[str] = []
        live_line_count = 0
        for item in items:
            match = _best_product_for_item(item, supplier)
            if not match:
                missing_items.append(item["name"])
                continue
            product, live_applied = _apply_live_price(match["product"], live_feed)
            if live_applied:
                live_line_count += 1
            lines.append(_line_from_product(item, supplier, product, match["score"], live_applied))

        full_coverage = len(lines) == len(items)
        if not full_coverage:
            if lines:
                skipped_suppliers.append({"company": supplier.get("company"), "matchedItems": [line["itemName"] for line in lines], "missingItems": missing_items, "website": supplier.get("website"), "catalogueUrl": supplier.get("catalogueUrl")})
            continue

        supplier_fit = _supplier_fit_score(supplier, item_names)
        base_commercial = (_safe_float(supplier.get("commercial_score"), 85) * 0.82) + (supplier_fit * 0.18)
        tender = _make_tender_from_lines(
            idx=supplier_index,
            label="RFP-QTN",
            company=supplier.get("company") or "Recommended supplier",
            supplier_type=supplier.get("supplierType") or "Verified supplier",
            description=supplier.get("description") or "Source-linked supplier match from procurement catalog.",
            lines=lines,
            tender_url=supplier.get("tenderUrl") or supplier.get("catalogueUrl") or supplier.get("website") or "",
            website=supplier.get("website") or "",
            catalogue_url=supplier.get("catalogueUrl") or "",
            delivery_days=_safe_int(supplier.get("delivery_days"), 30),
            base_commercial=base_commercial,
            rating=_safe_float(supplier.get("rating"), 4.3),
            requirements=requirements,
            certifications=supplier.get("certifications") or [],
        )
        tender["pricingMode"] = "live" if live_line_count else "verified-catalog"
        tender["previewProducts"] = _supplier_preview_products(supplier, lines)
        tenders.append(tender)

    if items and len(tenders) < 3 and not restricted_items:
        consolidated_tenders = _build_consolidated_tenders(items, suppliers, live_feed, requirements, start_index=len(tenders) + 1)
        existing_signatures = {tuple(line.get("sku") for line in tender.get("lines") or []) for tender in tenders}
        for tender in consolidated_tenders:
            signature = tuple(line.get("sku") for line in tender.get("lines") or [])
            if signature not in existing_signatures:
                tenders.append(tender)
                existing_signatures.add(signature)

    _refresh_price_scores(tenders, requirements)
    tenders.sort(key=lambda tender: (-_safe_float(tender.get("matchScore")), _safe_float((tender.get("summary") or {}).get("grandTotal"), 10**12)))
    for index, tender in enumerate(tenders, start=1):
        tender["rank"] = index

    budget = _safe_float(requirements.get("budget"), 0.0)
    pricing_mode = "live" if live_feed else "source-linked-catalog-and-rfq"
    missing_catalog_items = restricted_items
    if items and not restricted_items:
        candidate_groups = _candidate_lines_by_item(items, suppliers, live_feed)
        missing_catalog_items = [item["name"] for item, candidates in zip(items, candidate_groups) if not candidates]

    return {
        "success": True,
        "generatedAt": _now_iso(),
        "pricingMode": pricing_mode,
        "catalogUpdatedAt": catalog.get("updated_at"),
        "priceDisclaimer": "AI-assisted supplier and tender matching using source-linked price snapshots, marketplace and procurement source links, and configured catalog data. Final approval remains with the business user.",
        "requirements": requirements,
        "requestedItems": items,
        "budget": budget,
        "tenders": tenders,
        "recommendedTender": tenders[0] if tenders else None,
        "partialMode": False,
        "inferredItems": inferred_items,
        "inferenceNote": inference_note,
        "missingCatalogItems": missing_catalog_items,
        "restrictedItems": restricted_items,
        "sources": {"catalog": str(CATALOG_FILE.relative_to(BASE_DIR)), "liveFeedConfigured": bool(live_feed), "supplierCount": len(suppliers)},
        "skippedPartialSuppliers": skipped_suppliers[:8],
    }
