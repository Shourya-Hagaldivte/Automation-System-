"""
RFP Identification and Selection Agent

This module automates the initial stage of the RFP response process by:
1. Identifying RFPs due in the next 3 months
2. Summarizing each RFP
3. Selecting the most promising RFP based on heuristics
"""

import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import re
from dateutil import parser


def process_rfps(url_list: List[str]) -> Dict:
    """
    Process a list of URLs to identify, summarize, and select RFPs.
    
    Args:
        url_list: List of URLs to scrape for RFP information
        
    Returns:
        Dictionary containing:
            - all_upcoming_rfps: List of all RFPs due in next 3 months
            - selected_rfp: Single most promising RFP selected for response
    """
    current_date = datetime.now()
    cutoff_date = current_date + timedelta(days=90)
    
    all_upcoming_rfps = []
    
    # Process each URL
    for url in url_list:
        rfps = scrape_rfps_from_url(url)
        
        # Filter RFPs by date (next 3 months)
        for rfp in rfps:
            if rfp.get('due_date'):
                try:
                    due_date = parse_date(rfp['due_date'])
                    
                    # Check if due date is within next 90 days
                    if current_date <= due_date <= cutoff_date:
                        # Add days remaining
                        rfp['days_remaining'] = (due_date - current_date).days
                        rfp['source_url'] = url
                        all_upcoming_rfps.append(rfp)
                except Exception as e:
                    print(f"Error parsing date for RFP: {e}")
                    continue
    
    # Select the most promising RFP
    selected_rfp = select_best_rfp(all_upcoming_rfps)
    
    return {
        'all_upcoming_rfps': all_upcoming_rfps,
        'selected_rfp': selected_rfp,
        'total_count': len(all_upcoming_rfps),
        'scan_date': current_date.isoformat()
    }


def scrape_rfps_from_url(url: str) -> List[Dict]:
    """
    Scrape RFP information from a given URL.
    
    Args:
        url: URL to scrape
        
    Returns:
        List of RFP dictionaries containing title, description, due_date, etc.
    """
    rfps = []
    
    try:
        # Send HTTP request
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        # Parse HTML content
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # TODO: PLACEHOLDER - Replace with actual scraping logic
        # The actual implementation will depend on the website structure
        # Example patterns to look for:
        
        # Pattern 1: Look for RFP cards/containers
        rfp_containers = soup.find_all(['div', 'article', 'section'], 
                                       class_=re.compile(r'rfp|tender|proposal', re.I))
        
        for container in rfp_containers:
            rfp = extract_rfp_details(container)
            if rfp:
                rfps.append(rfp)
        
        # Pattern 2: Look for table rows with RFP information
        table_rows = soup.find_all('tr')
        for row in table_rows:
            rfp = extract_rfp_from_row(row)
            if rfp:
                rfps.append(rfp)
        
        # Pattern 3: Look for list items
        list_items = soup.find_all('li', class_=re.compile(r'rfp|tender', re.I))
        for item in list_items:
            rfp = extract_rfp_from_list(item)
            if rfp:
                rfps.append(rfp)
                
    except requests.RequestException as e:
        print(f"Error fetching URL {url}: {e}")
    except Exception as e:
        print(f"Error processing URL {url}: {e}")
    
    return rfps


def extract_rfp_details(container) -> Optional[Dict]:
    """
    Extract RFP details from a container element.
    
    Args:
        container: BeautifulSoup element containing RFP information
        
    Returns:
        Dictionary with RFP details or None if extraction fails
    """
    try:
        # TODO: PLACEHOLDER - Replace with actual extraction logic
        # This will vary based on the website structure
        
        rfp = {}
        
        # Extract title
        title_elem = container.find(['h1', 'h2', 'h3', 'h4', 'h5'], 
                                    class_=re.compile(r'title|name|heading', re.I))
        if not title_elem:
            title_elem = container.find(['h1', 'h2', 'h3', 'h4', 'h5'])
        rfp['title'] = title_elem.get_text(strip=True) if title_elem else 'Untitled RFP'
        
        # Extract description/scope
        desc_elem = container.find(['p', 'div'], class_=re.compile(r'desc|summary|scope', re.I))
        rfp['description'] = desc_elem.get_text(strip=True) if desc_elem else 'No description available'
        rfp['scope'] = rfp['description'][:200]  # First 200 chars as scope
        
        # Extract due date
        date_elem = container.find(['span', 'time', 'div'], 
                                   class_=re.compile(r'date|due|deadline', re.I))
        if not date_elem:
            date_elem = container.find('time')
        rfp['due_date'] = date_elem.get_text(strip=True) if date_elem else None
        
        # Extract value/budget if available
        value_elem = container.find(['span', 'div'], 
                                    class_=re.compile(r'value|budget|amount|price', re.I))
        rfp['estimated_value'] = value_elem.get_text(strip=True) if value_elem else 'Not specified'
        
        # Extract RFP ID if available
        id_elem = container.find(['span', 'div'], 
                                 class_=re.compile(r'id|number|reference', re.I))
        rfp['rfp_id'] = id_elem.get_text(strip=True) if id_elem else f"RFP-{hash(rfp['title']) % 10000}"
        
        # Extract categories/keywords
        rfp['keywords'] = extract_keywords(rfp['title'] + ' ' + rfp['description'])
        
        # Calculate priority based on keywords
        rfp['priority'] = calculate_priority(rfp)
        
        return rfp if rfp.get('due_date') else None
        
    except Exception as e:
        print(f"Error extracting RFP details: {e}")
        return None


