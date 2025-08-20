
class PDFExportPlugin {
  constructor() {
    this.name = "PDF Export with Images";
    this.version = "1.0.0";
  }

  // Plugin initialization
  async init(app) {
    this.app = app;
    console.log("PDF Export Plugin initialized");
  }

  // Main export function
  async exportToPDF() {
    try {
      const note = await this.app.notes.current();
      if (!note) {
        this.app.alert("No note selected");
        return;
      }

      this.app.alert("Generating PDF...", { type: "info" });
      
      const content = await this.app.notes.content(note.uuid);
      const noteTitle = note.name || "Untitled Note";
      
      await this.generatePDF(content, noteTitle);
      
    } catch (error) {
      console.error("PDF export error:", error);
      this.app.alert("Failed to export PDF: " + error.message, { type: "error" });
    }
  }

  // Generate PDF with content and images
  async generatePDF(content, title) {
    // Import jsPDF dynamically
    const { jsPDF } = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - (margin * 2);
    
    let yPosition = margin;

    // Add title
    pdf.setFontSize(20);
    pdf.setFont(undefined, 'bold');
    const titleLines = pdf.splitTextToSize(title, maxWidth);
    pdf.text(titleLines, margin, yPosition);
    yPosition += titleLines.length * 10 + 10;

    // Parse content and extract text and images
    const parsedContent = await this.parseContent(content);

    for (const element of parsedContent) {
      // Check if we need a new page
      if (yPosition > pageHeight - 30) {
        pdf.addPage();
        yPosition = margin;
      }

      if (element.type === 'text') {
        await this.addTextToPDF(pdf, element.content, margin, yPosition, maxWidth);
        yPosition += this.calculateTextHeight(pdf, element.content, maxWidth) + 5;
      } else if (element.type === 'image') {
        const imageHeight = await this.addImageToPDF(pdf, element.src, element.alt, margin, yPosition, maxWidth);
        yPosition += imageHeight + 10;
      }
    }

    // Save the PDF
    const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
    pdf.save(filename);
    
    this.app.alert("PDF exported successfully!", { type: "success" });
  }

  // Parse note content to extract text and images
  async parseContent(content) {
    const elements = [];
    
    // Create a temporary div to parse HTML content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;

    // Process each child element
    const children = Array.from(tempDiv.childNodes);
    
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent.trim();
        if (text) {
          elements.push({ type: 'text', content: text });
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'IMG') {
          elements.push({
            type: 'image',
            src: child.src,
            alt: child.alt || 'Image'
          });
        } else {
          // Extract text from other elements
          const text = child.textContent.trim();
          if (text) {
            elements.push({ type: 'text', content: text });
          }
          
          // Check for images within the element
          const images = child.querySelectorAll('img');
          for (const img of images) {
            elements.push({
              type: 'image',
              src: img.src,
              alt: img.alt || 'Image'
            });
          }
        }
      }
    }
    
    return elements;
  }

  // Add text to PDF with proper formatting
  async addTextToPDF(pdf, text, x, y, maxWidth) {
    pdf.setFontSize(12);
    pdf.setFont(undefined, 'normal');
    
    const lines = pdf.splitTextToSize(text, maxWidth);
    pdf.text(lines, x, y);
    
    return lines.length * 7; // Return height used
  }

  // Calculate text height
  calculateTextHeight(pdf, text, maxWidth) {
    const lines = pdf.splitTextToSize(text, maxWidth);
    return lines.length * 7;
  }

  // Add image to PDF
  async addImageToPDF(pdf, imageSrc, altText, x, y, maxWidth) {
    try {
      const imageData = await this.loadImage(imageSrc);
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const aspectRatio = img.width / img.height;
          let imgWidth = Math.min(maxWidth, img.width * 0.1); // Scale down
          let imgHeight = imgWidth / aspectRatio;
          
          // Ensure image fits on page
          const maxHeight = 100; // mm
          if (imgHeight > maxHeight) {
            imgHeight = maxHeight;
            imgWidth = imgHeight * aspectRatio;
          }
          
          try {
            pdf.addImage(imageData, 'JPEG', x, y, imgWidth, imgHeight);
            resolve(imgHeight);
          } catch (error) {
            console.error("Error adding image to PDF:", error);
            // Add alt text instead
            pdf.setFontSize(10);
            pdf.setFont(undefined, 'italic');
            const altLines = pdf.splitTextToSize(`[Image: ${altText}]`, maxWidth);
            pdf.text(altLines, x, y);
            resolve(altLines.length * 5);
          }
        };
        
        img.onerror = () => {
          // If image fails to load, add alt text
          pdf.setFontSize(10);
          pdf.setFont(undefined, 'italic');
          const altLines = pdf.splitTextToSize(`[Image not found: ${altText}]`, maxWidth);
          pdf.text(altLines, x, y);
          resolve(altLines.length * 5);
        };
        
        img.src = imageData;
      });
      
    } catch (error) {
      console.error("Error loading image:", error);
      // Add error text
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'italic');
      const errorLines = pdf.splitTextToSize(`[Image error: ${altText}]`, maxWidth);
      pdf.text(errorLines, x, y);
      return errorLines.length * 5;
    }
  }

  // Load image and convert to base64
  async loadImage(src) {
    return new Promise((resolve, reject) => {
      if (src.startsWith('data:')) {
        resolve(src);
        return;
      }
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        try {
          const dataURL = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataURL);
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      img.src = src;
    });
  }

  // Plugin action handlers
  async noteOption() {
    return [
      {
        label: "Export to PDF",
        onclick: () => this.exportToPDF()
      }
    ];
  }
}

// Export the plugin
const plugin = new PDFExportPlugin();
export default plugin;
