# Colorful Bionic

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

**Color**ful **bio**nic **read**ing **exper**ience **wi**th **Zot**ero. **High**light **verb**s **an**d **nou**ns **i**n **differ**ent **colo**rs.

<div align=center><img src="./temp_images/teaser 4.png" width="800px"></img></div>

## Personal Usage Recommendations

Based on personal experience, I recommend enabling black Bionic text and verb highlighting. Using verbs as memory anchors in sentences can significantly improve reading speed for individuals with ADHD. Additionally, highlighting only verbs keeps the text clean and less visually overwhelming.

Setting nouns to gray color can further emphasize the distinction between nouns and verbs in certain contexts, helping to further highlight verbs (as well as verbal roots in gerunds and other verb-derived forms). This visual differentiation enhances the reader's ability to quickly identify action elements within text.

Depending on your reading style, enabling conjunction highlighting can also enhance the reading experience. When you notice longer yellow-highlighted conjunctions (such as "however", "in addition", etc.), they often serve as important markers that help you understand paragraph structure and content flow.

<div align=center><img src="./temp_images/teaser 5.png" width="800px"></img></div>

## 🧩 Outline

[🧐 What is this?](#-what-is-this)

[👋 Install](#-install)

[😎 Quick start](#-quick-start)

[📝 Changelog](#-changelog)

[🔧 Development](#-development)

[🔔 Disclaimer](#-disclaimer)

[🙏 Acknowledgements](#-acknowledgements)

[🤗 Contributors](#-contributors)

## 🧐 What is this?

Colorful Bionic is a Zotero plugin that implements a colorful bionic reading experience in the Zotero reader. It highlights verbs nouns and conjunction in different colors to enhance reading comprehension.

### Technical Implementation and Limitations

This plugin uses the **compromise** package for part-of-speech recognition. Due to the limitations of this package, which doesn't support syntactic parsing of grammatical structures, it may not accurately identify various gerunds, verb transformations, etc. While other larger NLP packages might offer better parsing accuracy, they are constrained by Zotero's extension installation environment. For example, Stanford's Stanza package would require mounting a server on the system, making it complex to install and call from Zotero, and it would process PDFs much more slowly.

I have also experimented with Wink NLP, but found that its parsing results were not significantly different from compromise. Consequently, this package's verb recognition is not perfectly accurate and may include some omissions or incorrect annotations. However, the verbs that are highlighted still generally provide important information. I believe they remain crucial parts of sentences, and readers should be able to understand entire sentences by focusing primarily on these highlighted verbs.

As someone with severe ADHD, I find that this functionality significantly aids my reading process, making it easier to focus on and comprehend text.

### What is bionic reading?

Bionic Reading is a reading method designed to make it easier and faster to comprehend text by guiding the reader's eyes through bolded initial letters of words. This technique emphasizes the beginning of each word, allowing the brain to "fill in" the rest of the word and phrase intuitively, leveraging cognitive shortcuts.

**A**s **sho**wn **i**n **th**is **sent**ence, **t**he **bol**ded **init**ial **lett**ers **o**f **ea**ch **wo**rd **a**re **us**ed **t**o **gui**de **t**he **read**er's **ey**es **thro**ugh **t**he **te**xt, **mak**ing **i**t **eas**ier **t**o **compr**ehend.

### Why bionic reading works/doesn't work?

The effectiveness of Bionic Reading is a subject of ongoing debate, largely because it depends on individual differences in reading habits, cognitive processing, and preferences.

Want to know more? Check out the latest research on [Google Scholar](https://scholar.google.com/scholar?q=bionic%20reading).

## 👋 Install

- Download the plugin (.xpi file) from below.

  - [Latest Stable](https://github.com/DrUsagi/Colorful-Bionic/releases/latest)
  - [All Releases](https://github.com/DrUsagi/Colorful-Bionic/releases)

  _Note_: If you're using Firefox as your browser, right-click the `.xpi` and select "Save As.."

- In Zotero click `Tools` in the top menu bar and then click `Plugins`
- Go to the Extensions page and then click the gear icon in the top right.
- Select `Install Add-on from file`.
- Browse to where you downloaded the `.xpi` file and select it.
- Finish!

## 😎 Quick start

1. Open a PDF in the Zotero reader.
2. The PDF will be displayed in bionic reading mode by default.
3. To toggle bionic reading mode and other features, use the `Bio` menu in the top menu bar or the BIO button in the toolbar.
4. You can highlight verbs and nouns in different colors to enhance comprehension.

## 📝 Changelog

### v1.1 (April 11, 2025)

#### New Features and Improvements
- **Enhanced UI**: Redesigned BIO button display to show active features with their respective colors (V for verbs, N for nouns, C for conjunctions, P for punctuation)
- **Color Memory**: Colors are now saved per document, allowing different PDFs to have custom color settings
- **Improved Menu Positioning**: Menu now appears to the left of the BIO button to avoid overlapping with the sidebar
- **Punctuation Enhancement**: Added bold punctuation feature with size adjustment and color highlighting, making it easier to identify sentence boundaries
- **Expanded Color Options**: More color choices are now available for each part of speech highlighting, giving users greater customization flexibility
- **Sentence Boundary Recognition**: Enhanced comma and period highlighting helps readers better identify sentence structures and boundaries
- **State Persistence**: All settings (including punctuation bold state) are now properly saved and restored per document
- **Visual Indicator**: BIO button now shows status indicators with appropriate styling (color and bold) based on active features

#### Bug Fixes
- Fixed punctuation bold settings not being remembered between sessions
- Fixed menu overlap issues with sidebar content
- Fixed color settings not being preserved when reopening documents

## 🔧 Development

This plugin is built based on the [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template). See the setup and debug details there.

To start, run

```bash
git clone https://github.com/DrUsagi/Colorful-Bionic.git
cd Colorful-Bionic
npm install
npm run build
```

The plugin is built to `./builds/*.xpi`.

## 🔔 Disclaimer

Use this code under AGPL. No warranties are provided. Keep the laws of your locality in mind!

## 🙏 Acknowledgements

Colorful Bionic is a modified version based on Bionic for Zotero plugin [Bionic for Zotero](https://github.com/windingwind/bionic-for-zotero) developed by [windingwind](https://github.com/windingwind). 
Special thanks to windingwind for his contribution and pioneering work, which made this enhanced version possible. While the original plugin provides basic Bionic reading functionality, this version adds features like colorful part-of-speech highlighting.

Colorful Bionic是在[windingwind](https://github.com/windingwind)开发的[Bionic for Zotero](https://github.com/windingwind/bionic-for-zotero)插件基础上修改而来的。在此特别感谢windingwind的贡献和开创性工作，使这个增强版本得以实现。原插件提供了基本的Bionic阅读功能，而本版本增加了多彩词性高亮等功能。

## 🤗 Contributors

- DrUsagi (Current Maintainer)
- [windingwind](https://github.com/windingwind) (Original Author of Bionic for Zotero)
