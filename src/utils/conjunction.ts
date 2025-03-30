// 连词识别模块
// 完全基于词典的实现，不依赖外部NLP库

// 常见连词列表
const COMMON_CONJUNCTIONS = new Set([
    // 表示转折的连词
    'but', 'however', 'nevertheless', 'nonetheless', 'yet', 'still',
    'on the contrary', 'in contrast to', 'contrary to', 'as opposed to',
    'despite the fact that', 'in spite of', 'notwithstanding',
    'while this is true', 'on the other hand', 'by contrast',
    'alternatively', 'conversely', 'meanwhile', 'whereas',
    'although this is true', 'granted that', 'even though',

    // 表示因果的连词
    'because', 'therefore', 'consequently', 'hence', 'thus',
    'as a result of', 'due to the fact that', 'owing to', 'on account of',
    'in consequence of', 'as a consequence of', 'for this reason',
    'thanks to', "that's why", 'which is why', 'this means that',
    'as a result', 'accordingly',

    // 表示递进的连词
    'moreover', 'furthermore', 'besides', 'additionally',
    'in addition to', 'what is more', 'not only...but also',
    'not to mention', 'as well as', 'besides that', 'in the same way',
    'similarly', 'likewise', 'by the same token', 'in like manner',
    'equally important', 'another key point', 'coupled with',
    'together with', 'along with', 'not to mention that',

    // 表示条件的连词
    'if', 'unless', 'provided', 'supposing', 'assuming',
    'provided that', 'assuming that', 'on condition that',
    'in the event that', 'as long as', 'so long as',
    'if and only if', 'unless and until', 'on the assumption that',
    'given that', 'in case of', 'subject to', 'contingent on',
    'in the case that', 'supposing that', 'even if', 'only if',
    'if ever', 'whenever',

    // 表示让步的连词
    'although', 'even if', 'even though', 'while', 'whereas',
    'despite', 'in spite of', 'notwithstanding', 'regardless of',
    'no matter what', 'whatever happens', 'come what may',

    // 表示目的的连词
    'so that', 'in order that', 'lest', 'with the aim of',
    'for the purpose of', 'with a view to', 'to the end that',
    'in the hope that', 'with the intention of',

    // 表示对比的连词
    'while', 'whereas', 'rather than', 'instead of',
    'in contrast to', 'as opposed to', 'on the contrary',
    'by comparison', 'in comparison with', 'compared to',

    // 表示选择的连词
    'or', 'either...or', 'neither...nor', 'whether...or',
    'alternatively', 'otherwise', 'on the other hand',

    // 表示总结的连词
    'in conclusion', 'to sum up', 'in summary', 'all in all',
    'to conclude', 'to summarize', 'in brief', 'in short',
    'on the whole', 'altogether', 'in essence',
    'in the final analysis', 'ultimately', 'finally',
    'last but not least', 'in the end', 'to put it briefly',
    'in a nutshell', 'all things considered',
    'taking everything into account', 'by and large',

    // 表示解释说明的连词
    'that is', 'in other words', 'namely', 'specifically',
    'for example', 'for instance', 'to illustrate', 'to demonstrate',
    'as an illustration', 'as demonstrated by', 'such as',
    'particularly', 'in particular', 'notably',
    'a case in point', 'take the case of', 'by way of example',
    'to take a case in point', 'as shown by', 'as exemplified by',
    'to put it another way', 'that is to say',

    // 表示时间顺序和过渡的连词
    'first and foremost', 'to begin with', 'in the first place',
    'following this', 'subsequently', 'after that', 'previously',
    'simultaneously', 'meanwhile', 'in the meantime',
    'at the same time', 'thereafter', 'eventually', 'ultimately',
    'in due course', 'at this point', 'from this point on',
    'up to this point', 'at this stage', 'in the next phase'
]);

// 多词短语的第一个词集合
const PHRASE_FIRST_WORDS = new Set(
    Array.from(COMMON_CONJUNCTIONS)
        .filter(conj => conj.includes(' '))
        .map(conj => conj.split(' ')[0])
);

// 配对连词
const PAIRED_CONJUNCTIONS = new Map([
    ['not', 'only...but also'],
    ['either', 'or'],
    ['neither', 'nor'],
    ['whether', 'or'],
    ['both', 'and'],
    ['not', 'but'],
    ['if', 'then']
]);

// 连词变体映射
const CONJUNCTION_VARIANTS = new Map([
    ['though', 'although'],
    ['altho', 'although'],
    ['cos', 'because'],
    ['coz', 'because'],
    ['cause', 'because'],
    ['whilst', 'while']
]);

// 连词缓存
const conjunctionCache = new Map<string, boolean>();
const phraseCache = new Map<string, boolean>();

/**
 * 清理单词，移除标点符号等
 */
function cleanupWord(word: string): string {
    if (!word) return '';
    return word.toLowerCase().replace(/[.,#!$%&*;:{}=\-_`~()?:"'[\]]/g, "");
}

/**
 * 检查是否是连词短语的一部分
 */
function isPhraseComponent(word: string): boolean {
    const cleanWord = cleanupWord(word);
    if (!cleanWord) return false;

    // 检查缓存
    if (phraseCache.has(cleanWord)) {
        return phraseCache.get(cleanWord)!;
    }

    // 检查是否是短语的第一个词
    const isFirstWord = PHRASE_FIRST_WORDS.has(cleanWord);
    
    // 检查是否是配对连词的一部分
    const isPaired = PAIRED_CONJUNCTIONS.has(cleanWord) || 
                    Array.from(PAIRED_CONJUNCTIONS.values()).some(v => v.includes(cleanWord));

    const result = isFirstWord || isPaired;
    phraseCache.set(cleanWord, result);
    return result;
}

/**
 * 检测单词是否为连词
 * @param word 待检查的单词
 * @returns 是否为连词
 */
export function isConjunction(word: string): boolean {
    // Clean up the word and check cache first
    const cleanedWord = cleanupWord(word);
    if (conjunctionCache.has(cleanedWord)) {
        return conjunctionCache.get(cleanedWord)!;
    }

    // Check if the word is in our common conjunctions set
    if (COMMON_CONJUNCTIONS.has(cleanedWord)) {
        conjunctionCache.set(cleanedWord, true);
        return true;
    }

    // Check if it's part of a conjunction phrase
    if (PHRASE_FIRST_WORDS.has(cleanedWord)) {
        conjunctionCache.set(cleanedWord, true);
        return true;
    }

    // Check conjunction variants
    if (CONJUNCTION_VARIANTS.has(cleanedWord)) {
        conjunctionCache.set(cleanedWord, true);
        return true;
    }

    // Check if it's part of a paired conjunction
    for (const [first, second] of PAIRED_CONJUNCTIONS) {
        if (cleanedWord === first || cleanedWord === second) {
            conjunctionCache.set(cleanedWord, true);
            return true;
        }
    }

    // If we reach here, it's not a conjunction
    conjunctionCache.set(cleanedWord, false);
    return false;
} 