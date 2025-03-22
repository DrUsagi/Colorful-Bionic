/**
 * 自然语言处理模块，用于智能检测词性并高亮显示
 */
import nlp from 'compromise';

// 定义类型
interface Term {
    text?: string;
    normal?: string;
    tags?: string[];
    [key: string]: any;
}

interface NLPResult {
    terms?: Term[];
    [key: string]: any;
}

// 词性缓存，避免重复处理相同单词
const partOfSpeechCache = new Map<string, { isVerb: boolean, isNoun: boolean }>();

// 常见名词后缀
const NOUN_SUFFIXES = [
    'ness', 'ment', 'ship', 'hood', 'dom', 'ity', 'tion', 'sion', 'ance', 'ence',
    'ism', 'ist', 'er', 'or', 'ian', 'ant', 'ent', 'ee', 'ese', 'ology', 'ician',
    'acy', 'al', 'age', 'ery', 'arium', 'ium', 'ice', 'ade', 'ure', 'itis',
    // 复数形式
    's', 'es'
];

// 常见动词后缀
const VERB_SUFFIXES = [
    'ize', 'ise', 'ify', 'ate', 'en',
    // 动词时态后缀
    'ed', 'ing', 's', 'es'
];

// 常见名词前缀
const NOUN_PREFIXES = [
    'anti', 'auto', 'co', 'counter', 'cyber', 'de', 'eco', 'ex', 'extra', 'mega',
    'micro', 'mid', 'mini', 'mis', 'mono', 'multi', 'neo', 'non', 'omni', 'over',
    'pan', 'para', 'post', 'pre', 'pro', 'pseudo', 're', 'semi', 'sub', 'super',
    'trans', 'ultra', 'un', 'under'
];

// 常见动词前缀
const VERB_PREFIXES = [
    'be', 'con', 'de', 'dis', 'en', 'em', 'fore', 'in', 'inter', 'mis',
    'out', 'over', 'pre', 're', 'sub', 'trans', 'un', 'under', 'up'
];

// 通常作为名词的单词列表
const COMMON_NOUNS = new Set([
    'reason', 'reasons', 'time', 'times', 'day', 'days', 'thing', 'things',
    'person', 'people', 'way', 'ways', 'man', 'men', 'woman', 'women',
    'child', 'children', 'world', 'place', 'places', 'case', 'cases',
    'part', 'parts', 'system', 'systems', 'group', 'groups', 'fact', 'facts'
]);

// 通常被错误识别为动词的名词
const COMMON_MISIDENTIFIED_NOUNS = new Set([
    'reason', 'reasons', 'record', 'records', 'present', 'presents',
    'object', 'objects', 'content', 'contents', 'process', 'processes',
    'contact', 'contacts', 'address', 'addresses', 'project', 'projects',
    'impact', 'impacts', 'subject', 'subjects', 'contract', 'contracts',
    'contest', 'contests', 'conflict', 'conflicts', 'face', 'faces',
    'offer', 'offers', 'study', 'studies', 'report', 'reports',
    'support', 'supports', 'program', 'programs', 'review', 'reviews'
]);

/**
 * 基于后缀分析判断词是否为名词
 * @param word 单词
 * @returns 基于后缀判断是否可能为名词
 */
function isNounBySuffix(word: string): boolean {
    const lowerWord = word.toLowerCase();

    // 如果单词在常见名词列表中，直接返回true
    if (COMMON_NOUNS.has(lowerWord)) {
        return true;
    }

    // 如果单词是常见被误识别的名词，返回true
    if (COMMON_MISIDENTIFIED_NOUNS.has(lowerWord)) {
        return true;
    }

    // 检查名词后缀
    return NOUN_SUFFIXES.some(suffix =>
        lowerWord.endsWith(suffix) &&
        // 确保后缀不是整个单词
        lowerWord.length > suffix.length + 1
    );
}

/**
 * 基于后缀分析判断词是否为动词
 * @param word 单词
 * @returns 基于后缀判断是否可能为动词
 */
