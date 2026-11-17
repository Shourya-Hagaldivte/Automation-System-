import json
import os
import re
from typing import Dict, List, Any, Optional
from difflib import SequenceMatcher

class ProductMatcherAgent:
    def __init__(self, catalog_path: str = "data/products.json"):
        self.catalog = self.load_product_catalog(catalog_path)

    def load_product_catalog(self, catalog_path: str) -> List[Dict]:
        try:
            with open(catalog_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, list): return data
            if isinstance(data, dict):
                return data.get('polycab_sku_master_list') or data.get('products') or []
            return []
        except Exception as e:
            print(f"❌ Error loading catalog: {e}")
            return []

    # --- HELPERS ---
    def extract_all_numeric_vals(self, text: str, unit_regex: str) -> List[float]:
        """Finds ALL matching numbers (e.g. '2.5', '4.0', '6.0' in one line)."""
        if not text: return []
        pattern = r'(\d+\.?\d*)\s*' + unit_regex
        matches = re.findall(pattern, str(text), re.IGNORECASE)
        return [float(m) for m in matches]

    def extract_single_val(self, text: str, unit_regex: str) -> Optional[float]:
        vals = self.extract_all_numeric_vals(text, unit_regex)
        return vals[0] if vals else None

    def extract_cores(self, text: str) -> Optional[float]:
        text = str(text).lower()
        if 'single core' in text or '1 core' in text: return 1.0
        match = re.search(r'(\d+\.?\d*)\s*(?:core|c\b)', text)
        if match: return float(match.group(1))
        return None 

    def calculate_text_similarity(self, a: str, b: str) -> float:
        return SequenceMatcher(None, str(a).lower(), str(b).lower()).ratio()

    # --- SCORING ENGINE ---
    def score_product(self, rfp_item: Dict, product: Dict) -> Dict:
        score = 0
        reasons = []
        
        # Flatten Data
        rfp_name = rfp_item.get('item_name', '')
        rfp_tech = rfp_item.get('technical_parameters', {})
        rfp_cat = rfp_item.get('product_category', '')
        
        # Combine all RFP text for search
        rfp_full = f"{rfp_name} {json.dumps(rfp_tech)} {rfp_cat}".lower()
        
        prod_desc = product.get('item_description', '')
        prod_specs = product.get('technical_specifications', {})
        prod_full = f"{prod_desc} {json.dumps(prod_specs)}".lower()

        # 1. KEYWORDS (Boost if tags match)
        prod_tags = [t.lower() for t in product.get('match_tags', [])]
        matched_tags = [t for t in prod_tags if t in rfp_full]
        if matched_tags:
            score += min(len(matched_tags) * 5, 20)
            reasons.append(f"Tags: {', '.join(matched_tags)}")

        # 2. CATEGORY LOGIC
        
        # === A. CABLES & WIRES ===
        if any(x in rfp_name.lower() for x in ['cable', 'wire', 'wiring']):
            # Size Check (The most important factor)
            rfp_sizes = self.extract_all_numeric_vals(rfp_full, r'(?:sq\.?mm|sq\s?mm)')
            prod_size = self.extract_single_val(prod_full, r'(?:sq\.?mm|sq\s?mm)')
            
            if prod_size and rfp_sizes:
                # If product size matches ANY size listed in the RFP item line
                if any(abs(s - prod_size) < 0.1 for s in rfp_sizes):
                    score += 50
                    reasons.append(f"✓ Size: {prod_size} sq.mm found in requirements")
                else:
                    return {'score': 0, 'reasons': ['❌ Size mismatch']}
            
            # Core Check (Forgiving)
            rfp_core = self.extract_cores(rfp_full)
            prod_core = self.extract_cores(prod_full)
            
            if rfp_core and prod_core:
                if rfp_core == prod_core:
                    score += 20
                    reasons.append(f"✓ Cores: {rfp_core}")
                else:
                    # If RFP asks for 3.5C and product is 1C, strict fail
                    return {'score': 0, 'reasons': ['❌ Core mismatch']}
            elif prod_core == 1.0:
                # If RFP doesn't say core count, and product is 1 Core (standard wire), assume match
                score += 10
                reasons.append("✓ Assumed Single Core match")

            # Material Check
            if 'aluminium' in rfp_full and 'aluminium' not in prod_full: return {'score': 0, 'reasons': ['❌ Material mismatch']}
            if 'copper' in rfp_full and 'copper' not in prod_full: return {'score': 0, 'reasons': ['❌ Material mismatch']}

        # === B. MCB / MCCB / SWITCHGEAR ===
        elif any(x in rfp_name.lower() for x in ['mcb', 'mccb', 'breaker', 'isolator']):
            rfp_amps = self.extract_all_numeric_vals(rfp_full, r'(?:a|amp)\b')
            prod_amp = self.extract_single_val(prod_full, r'(?:a|amp)\b')
            
            if prod_amp and rfp_amps:
                if any(a == prod_amp for a in rfp_amps):
                    score += 40
                    reasons.append(f"✓ Rating: {prod_amp}A")
            
            # Pole Check
            if 'tpn' in rfp_full and 'tpn' in prod_full: score += 20
            elif 'spn' in rfp_full and 'spn' in prod_full: score += 20
            elif 'dp' in rfp_full and 'dp' in prod_full: score += 20
            elif 'sp' in rfp_full and 'sp' in prod_full: score += 20

        # === C. LIGHTS / FANS ===
        elif 'fan' in rfp_name.lower():
            rfp_sw = self.extract_single_val(rfp_full, r'mm')
            prod_sw = self.extract_single_val(prod_full, r'mm')
            if rfp_sw and prod_sw and rfp_sw == prod_sw:
                score += 50
                reasons.append(f"✓ Sweep: {rfp_sw}mm")
        
        elif 'light' in rfp_name.lower() or 'led' in rfp_name.lower():
            rfp_watt = self.extract_single_val(rfp_full, r'w\b')
            prod_watt = self.extract_single_val(prod_full, r'w\b')
            if rfp_watt and prod_watt:
                if rfp_watt == prod_watt:
                     score += 50
                     reasons.append(f"✓ Wattage: {rfp_watt}W")
                elif abs(rfp_watt - prod_watt) <= 2:
                     score += 30
                     reasons.append(f"~ Close Wattage: {prod_watt}W")

        # 3. TEXT SIMILARITY (Tie-Breaker)
        sim = self.calculate_text_similarity(rfp_name, prod_desc)
        score += int(sim * 15)

        return {"score": min(score, 100), "reasons": reasons}

    def process_rfp(self, rfp_file_path: str):
        print(f"\n🔍 Loading RFP: {rfp_file_path}")
        try:
            with open(rfp_file_path, 'r', encoding='utf-8') as f:
                rfp_data = json.load(f)
        except Exception as e:
            print(f"❌ Error loading RFP: {e}")
            return None

        scope_items = rfp_data.get('scope_of_supply', [])
        matched_items = []

        print(f"📋 Processing {len(scope_items)} items...")

        for item in scope_items:
            best_match = None
            best_score = 0
            best_reasons = []

            for prod in self.catalog:
                res = self.score_product(item, prod)
                if res['score'] > best_score:
                    best_score = res['score']
                    best_match = prod
                    best_reasons = res['reasons']

            if best_score >= 40:
                print(f"✅ MATCH: {item.get('item_name')[:30]}... -> {best_match.get('sku_id')} ({best_score})")
                matched_items.append({
                    "rfp_item_name": item.get('item_name'),
                    "rfp_quantity": item.get('quantity'),
                    "rfp_units": item.get('units'),
                    "matched_sku_id": best_match.get('sku_id'),
                    "matched_product": best_match.get('item_description'),
                    "confidence_score": best_score,
                    "match_reasons": best_reasons,
                    "technical_specs": best_match.get('technical_specifications', {})
                })

        final_output = {
            "metadata": {
                "rfp_title": rfp_data.get("metadata", {}).get("rfp_title", "Unknown"),
                "total_rfp_items": len(scope_items),
                "matched_items": len(matched_items),
                "match_percentage": f"{(len(matched_items)/len(scope_items))*100:.1f}%" if len(scope_items) > 0 else "0%"
            },
            "matches": matched_items
        }
        return final_output

    def save_results(self, results, filename="matching_report.json"):
        os.makedirs("rfp_summary", exist_ok=True)
        path = os.path.join("rfp_summary", filename)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2)
        print(f"\n💾 Results saved to: {path}")

