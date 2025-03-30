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

// 定义句子结束标记（句号，问号，感叹号等）
const SENTENCE_END_CHARS = ['.', '?', '!', '。', '？', '！'];

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
      window.__BIONIC_HIGHLIGHT_CONJUNCTIONS;

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

    for (const { glyphs: newG, isBold, isHighlightedVerb, isHighlightedNoun, isHighlightedConjunction } of newGlyphData) {
      // 词性高亮处理
      if (window.__BIONIC_HIGHLIGHT_CONJUNCTIONS && isHighlightedConjunction) {
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
      if (window.__BIONIC_READER_ENABLED) {
        this.ctx.font = isBold ? bold.font : light.font;
        // If use greater contrast is enabled, set text opacity to less than 1
        if (opacityContrast > 1 && !isBold) {
          this.ctx.globalAlpha = light.alpha;
        }
      }

      original_showText.apply(this, [newG]);

      if ((window.__BIONIC_HIGHLIGHT_VERBS && isHighlightedVerb) ||
        (window.__BIONIC_HIGHLIGHT_NOUNS && isHighlightedNoun) ||
        (window.__BIONIC_HIGHLIGHT_CONJUNCTIONS && isHighlightedConjunction)) {
        this.ctx.restore();
      }

      this.ctx.font = savedFont;
      this.ctx.globalAlpha = savedOpacity;
      this.ctx.fillStyle = savedFillStyle;
    }

    return undefined;
  };
  _log("Patched showText", window.__BIONIC_READER_ENABLED);
  if (window.__BIONIC_READER_ENABLED || window.__BIONIC_HIGHLIGHT_VERBS || window.__BIONIC_HIGHLIGHT_NOUNS || window.__BIONIC_HIGHLIGHT_CONJUNCTIONS) {
    refresh();
  }
}

function computeBionicGlyphs(glyphs: Glyph[]) {
  const newGlyphData: {
    glyphs: Glyph[];
    isBold: boolean;
    isHighlightedVerb: boolean;
    isHighlightedNoun: boolean;
    isHighlightedConjunction: boolean;
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
        isHighlightedConjunction: false
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
      isHighlightedConjunction: finalIsConjunction
    });

    if (boldNumber < wordLength) {
      newGlyphData.push({
        glyphs: currentWordGlyphs.slice(boldNumber),
        isBold: false,
        isHighlightedVerb: finalIsVerb,
        isHighlightedNoun: finalIsNoun,
        isHighlightedConjunction: finalIsConjunction
      });
    }
  }

  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    const str = typeof glyph === "number" 
      ? (glyph < -100 ? " " : "") 
      : glyph.unicode;

    // 检查是否是空格或标点符号
    if (/[\s\p{P}]/u.test(str)) {
      processCurrentWord();
      newGlyphData.push({
        glyphs: [glyph],
        isBold: false,
        isHighlightedVerb: false,
        isHighlightedNoun: false,
        isHighlightedConjunction: false
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
