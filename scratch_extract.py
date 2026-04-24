import fitz  # PyMuPDF

def extract_html():
    doc = fitz.open("Chinese Bridge Question Bank.pdf")
    page = doc.load_page(0)
    html_content = page.get_text("html")
    with open("scratch_output.html", "w", encoding="utf-8") as f:
        f.write(html_content)

if __name__ == "__main__":
    extract_html()
