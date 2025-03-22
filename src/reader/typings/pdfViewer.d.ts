export type { PDFPage, InternalRenderTask, Glyph, CanvasGraphics };

import type { PDFPageProxy } from "pdfjs-dist";
import type { CanvasGraphics } from "pdfjs-dist/types/src/display/canvas";

// 扩展Window接口，添加动词和名词高亮相关属性
declare global {
  interface Window {
    __BIONIC_READER_ENABLED?: boolean;
    __BIONIC_PARSING_OFFSET?: number;
    __BIONIC_OPACITY_CONTRAST?: number;
    __BIONIC_WEIGHT_CONTRAST?: number;
    __BIONIC_WEIGHT_OFFSET?: number;
    __BIONIC_HIGHLIGHT_VERBS?: boolean;
    __BIONIC_VERB_HIGHLIGHT_COLOR?: string;
    __BIONIC_HIGHLIGHT_NOUNS?: boolean;
    __BIONIC_NOUN_HIGHLIGHT_COLOR?: string;
  }
}

declare interface PDFPage {
  pdfPage: PDFPageProxy;
  canvas: HTMLCanvasElement;
}

declare interface InternalRenderTask {
  gfx: any;
}

declare interface Glyph {
  unicode: string;
  isSpace: boolean;
}