function isVerbBySuffix(word: string): boolean {
    const lowerWord = word.toLowerCase();

    // 如果单词在常见被误识别名词列表中，返回false
    if (COMMON_MISIDENTIFIED_NOUNS.has(lowerWord)) {
        return false;
    }

    // 检查动词后缀
    return VERB_SUFFIXES.some(suffix =>
        lowerWord.endsWith(suffix) &&
        // 确保后缀不是整个单词
        lowerWord.length > suffix.length + 2
    );
}

/**
 * 基于前缀分析判断词是否为名词
 * @param word 单词
 * @returns 基于前缀判断是否可能为名词
 */
function isNounByPrefix(word: string): boolean {
    const lowerWord = word.toLowerCase();

    // 检查名词前缀
    return NOUN_PREFIXES.some(prefix =>
        lowerWord.startsWith(prefix) &&
        // 确保前缀不是整个单词
        lowerWord.length > prefix.length + 2
    );
}

/**
 * 基于前缀分析判断词是否为动词
 * @param word 单词
 * @returns 基于前缀判断是否可能为动词
 */
function isVerbByPrefix(word: string): boolean {
    const lowerWord = word.toLowerCase();

    // 如果单词在常见被误识别名词列表中，返回false
    if (COMMON_MISIDENTIFIED_NOUNS.has(lowerWord)) {
        return false;
    }

    // 检查动词前缀
    return VERB_PREFIXES.some(prefix =>
        lowerWord.startsWith(prefix) &&
        // 确保前缀不是整个单词
        lowerWord.length > prefix.length + 2
    );
}

/**
 * 检测单词是否为动词
 * @param word 待检查的单词
 * @returns 是否为动词
 */
export function isVerb(word: string): boolean {
    // 清理单词
    const cleanWord = cleanupWord(word);
    if (!cleanWord) return false;

    // 检查缓存
    if (partOfSpeechCache.has(cleanWord)) {
        return partOfSpeechCache.get(cleanWord)!.isVerb;
    }

    // 如果单词在常见被误识别的名词列表中，直接返回false
    if (COMMON_MISIDENTIFIED_NOUNS.has(cleanWord.toLowerCase())) {
        updateCache(cleanWord, false, true);
        return false;
    }

    // 使用NLP进行词性分析
    const doc = nlp(cleanWord);
    const isVerbWord = doc.verbs().json().length > 0;
    const isNounWord = doc.nouns().json().length > 0;

    // 基于前缀后缀分析进行二次确认
    const isVerbBySuffixAnalysis = isVerbBySuffix(cleanWord);
    const isVerbByPrefixAnalysis = isVerbByPrefix(cleanWord);
    const isNounBySuffixAnalysis = isNounBySuffix(cleanWord);
    const isNounByPrefixAnalysis = isNounByPrefix(cleanWord);

    // 综合分析，权衡多种判断方法
    let finalIsVerb = isVerbWord;
    let finalIsNoun = isNounWord;

    // 如果基于后缀和前缀分析都认为是名词，而且NLP分析结果不确定，优先认为是名词
    if ((isNounBySuffixAnalysis || isNounByPrefixAnalysis) && !isVerbWord) {
        finalIsVerb = false;
        finalIsNoun = true;
    }

    // 如果基于后缀和前缀分析都认为是动词，而且NLP分析结果不确定，优先认为是动词
    if ((isVerbBySuffixAnalysis || isVerbByPrefixAnalysis) && !isNounWord) {
        finalIsVerb = true;
        finalIsNoun = false;
    }

    // 如果同时被识别为动词和名词，根据优先级决定
    if (finalIsVerb && finalIsNoun) {
        // 如果是常见被误识别的名词，优先识别为名词
        if (COMMON_MISIDENTIFIED_NOUNS.has(cleanWord.toLowerCase())) {
            finalIsVerb = false;
        }
        // 否则根据后缀分析结果优先判断
        else if (isNounBySuffixAnalysis && !isVerbBySuffixAnalysis) {
            finalIsVerb = false;
        }
        else if (isVerbBySuffixAnalysis && !isNounBySuffixAnalysis) {
            finalIsNoun = false;
        }
    }

    // 缓存结果
    updateCache(cleanWord, finalIsVerb, finalIsNoun);

    return finalIsVerb;
}