def extract_rfp_from_row(row) -> Optional[Dict]:
    """
    Extract RFP information from a table row.
    
    Args:
        row: BeautifulSoup tr element
        
    Returns:
        Dictionary with RFP details or None
    """
    try:
        # TODO: PLACEHOLDER - Implement table row extraction
        cells = row.find_all(['td', 'th'])
        if len(cells) >= 3:
            return {
                'title': cells[0].get_text(strip=True),
                'description': cells[1].get_text(strip=True) if len(cells) > 1 else '',
                'due_date': cells[-1].get_text(strip=True),
                'scope': cells[1].get_text(strip=True)[:200] if len(cells) > 1 else '',
                'rfp_id': f"RFP-{hash(cells[0].get_text(strip=True)) % 10000}",
                'estimated_value': 'Not specified',
                'keywords': extract_keywords(cells[0].get_text(strip=True)),
                'priority': 'medium'
            }
    except:
        pass
    return None


def extract_rfp_from_list(item) -> Optional[Dict]:
    """
    Extract RFP information from a list item.
    
    Args:
        item: BeautifulSoup li element
        
    Returns:
        Dictionary with RFP details or None
    """
    try:
        # TODO: PLACEHOLDER - Implement list item extraction
        text = item.get_text(strip=True)
        return {
            'title': text[:100],
            'description': text,
            'due_date': None,  # Will need to find date within text
            'scope': text[:200],
            'rfp_id': f"RFP-{hash(text) % 10000}",
            'estimated_value': 'Not specified',
            'keywords': extract_keywords(text),
            'priority': 'medium'
        }
    except:
        pass
    return None


