import os
import json
import time
import re
try:
    import google.generativeai as genai
except Exception:  # Optional dependency for local offline mode
    genai = None
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

# --- Configuration ---
# Directly using the requested model version
MODEL_NAME = "models/gemini-2.5-flash"
SUMMARY_DIR = Path("rfp_summary")  # Directory to save JSONs

# --- The Detailed Prompt ---
PARSER_PROMPT = """
Act as an expert B2B Proposal Manager. Analyze the attached RFP document and extract critical information for downstream agents.
And only OEM Products are required for the next step and for the quotation 

**Goal:**
1. **Sales Agent:** Needs 'submission_due_date' to check the 3-month window.
2. **Technical Agent:** Needs 'scope_of_supply'. 
   - **CRITICAL:** Consolidate duplicate items. If a product (e.g., "11kV Cable") appears multiple times, list it **ONLY ONCE**.
   - **Detail:** Aggregate the most detailed technical specifications found anywhere in the document for that item.
   - **Naming:** Assign a clear 'product_category' (e.g., Wiring, Switch, Transformer) to each item.
3. **Pricing Agent:** Needs 'testing_requirements' to estimate service costs.

**Output strictly valid JSON with this schema:**
{
  "metadata": {
    "rfp_title": "String",
    "rfp_reference_number": "String",
    "issuing_authority": "String (Name of the company or organization issuing the tender)",
    "submission_due_date": "YYYY-MM-DD", 
    "is_due_within_3_months": "Boolean"
  },
  "scope_of_supply": [
    {
      "product_category": "String (e.g., Wiring, Switchgear, Transformer)",
      "item_name": "String (e.g., 11kV XLPE Cable - 3 Core)",
      "quantity": "Number or String (Sum of all quantities if repeated)",
      "units": "String (e.g., meters, nos)",
      "technical_parameters": {
        "voltage_grade": "String",
        "core_count": "String",
        "conductor_material": "String",
        "insulation_type": "String",
        "armoring": "String",
        "applicable_standards": "String"
      }
    }
  ],
  "testing_requirements": {
    "type_tests_required": ["List of test names"],
    "acceptance_tests_required": ["List of test names"],
    "routine_tests_required": ["List of test names"]
  }
}

**Instructions:**
- **Unique Items Only:** Do not list the same product twice. Merge them.
- **Clean Output:** Ensure 'item_name' is descriptive and 'product_category' is generic.
- If specific fields are not found, return null. 
- Do not use markdown blocks.
"""

# --- Helper: Save JSON with Issuing Authority Name ---
def save_summary_json(rfp_data):
    """
    Saves the parsed data to a JSON file named after the Issuing Authority.
    """
    try:
        SUMMARY_DIR.mkdir(parents=True, exist_ok=True)
        
        # Extract Issuing Authority for filename
        authority = rfp_data.get("metadata", {}).get("issuing_authority", "Unknown_Authority")
        ref_no = rfp_data.get("metadata", {}).get("rfp_reference_number", "NoRef")
        
        # Clean filename (remove special chars)
        clean_name = re.sub(r'[^\w\s-]', '', authority).strip().replace(' ', '_')
        clean_ref = re.sub(r'[^\w\s-]', '', ref_no).strip().replace(' ', '_')
        
        # Limit length to avoid OS errors
        filename = f"{clean_name}_{clean_ref}.json"[:100]
        if not filename.endswith(".json"):
             filename += ".json"
             
        filepath = SUMMARY_DIR / filename
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(rfp_data, f, indent=2, ensure_ascii=False)
            
        print(f"💾 Saved Summary to: {filepath}")
        return str(filepath)
    except Exception as e:
        print(f"⚠️ Error saving JSON summary: {e}")
        return None

# --- Core Parsing Functions ---

def parse_rfp_with_gemini(text_content):
    """
    Parses raw text content using Gemini (Text Mode).
    """
    if not API_KEY:
        print("❌ Error: GEMINI_API_KEY is missing.")
        return None

    if genai is None:
        print("⚠️ google-generativeai is not installed; falling back to text extraction/parser mode.")
        return None

    genai.configure(api_key=API_KEY)
    
    try:
        model = genai.GenerativeModel(
            model_name=MODEL_NAME,
            generation_config={"response_mime_type": "application/json"}
        )
        
        full_prompt = f"{PARSER_PROMPT}\n\n**RFP Document Text:**\n\n{text_content}"
        
        print(f"🤖 (Text Mode) Calling {MODEL_NAME}...")
        response = model.generate_content(full_prompt)
        
        data = json.loads(response.text)
        save_summary_json(data) # Auto-save
        return data
        
    except Exception as e:
        print(f"❌ Error parsing text with Gemini: {e}")
        return None

def parse_rfp_from_pdf(pdf_path):
    """
    Parses an RFP PDF using Gemini's File API (Primary Mode).
    """
    if not API_KEY:
        print("❌ Error: GEMINI_API_KEY is missing.")
        return None

    if genai is None:
        print("⚠️ google-generativeai is not installed; falling back to text extraction/parser mode.")
        return None

    genai.configure(api_key=API_KEY)
    print(f"🤖 Parser Agent using model: {MODEL_NAME}")

    sample_file = None
    try:
        pdf_path_str = str(pdf_path)
        
        # 1. Upload File
        print(f"📤 Uploading to Gemini: {Path(pdf_path_str).name}...")
        sample_file = genai.upload_file(path=pdf_path_str, display_name="RFP Doc")
        
        # 2. Wait for Processing
        while sample_file.state.name == "PROCESSING":
            time.sleep(1)
            sample_file = genai.get_file(sample_file.name)
            
        if sample_file.state.name == "FAILED":
            raise ValueError("File processing failed on Google servers.")

        print("✅ File ready: ACTIVE")

        # 3. Generate Content
        print(f"🤖 Calling {MODEL_NAME} to analyze the RFP...")
        model = genai.GenerativeModel(
            model_name=MODEL_NAME,
            generation_config={"response_mime_type": "application/json"}
        )
        
        response = model.generate_content([sample_file, PARSER_PROMPT])
        
        # 4. Parse & Save
        rfp_data = json.loads(response.text)
        save_summary_json(rfp_data) # Auto-save
        
        return rfp_data

    except Exception as e:
        print(f"❌ Error processing RFP with Gemini: {e}")
        return None
        
    finally:
        # 5. Cleanup Cloud File
        if sample_file:
            try:
                genai.delete_file(sample_file.name)
                print("🧹 Cloud file cleaned up.")
            except Exception:
                pass

# --- Wrapper Function ---
def parse_rfp_text(input_data):
    """
    Wrapper function required by app.py imports.
    """
    # Check if input looks like a valid file path
    is_file = False
    try:
        if len(str(input_data)) < 255:  
            path_obj = Path(input_data)
            if path_obj.exists() and path_obj.suffix.lower() == '.pdf':
                is_file = True
    except Exception:
        pass

    if is_file:
        return parse_rfp_from_pdf(input_data)
    else:
        return parse_rfp_with_gemini(input_data)