/**
 * 检测单词是否为名词
 * @param word 待检查的单词
 * @returns 是否为名词
 */
export function isNoun(word: string): boolean {
    // 清理单词
    const cleanWord = cleanupWord(word);
    if (!cleanWord) return false;

    // 检查缓存
    if (partOfSpeechCache.has(cleanWord)) {
        return partOfSpeechCache.get(cleanWord)!.isNoun;
    }

    // 如果单词在常见名词列表或被误识别的名词列表中，直接返回true
    if (COMMON_NOUNS.has(cleanWord.toLowerCase()) ||
        COMMON_MISIDENTIFIED_NOUNS.has(cleanWord.toLowerCase())) {
        updateCache(cleanWord, false, true);
        return true;
    }

    // 使用NLP进行词性分析
    const doc = nlp(cleanWord);
    const isVerbWord = doc.verbs().json().length > 0;
    const isNounWord = doc.nouns().json().length > 0;

    // 基于前缀后缀分析进行二次确认
    const isVerbBySuffixAnalysis = isVerbBySuffix(cleanWord);
    const isVerbByPrefixAnalysis = isVerbByPrefix(cleanWord);
    const isNounBySuffixAnalysis = isNounBySuffix(cleanWord);
    const isNounByPrefixAnalysis = isNounByPrefix(cleanWord);

    // 综合分析，权衡多种判断方法
    let finalIsVerb = isVerbWord;
    let finalIsNoun = isNounWord;

    // 如果基于后缀和前缀分析都认为是名词，而且NLP分析结果不确定，优先认为是名词
    if ((isNounBySuffixAnalysis || isNounByPrefixAnalysis) && !isVerbWord) {
        finalIsVerb = false;
        finalIsNoun = true;
    }

    // 如果基于后缀和前缀分析都认为是动词，而且NLP分析结果不确定，优先认为是动词
    if ((isVerbBySuffixAnalysis || isVerbByPrefixAnalysis) && !isNounWord) {
        finalIsVerb = true;
        finalIsNoun = false;
    }

    // 如果同时被识别为动词和名词，根据优先级决定
    if (finalIsVerb && finalIsNoun) {
        // 如果是常见被误识别的名词，优先识别为名词
        if (COMMON_MISIDENTIFIED_NOUNS.has(cleanWord.toLowerCase())) {
            finalIsVerb = false;
        }
        // 否则根据后缀分析结果优先判断
        else if (isNounBySuffixAnalysis && !isVerbBySuffixAnalysis) {
            finalIsVerb = false;
        }
        else if (isVerbBySuffixAnalysis && !isNounBySuffixAnalysis) {
            finalIsNoun = false;
        }
    }

    // 缓存结果
    updateCache(cleanWord, finalIsVerb, finalIsNoun);

    return finalIsNoun;
}

/**
 * 分析文本，返回所有单词的词性分析结果，使用上下文信息增强准确性
 * @param text 待分析文本
 * @returns 分析结果，包含每个单词及其词性
 */
