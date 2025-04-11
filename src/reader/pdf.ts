/* eslint-disable no-restricted-globals */
import { wait } from "zotero-plugin-toolkit";
import { computeFont } from "../utils/font";
import { isVerb, isNoun } from "../utils/nlp";
import { isConjunction } from "../utils/conjunction";

import type {
  PDFPage,
  CanvasGraphics,
  InternalRenderTask,
  Glyph,
} from "./typings/pdfViewer";

declare const PDFViewerApplication: _ZoteroTypes.Reader.PDFViewerApplication;

declare const pdfjsLib: _ZoteroTypes.Reader.pdfjs;

// 定义句子结束标记（句号，问号，感叹号）
const SENTENCE_END_CHARS = ['.', '?', '!', '。', '？', '！'];
// 定义轻量标点（逗号、分号）
const LIGHT_PUNCTUATION_CHARS = [',', ';', '，', '；', '、'];
// 定义重量标点（句号、问号、感叹号）
const HEAVY_PUNCTUATION_CHARS = ['.', '?', '!', '。', '？', '！'];
// 所有要处理的标点符号
const ALL_PUNCTUATION_CHARS = [...LIGHT_PUNCTUATION_CHARS, ...HEAVY_PUNCTUATION_CHARS];

let intentStatesPrototype: any;

let firstRenderTriggered = false;

const isWordBroken = false;

function main() {
  patchIntentStatesGet();

  // If the first render is not triggered in 3 seconds, trigger a refresh again
  setTimeout(() => {
    if (!firstRenderTriggered) {
      refresh();
    }
  }, 3000);
}

main();

async function patchIntentStatesGet(pageIndex = 0) {
  await PDFViewerApplication?.pdfViewer?.firstPagePromise;
  await wait.waitUtilAsync(
    () =>
      !!PDFViewerApplication?.pdfViewer?._pages &&
      !!PDFViewerApplication?.pdfViewer?._pages[pageIndex],
    100,
    10000,
  );
  const page = PDFViewerApplication.pdfViewer!._pages![pageIndex] as PDFPage;
  // @ts-ignore Prototypes are not typed
  intentStatesPrototype = page.pdfPage._intentStates.__proto__;
  const original_get = intentStatesPrototype.get;
  intentStatesPrototype.__original_get = original_get;
  intentStatesPrototype.get = function (intent: any) {
    const ret = original_get.apply(this, [intent]);
    if (ret && typeof ret === "object" && ret.renderTasks) {
      _log("Intent", intent, ret);
      patchRenderTasksAdd(ret.renderTasks);
    }
    return ret;
  };
  // Refresh the page to apply the patch
  refresh();
}

function unPatchIntentStatesGet() {
  if (intentStatesPrototype.__original_get) {
    intentStatesPrototype.get = intentStatesPrototype.__original_get;
    delete intentStatesPrototype.__original_get;
  }
}

function patchRenderTasksAdd(renderTasks: Set<InternalRenderTask>) {
  const original_add = renderTasks.add;
  renderTasks.add = function (renderTask) {
    _log("Adding render task", renderTask);
    wait
      .waitUtilAsync(() => renderTask.gfx, 100, 10000)
      .then(() => {
        patchCanvasGraphicsShowText(renderTask.gfx.__proto__);
        renderTasks.add = original_add;
        unPatchIntentStatesGet();
      });
    return original_add.apply(this, [renderTask]);
  };
}

