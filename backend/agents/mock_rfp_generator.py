"""
Mock RFP Data Generator for Testing

This module generates mock RFP data to test the identification agent
without requiring actual web scraping.
"""

from datetime import datetime, timedelta
import random


def generate_mock_rfps(count: int = 10) -> list:
    """
    Generate mock RFP data for testing purposes.
    
    Args:
        count: Number of mock RFPs to generate
        
    Returns:
        List of mock RFP dictionaries
    """
    
    # Sample data pools
    titles = [
        "Supply of LT Cables and Wires for Metro Station Project",
        "HT Cable Supply for Power Distribution Network",
        "Instrumentation Cables for Refinery Project",
        "Solar Plant Cable Requirements",
        "Railway Electrification Cable Procurement",
        "Underground Cable Installation for Smart City Project",
        "Control Cables for Industrial Automation",
        "XLPE Cables for Substation Modernization",
        "Fire Resistant Cables for Hospital Complex",
        "Armoured Cables for Mining Operations",
        "AI-Powered Energy Management System",
        "Cloud Infrastructure for Government Services",
        "Cable Management System Software Development",
        "Renewable Energy Cable Solutions"
    ]
    
    sources = [
        "Mumbai Metro Rail Corporation",
        "Delhi Power Corporation",
        "Indian Oil Corporation",
        "NTPC Solar Division",
        "Railway Electrification Corporation",
        "Smart City Mission Office",
        "Maharashtra State Electricity Board",
        "Power Grid Corporation",
        "Coal India Limited",
        "Reliance Infrastructure"
    ]
    
    categories = [
        ["LT Cables", "Control Cables", "Instrumentation Wires"],
        ["HT Cables", "XLPE Cables"],
        ["Instrumentation Cables", "Control Cables"],
        ["Solar DC Cables", "LT Cables"],
        ["Railway Cables", "Overhead Wires"],
        ["Underground Cables", "Street Lighting Cables"],
        ["Control Cables", "Signal Cables"],
        ["XLPE Cables", "Power Cables"],
        ["Fire Resistant Cables", "FRLS Cables"],
        ["Armoured Cables", "Mining Cables"]
    ]
    
    descriptions = [
        "Supply and installation of cables as per IS standards for metro project",
        "Procurement of high voltage cables for power distribution network expansion",
        "Instrumentation and control cables for refinery automation upgrade",
        "Solar grade cables for renewable energy project implementation",
        "Railway electrification cables meeting Indian Railway standards",
        "Underground cable network for smart city infrastructure development",
        "Industrial grade control cables for factory automation systems",
        "XLPE insulated power cables for electrical substation modernization",
        "Fire resistant and low smoke cables for healthcare facility",
        "Heavy duty armoured cables for underground mining operations"
    ]
    
    mock_rfps = []
    current_date = datetime.now()
    
    for i in range(count):
        # Random due date within next 120 days (some will be filtered out)
        days_ahead = random.randint(15, 120)
        due_date = current_date + timedelta(days=days_ahead)
        
        # Random estimated value
        value_lakhs = random.randint(500, 5000)
        value_crores = value_lakhs / 100
        
        # Create mock RFP
        rfp = {
            'rfp_id': f'RFP-2025-{1000 + i}',
            'title': random.choice(titles),
            'description': random.choice(descriptions),
            'scope': random.choice(descriptions)[:200],
            'due_date': due_date.strftime('%Y-%m-%d'),
            'source': random.choice(sources),
            'estimated_value': f'₹{value_crores:.2f} Crores' if value_crores >= 1 else f'₹{value_lakhs} Lakhs',
            'product_categories': random.choice(categories),
            'priority': random.choice(['high', 'medium', 'low']),
            'source_url': f'https://example.com/rfp/{1000 + i}'
        }
        
        # Add keywords based on title and categories
        keywords = []
        if 'AI' in rfp['title'] or 'artificial' in rfp['title'].lower():
            keywords.extend(['AI', 'artificial intelligence'])
        if 'Cloud' in rfp['title'] or 'cloud' in rfp['title'].lower():
            keywords.append('cloud')
        if any(term in rfp['title'].lower() for term in ['cable', 'wire', 'xlpe', 'pvc']):
            keywords.extend(['cables', 'wires'])
        if 'Solar' in rfp['title']:
            keywords.append('solar')
        if 'Metro' in rfp['title'] or 'Railway' in rfp['title']:
            keywords.append('metro')
            
        rfp['keywords'] = keywords + [cat.lower() for cat in rfp['product_categories']]
        
        mock_rfps.append(rfp)
    
    return mock_rfps


def create_mock_html_page(rfps: list) -> str:
    """
    Create a mock HTML page containing RFP listings.
    
    Args:
        rfps: List of RFP dictionaries
        
    Returns:
        HTML string
    """
    html = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>RFP Listings</title>
    <style>
        .rfp-card {
            border: 1px solid #ccc;
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
        }
        .rfp-title { font-weight: bold; font-size: 1.2em; }
        .rfp-due-date { color: #d9534f; }
        .rfp-value { color: #5cb85c; font-weight: bold; }
    </style>
</head>
<body>
    <h1>Current RFP Listings</h1>
    <div class="rfp-list">
"""
    
    for rfp in rfps:
        html += f"""
        <div class="rfp-card">
            <div class="rfp-title">{rfp['title']}</div>
            <div class="rfp-id">RFP ID: {rfp['rfp_id']}</div>
            <div class="rfp-description">{rfp['description']}</div>
            <div class="rfp-source">Source: {rfp['source']}</div>
            <div class="rfp-due-date">Due Date: {rfp['due_date']}</div>
            <div class="rfp-value">Estimated Value: {rfp['estimated_value']}</div>
            <div class="rfp-categories">Categories: {', '.join(rfp['product_categories'])}</div>
        </div>
"""
    
    html += """
    </div>
</body>
</html>
"""
    return html


if __name__ == "__main__":
    # Generate mock data
    mock_rfps = generate_mock_rfps(15)
    
    print("Generated Mock RFPs:")
    print("=" * 60)
    for rfp in mock_rfps:
        print(f"\n{rfp['rfp_id']}: {rfp['title']}")
        print(f"  Due: {rfp['due_date']}")
        print(f"  Value: {rfp['estimated_value']}")
        print(f"  Source: {rfp['source']}")
    
    # Create HTML file
    html_content = create_mock_html_page(mock_rfps)
    with open('mock_rfp_page.html', 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print("\n\nMock HTML page created: mock_rfp_page.html")