export function analyzeText(text: string): { word: string, isVerb: boolean, isNoun: boolean }[] {
    if (!text) return [];

    // 使用NLP进行整句分析，以获取上下文
    const doc = nlp(text);
    const results: { word: string, isVerb: boolean, isNoun: boolean }[] = [];

    try {
        // 获取句子结构
        const sentences = doc.sentences().json();

        for (const sentence of sentences) {
            if (!sentence.terms) continue;

            // 收集上下文信息
            const terms = sentence.terms.map((term: Term, index: number) => {
                const word = term.text || '';
                const cleanWord = cleanupWord(word);
                if (!cleanWord) return null;

                // 获取词性标签
                const tags = term.tags || [];

                // 判断是否确定为动词或名词
                let isVerbByNLP = tags.includes('Verb');
                let isNounByNLP = tags.includes('Noun');

                // 基于前后文检查
                // 检查是否有冠词、形容词或限定词在前面 (可能表示是名词)
                const prevTerm = index > 0 ? sentence.terms[index - 1] : null;
                const prevTags = prevTerm?.tags || [];
                const hasArticleBefore = prevTags.includes('Determiner') || prevTags.includes('Adjective');

                // 检查是否有助动词在前面 (可能表示是动词)
                const hasAuxiliaryBefore = prevTags.includes('Auxiliary');

                // 检查前缀后缀
                const isVerbBySuffixAnalysis = isVerbBySuffix(cleanWord);
                const isVerbByPrefixAnalysis = isVerbByPrefix(cleanWord);
                const isNounBySuffixAnalysis = isNounBySuffix(cleanWord);
                const isNounByPrefixAnalysis = isNounByPrefix(cleanWord);

                // 考虑单词本身的特殊情况
                const isCommonMisidentifiedNoun = COMMON_MISIDENTIFIED_NOUNS.has(cleanWord.toLowerCase());
                const isCommonNoun = COMMON_NOUNS.has(cleanWord.toLowerCase());

                // 综合分析
                let finalIsVerb = isVerbByNLP;
                let finalIsNoun = isNounByNLP;

                // 应用上下文规则
                if (hasArticleBefore && !isVerbByNLP) {
                    finalIsNoun = true;
                    finalIsVerb = false;
                } else if (hasAuxiliaryBefore && !isNounByNLP) {
                    finalIsVerb = true;
                    finalIsNoun = false;
                }

                // 应用前缀后缀规则
                if ((isNounBySuffixAnalysis || isNounByPrefixAnalysis || isCommonNoun || isCommonMisidentifiedNoun)
                    && !isVerbByNLP) {
                    finalIsNoun = true;
                }

                if ((isVerbBySuffixAnalysis || isVerbByPrefixAnalysis) && !isNounByNLP && !isCommonMisidentifiedNoun) {
                    finalIsVerb = true;
                }

                // 解决冲突
                if (finalIsVerb && finalIsNoun) {
                    if (isCommonMisidentifiedNoun || isCommonNoun) {
                        finalIsVerb = false;
                    } else if (hasArticleBefore) {
                        finalIsVerb = false;
                    } else if (hasAuxiliaryBefore) {
                        finalIsNoun = false;
                    } else if (isNounBySuffixAnalysis && !isVerbBySuffixAnalysis) {
                        finalIsVerb = false;
                    } else if (isVerbBySuffixAnalysis && !isNounBySuffixAnalysis) {
                        finalIsNoun = false;
                    }
                }

                // 缓存结果
                updateCache(cleanWord, finalIsVerb, finalIsNoun);

                return {
                    word,
                    isVerb: finalIsVerb,
                    isNoun: finalIsNoun
                };
            }).filter(Boolean);

            results.push(...terms as { word: string, isVerb: boolean, isNoun: boolean }[]);
        }
    } catch (e) {
        // 如果上下文分析失败，回退到简单的词汇分析
        const words = text.match(/\b[\w']+\b/g) || [];

        for (const word of words) {
            results.push({
                word,
                isVerb: isVerb(word),
                isNoun: isNoun(word)
            });
        }
    }

    return results;
}

/**
 * 清理单词，移除标点符号等
 */
function cleanupWord(word: string): string {
    if (!word) return '';
    return word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?:"'\[\]]/g, "");
}

/**
 * 更新词性缓存
 */
function updateCache(word: string, isVerb: boolean, isNoun: boolean): void {
    partOfSpeechCache.set(word, { isVerb, isNoun });

    // 限制缓存大小，防止内存泄漏
    if (partOfSpeechCache.size > 10000) {
        // 删除最早添加的100个条目
        const keysToDelete = Array.from(partOfSpeechCache.keys()).slice(0, 100);
        keysToDelete.forEach(key => partOfSpeechCache.delete(key));
    }
} 