function patchCanvasGraphicsShowText(
  canvasGraphicsPrototype: typeof CanvasGraphics & {
    __showTextPatched?: boolean;
    ctx: CanvasRenderingContext2D;
  },
) {
  if (canvasGraphicsPrototype.__showTextPatched) {
    return;
  }
  firstRenderTriggered = true;
  canvasGraphicsPrototype.__showTextPatched = true;
  // @ts-ignore Runtime generated method on prototype
  const original_showText = canvasGraphicsPrototype[pdfjsLib.OPS.showText];
  _log("Patching showText", canvasGraphicsPrototype);

  // @ts-ignore Runtime generated method on prototype
  canvasGraphicsPrototype[pdfjsLib.OPS.showText] = function (glyphs: Glyph[]) {
    const needsProcessing = window.__BIONIC_READER_ENABLED ||
      window.__BIONIC_HIGHLIGHT_VERBS ||
      window.__BIONIC_HIGHLIGHT_NOUNS ||
      window.__BIONIC_HIGHLIGHT_CONJUNCTIONS ||
      window.__BIONIC_HIGHLIGHT_PUNCTUATION;

    if (!needsProcessing) {
      return original_showText.apply(this, [glyphs]);
    }

    const opacityContrast = window.__BIONIC_OPACITY_CONTRAST || 1;
    const weightContrast = window.__BIONIC_WEIGHT_CONTRAST || 1;
    const weightOffset = window.__BIONIC_WEIGHT_OFFSET || 0;

    const savedFont = this.ctx.font;
    const savedOpacity = this.ctx.globalAlpha;
    const savedFillStyle = this.ctx.fillStyle;

    const { bold, light } = computeFont({
      font: savedFont,
      alpha: savedOpacity,
      opacityContrast,
      weightContrast,
      weightOffset,
    });

    const newGlyphData = computeBionicGlyphs(glyphs);

    for (const { glyphs: newG, isBold, isHighlightedVerb, isHighlightedNoun, isHighlightedConjunction, isPunctuation, isLightPunctuation, isHeavyPunctuation } of newGlyphData) {
      // 标点符号高亮处理
      if (window.__BIONIC_HIGHLIGHT_PUNCTUATION && isPunctuation) {
        this.ctx.save();
        
        if (isLightPunctuation) {
          // 轻量标点使用浅色版本
          const baseColor = window.__BIONIC_PUNCTUATION_HIGHLIGHT_COLOR || "#FF00FF";
          this.ctx.fillStyle = lightenColor(baseColor, 0.3); // 浅色版本
        } else if (isHeavyPunctuation) {
          // 重量标点使用深色版本
          const baseColor = window.__BIONIC_PUNCTUATION_HIGHLIGHT_COLOR || "#FF00FF";
          this.ctx.fillStyle = darkenColor(baseColor, 0.3); // 深色版本
        } else {
          // 其他标点使用原色
          this.ctx.fillStyle = window.__BIONIC_PUNCTUATION_HIGHLIGHT_COLOR || "#FF00FF";
        }
        
        // 如果同时启用了加粗，则标点符号也加粗
        if (window.__BIONIC_PUNCTUATION_BOLD) {
          // 获取当前字体信息
          const fontSize = parseInt(this.ctx.font.match(/\d+px/)?.[0] || '12px');
          const enlargedSize = fontSize * 2; // 放大两倍
          const fontWeight = 900; // 使用最粗的字体权重
          
          // 保存当前字体设置
          const originalFont = this.ctx.font;
          
          // 修改字体设置为放大且加粗的版本
          this.ctx.font = originalFont
            .replace(/\d+px/, `${enlargedSize}px`)
            .replace(/normal|bold|[1-9]00/, `${fontWeight}`);
          
          // 处理这个标点符号
          original_showText.apply(this, [newG]);
          
          // 恢复原始字体设置
          this.ctx.font = originalFont;
          
          // 已经处理过，跳过下面的渲染
          this.ctx.restore();
          continue;
        }
      }
      // 词性高亮处理
      else if (window.__BIONIC_HIGHLIGHT_CONJUNCTIONS && isHighlightedConjunction) {
        this.ctx.save();
        this.ctx.fillStyle = window.__BIONIC_CONJUNCTION_HIGHLIGHT_COLOR || "#FFA500";
      } else if (window.__BIONIC_HIGHLIGHT_VERBS && isHighlightedVerb && window.__BIONIC_HIGHLIGHT_NOUNS && isHighlightedNoun) {
        // 当同时满足动词和名词条件时，选择名词颜色
        this.ctx.save();
        this.ctx.fillStyle = window.__BIONIC_NOUN_HIGHLIGHT_COLOR || "#5252FF";
        _log("词同时是动词和名词，优先显示为名词");
      } else if (window.__BIONIC_HIGHLIGHT_VERBS && isHighlightedVerb) {
        this.ctx.save();
        this.ctx.fillStyle = window.__BIONIC_VERB_HIGHLIGHT_COLOR || "#FF5252";
      } else if (window.__BIONIC_HIGHLIGHT_NOUNS && isHighlightedNoun) {
        this.ctx.save();
        this.ctx.fillStyle = window.__BIONIC_NOUN_HIGHLIGHT_COLOR || "#5252FF";
      }

      // 处理bionic加粗
      if (window.__BIONIC_READER_ENABLED && !isPunctuation) {
        this.ctx.font = isBold ? bold.font : light.font;
        // If use greater contrast is enabled, set text opacity to less than 1
        if (opacityContrast > 1 && !isBold) {
          this.ctx.globalAlpha = light.alpha;
        }
      }

      original_showText.apply(this, [newG]);

      if ((window.__BIONIC_HIGHLIGHT_VERBS && isHighlightedVerb) ||
        (window.__BIONIC_HIGHLIGHT_NOUNS && isHighlightedNoun) ||
        (window.__BIONIC_HIGHLIGHT_CONJUNCTIONS && isHighlightedConjunction) ||
        (window.__BIONIC_HIGHLIGHT_PUNCTUATION && isPunctuation)) {
        this.ctx.restore();
      }

      this.ctx.font = savedFont;
      this.ctx.globalAlpha = savedOpacity;
      this.ctx.fillStyle = savedFillStyle;
    }

    return undefined;
  };
  _log("Patched showText", window.__BIONIC_READER_ENABLED);
  if (window.__BIONIC_READER_ENABLED || 
      window.__BIONIC_HIGHLIGHT_VERBS || 
      window.__BIONIC_HIGHLIGHT_NOUNS || 
      window.__BIONIC_HIGHLIGHT_CONJUNCTIONS || 
      window.__BIONIC_HIGHLIGHT_PUNCTUATION) {
    refresh();
  }
}

