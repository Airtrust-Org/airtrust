declare module 'pdfkit' {
  export interface PDFDocumentOptions {
    size?: string | [number, number];
    margin?: number | { left?: number; right?: number; top?: number; bottom?: number };
    bufferPages?: boolean;
  }

  export interface TextOptions {
    align?: 'left' | 'center' | 'right' | 'justify';
    width?: number;
    height?: number;
    [key: string]: unknown;
  }

  export interface ImageOptions {
    width?: number;
    height?: number;
    [key: string]: unknown;
  }

  export interface PDFDocument extends NodeJS.EventEmitter {
    fontSize(size: number): this;
    font(name: string): this;
    fillColor(color: string): this;
    strokeColor(color: string): this;
    text(text: string | string[], x?: number, y?: number, options?: TextOptions): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(color?: string): this;
    circle(x: number, y: number, r: number): this;
    fill(color?: string): this;
    image(image: Buffer | string, x: number, y: number, options?: ImageOptions): this;
    end(): void;
  }

  export default function PDFDocument(options?: PDFDocumentOptions): PDFDocument;
}
