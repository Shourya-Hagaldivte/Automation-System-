import requests
from bs4 import BeautifulSoup
import os

DOWNLOAD_DIR = "rfp_downloads"

def scrape_rfp_links(url):
    response = requests.get(url)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    pdf_links = []

    for a in soup.find_all("a", href=True):
        if a["href"].lower().endswith(".pdf"):
            pdf_links.append(a["href"])

    return pdf_links


def download_pdf(url, filename):
    response = requests.get(url)
    response.raise_for_status()

    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    filepath = os.path.join(DOWNLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(response.content)

    return filepath