# Wrapper functions for compatibility with app.py
def match_rfp_with_products(rfp_file_path: str, catalog_path: str = "data/products.json") -> Dict:
    """
    Wrapper function to match RFP with products.
    
    Args:
        rfp_file_path: Path to the RFP JSON file
        catalog_path: Path to the product catalog JSON file
        
    Returns:
        Dictionary with matching results
    """
    agent = ProductMatcherAgent(catalog_path=catalog_path)
    return agent.process_rfp(rfp_file_path)


def save_matching_results(results: Dict, filename: str = "matching_report.json") -> str:
    """
    Wrapper function to save matching results.
    
    Args:
        results: Matching results dictionary
        filename: Output filename
        
    Returns:
        Path to saved file
    """
    os.makedirs("rfp_summary", exist_ok=True)
    path = os.path.join("rfp_summary", filename)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n💾 Results saved to: {path}")
    return path


if __name__ == "__main__":
    rfp_file = "rfp_summary/Indian_Institute_of_Technology_BHU_Varanasi_IITBHUIWDET-072025-26405.json"
    
    agent = ProductMatcherAgent(catalog_path="data/products.json")
    if os.path.exists(rfp_file):
        matches = agent.process_rfp(rfp_file)
        agent.save_results(matches)
    else:
        print("❌ RFP file not found.")