def parse_date(date_string: str) -> datetime:
    """
    Parse various date formats into datetime object.
    
    Args:
        date_string: Date in string format
        
    Returns:
        datetime object
    """
    try:
        # Try using dateutil parser (handles many formats)
        return parser.parse(date_string, fuzzy=True)
    except:
        # Fallback: try common date formats
        formats = [
            '%Y-%m-%d',
            '%d-%m-%Y',
            '%d/%m/%Y',
            '%m/%d/%Y',
            '%B %d, %Y',
            '%d %B %Y',
            '%d-%b-%Y',
            '%d %b %Y'
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(date_string, fmt)
            except ValueError:
                continue
        
        raise ValueError(f"Unable to parse date: {date_string}")


def extract_keywords(text: str) -> List[str]:
    """
    Extract relevant keywords from text for RFP categorization.
    
    Args:
        text: Text to extract keywords from
        
    Returns:
        List of keywords
    """
    # Define important keyword categories
    priority_keywords = [
        'AI', 'artificial intelligence', 'machine learning', 'ML',
        'cloud', 'AWS', 'Azure', 'GCP',
        'cables', 'wires', 'electrical', 'XLPE', 'PVC',
        'LT cable', 'HT cable', 'control cable', 'instrumentation',
        'metro', 'railway', 'power', 'infrastructure',
        'solar', 'renewable', 'energy'
    ]
    
    found_keywords = []
    text_lower = text.lower()
    
    for keyword in priority_keywords:
        if keyword.lower() in text_lower:
            found_keywords.append(keyword)
    
    return found_keywords


def calculate_priority(rfp: Dict) -> str:
    """
    Calculate priority level of an RFP based on heuristics.
    
    Args:
        rfp: RFP dictionary
        
    Returns:
        Priority level: 'high', 'medium', or 'low'
    """
    score = 0
    
    # Check for high-value keywords
    high_value_keywords = ['AI', 'cloud', 'metro', 'railway', 'infrastructure']
    for keyword in rfp.get('keywords', []):
        if any(hv_keyword.lower() in keyword.lower() for hv_keyword in high_value_keywords):
            score += 2
    
    # Check for cable-related keywords (our domain)
    cable_keywords = ['cable', 'wire', 'electrical', 'XLPE', 'PVC', 'LT', 'HT']
    for keyword in rfp.get('keywords', []):
        if any(c_keyword.lower() in keyword.lower() for c_keyword in cable_keywords):
            score += 3
    
    # Check estimated value
    value_text = rfp.get('estimated_value', '').lower()
    if 'crore' in value_text or 'million' in value_text:
        score += 2
    
    # Check urgency (days remaining)
    days_remaining = rfp.get('days_remaining', 90)
    if days_remaining <= 30:
        score += 1
    elif days_remaining <= 60:
        score += 0.5
    
    # Determine priority
    if score >= 5:
        return 'high'
    elif score >= 2:
        return 'medium'
    else:
        return 'low'


def select_best_rfp(rfps: List[Dict]) -> Optional[Dict]:
    """
    Select the most promising RFP from a list based on heuristics.
    
    Args:
        rfps: List of RFP dictionaries
        
    Returns:
        Single RFP dictionary or None if list is empty
    """
    if not rfps:
        return None
    
    # Scoring system for RFP selection
    for rfp in rfps:
        score = 0
        
        # Priority weight
        priority_weights = {'high': 10, 'medium': 5, 'low': 2}
        score += priority_weights.get(rfp.get('priority', 'low'), 0)
        
        # Keyword matching (domain relevance)
        keyword_count = len(rfp.get('keywords', []))
        score += keyword_count * 2
        
        # Urgency (prefer RFPs with moderate urgency)
        days_remaining = rfp.get('days_remaining', 90)
        if 30 <= days_remaining <= 60:
            score += 8  # Sweet spot
        elif 60 < days_remaining <= 75:
            score += 5
        elif 15 <= days_remaining < 30:
            score += 4
        else:
            score += 2
        
        # Estimated value (if parseable)
        value_text = rfp.get('estimated_value', '').lower()
        if 'lakh' in value_text or 'crore' in value_text or 'million' in value_text:
            score += 5
        
        rfp['selection_score'] = score
    
    # Sort by score (highest first)
    sorted_rfps = sorted(rfps, key=lambda x: x.get('selection_score', 0), reverse=True)
    
    return sorted_rfps[0]


def format_rfp_summary(rfp: Dict) -> str:
    """
    Format RFP details into a readable summary.
    
    Args:
        rfp: RFP dictionary
        
    Returns:
        Formatted string summary
    """
    summary = f"""
RFP Summary:
-----------
ID: {rfp.get('rfp_id', 'N/A')}
Title: {rfp.get('title', 'N/A')}
Description: {rfp.get('description', 'N/A')[:200]}...
Scope: {rfp.get('scope', 'N/A')}
Due Date: {rfp.get('due_date', 'N/A')}
Days Remaining: {rfp.get('days_remaining', 'N/A')}
Estimated Value: {rfp.get('estimated_value', 'N/A')}
Priority: {rfp.get('priority', 'N/A').upper()}
Keywords: {', '.join(rfp.get('keywords', []))}
Source: {rfp.get('source_url', 'N/A')}
"""
    return summary.strip()


# Example usage and testing
if __name__ == "__main__":
    # Test with sample URLs
    test_urls = [
        "https://tenders.gov.in",
        "https://ntpc.co.in/tenders",
        "https://powergrind.com/rfp"
    ]
    
    print("Starting RFP Identification and Selection Agent...")
    print(f"Scanning {len(test_urls)} URLs for RFPs...\n")
    
    # Process RFPs
    result = process_rfps(test_urls)
    
    print(f"Found {result['total_count']} RFPs due in the next 3 months\n")
    
    # Display all upcoming RFPs
    print("=" * 60)
    print("ALL UPCOMING RFPs:")
    print("=" * 60)
    for i, rfp in enumerate(result['all_upcoming_rfps'], 1):
        print(f"\n{i}. {rfp.get('title', 'Untitled')}")
        print(f"   Due: {rfp.get('due_date')} ({rfp.get('days_remaining')} days)")
        print(f"   Priority: {rfp.get('priority', 'N/A').upper()}")
        print(f"   Score: {rfp.get('selection_score', 0)}")
    
    # Display selected RFP
    if result['selected_rfp']:
        print("\n" + "=" * 60)
        print("SELECTED RFP FOR RESPONSE:")
        print("=" * 60)
        print(format_rfp_summary(result['selected_rfp']))
        print(f"\nSelection Score: {result['selected_rfp'].get('selection_score', 0)}")
    else:
        print("\nNo suitable RFP found.")