// 辅助函数：使颜色变浅
function lightenColor(color: string, amount: number): string {
  // 将十六进制颜色转换为RGB
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // 调亮颜色
  const newR = Math.min(Math.round(r + (255 - r) * amount), 255);
  const newG = Math.min(Math.round(g + (255 - g) * amount), 255);
  const newB = Math.min(Math.round(b + (255 - b) * amount), 255);
  
  // 转回十六进制
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// 辅助函数：使颜色变深
function darkenColor(color: string, amount: number): string {
  // 将十六进制颜色转换为RGB
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // 调暗颜色
  const newR = Math.max(Math.round(r * (1 - amount)), 0);
  const newG = Math.max(Math.round(g * (1 - amount)), 0);
  const newB = Math.max(Math.round(b * (1 - amount)), 0);
  
  // 转回十六进制
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

function computeBionicGlyphs(glyphs: Glyph[]) {
  const newGlyphData: {
    glyphs: Glyph[];
    isBold: boolean;
    isHighlightedVerb: boolean;
    isHighlightedNoun: boolean;
    isHighlightedConjunction: boolean;
    isPunctuation: boolean;
    isLightPunctuation: boolean;
    isHeavyPunctuation: boolean;
  }[] = [];

  const parsingOffset = window.__BIONIC_PARSING_OFFSET || 0;
  const CONVERTIBLE_REGEX = /(\p{L}|\p{Nd})*\p{L}(\p{L}|\p{Nd})*/u;
  const NON_VOWELS_REGEX = /[^aeiou]/gi;

  let currentWord = "";
  let currentWordStart = 0;
  let currentWordGlyphs: Glyph[] = [];

  function processCurrentWord() {
    if (!currentWord || !currentWordGlyphs.length) return;

    if (!CONVERTIBLE_REGEX.test(currentWord)) {
      newGlyphData.push({
        glyphs: currentWordGlyphs,
        isBold: false,
        isHighlightedVerb: false,
        isHighlightedNoun: false,
        isHighlightedConjunction: false,
        isPunctuation: false,
        isLightPunctuation: false,
        isHeavyPunctuation: false
      });
      return;
    }

    // 修改词性判断顺序，优先判断连词
    const isCurrentWordConjunction = isConjunction(currentWord);
    const isCurrentWordVerb = !isCurrentWordConjunction && isVerb(currentWord);
    const isCurrentWordNoun = !isCurrentWordConjunction && !isCurrentWordVerb && isNoun(currentWord);

    // 简化词性判断逻辑，确保连词优先级最高
    const finalIsConjunction = isCurrentWordConjunction;
    const finalIsVerb = !finalIsConjunction && isCurrentWordVerb;
    const finalIsNoun = !finalIsConjunction && !finalIsVerb && isCurrentWordNoun;

    let boldNumber = 1;
    const wordLength = currentWordGlyphs.length;

    if (wordLength < 4) {
      boldNumber = 1;
    } else {
      boldNumber = Math.ceil(wordLength / 2);
      if (boldNumber > 6) {
        const nonVowels = currentWord.matchAll(NON_VOWELS_REGEX);
        const closestMatch = Array.from(nonVowels).sort((a, b) => 
          Math.abs(a.index! - boldNumber) - Math.abs(b.index! - boldNumber)
        )[0];
        if (closestMatch && Math.abs(closestMatch.index! - boldNumber) < 2) {
          boldNumber = closestMatch.index! + 1;
        }
      }
    }

    boldNumber += parsingOffset;
    boldNumber = Math.max(Math.min(boldNumber, wordLength), 1);

    newGlyphData.push({
      glyphs: currentWordGlyphs.slice(0, boldNumber),
      isBold: true,
      isHighlightedVerb: finalIsVerb,
      isHighlightedNoun: finalIsNoun,
      isHighlightedConjunction: finalIsConjunction,
      isPunctuation: false,
      isLightPunctuation: false,
      isHeavyPunctuation: false
    });

    if (boldNumber < wordLength) {
      newGlyphData.push({
        glyphs: currentWordGlyphs.slice(boldNumber),
        isBold: false,
        isHighlightedVerb: finalIsVerb,
        isHighlightedNoun: finalIsNoun,
        isHighlightedConjunction: finalIsConjunction,
        isPunctuation: false,
        isLightPunctuation: false,
        isHeavyPunctuation: false
      });
    }
  }

  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    const str = typeof glyph === "number" 
      ? (glyph < -100 ? " " : "") 
      : glyph.unicode;

    // 检查是否是我们定义的标点符号
    if (ALL_PUNCTUATION_CHARS.includes(str)) {
      processCurrentWord();
      
      // 判断标点符号类型
      const isLight = LIGHT_PUNCTUATION_CHARS.includes(str);
      const isHeavy = HEAVY_PUNCTUATION_CHARS.includes(str);
      
      newGlyphData.push({
        glyphs: [glyph],
        isBold: false,
        isHighlightedVerb: false,
        isHighlightedNoun: false,
        isHighlightedConjunction: false,
        isPunctuation: true,
        isLightPunctuation: isLight,
        isHeavyPunctuation: isHeavy
      });
      
      currentWord = "";
      currentWordGlyphs = [];
      currentWordStart = i + 1;
    } 
    // 检查是否是其他标点符号（括号、引号等），将它们作为普通文本处理，但会导致单词分割
    else if (/[\p{P}]/u.test(str)) {
      processCurrentWord();
      
      newGlyphData.push({
        glyphs: [glyph],
        isBold: false,
        isHighlightedVerb: false,
        isHighlightedNoun: false,
        isHighlightedConjunction: false,
        isPunctuation: false, // 不标记为标点符号
        isLightPunctuation: false,
        isHeavyPunctuation: false
      });
      
      currentWord = "";
      currentWordGlyphs = [];
      currentWordStart = i + 1;
    }
    // 检查是否是空格
    else if (/\s/u.test(str)) {
      processCurrentWord();
      newGlyphData.push({
        glyphs: [glyph],
        isBold: false,
        isHighlightedVerb: false,
        isHighlightedNoun: false,
        isHighlightedConjunction: false,
        isPunctuation: false,
        isLightPunctuation: false,
        isHeavyPunctuation: false
      });
      currentWord = "";
      currentWordGlyphs = [];
      currentWordStart = i + 1;
    } else {
      currentWord += str;
      currentWordGlyphs.push(glyph);
    }
  }

  // 处理最后一个单词
  processCurrentWord();

  return newGlyphData;
}

function refresh() {
  PDFViewerApplication.pdfViewer?.cleanup();
  PDFViewerApplication.pdfViewer?.refresh();
}

function _log(...args: any[]) {
  if (__env__ === "development") {
    console.log("[Colorful Bionic]", ...args);
  }
}
