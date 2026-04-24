import fitz  # PyMuPDF
import easyocr
import os

def extract():
    print("Loading EasyOCR models...")
    # 'ch_sim' is for Simplified Chinese, 'en' for English
    reader = easyocr.Reader(['ch_sim', 'en'])
    print("Models loaded. Opening PDF...")
    
    doc = fitz.open("Chinese Bridge Question Bank.pdf")
    
    with open("extracted_ocr.md", "w", encoding="utf-8") as f:
        for page_num in range(doc.page_count):
            print(f"Processing page {page_num+1}/{doc.page_count}...")
            page = doc.load_page(page_num)
            pix = page.get_pixmap(dpi=150)
            img_path = f"page_{page_num}.png"
            pix.save(img_path)
            
            result = reader.readtext(img_path, detail=0)
            text = "\n".join(result)
            f.write(f"## Page {page_num+1}\n\n{text}\n\n")
            
            # Clean up the image to save space
            os.remove(img_path)
            
    print("Done! Results saved to extracted_ocr.md")

if __name__ == "__main__":
    extract()
