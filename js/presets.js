import { T, getLang } from './i18n.js';

const POS_ZH = ['名词', '动词', '形容词', '副词', '代词', '数词', '量词', '介词', '连词', '助词', '感叹词'];
const POS_EN = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Pronoun', 'Numeral', 'Classifier', 'Preposition', 'Conjunction', 'Particle', 'Interjection'];

/** 新建项目时的模板。在调用时生成，以便使用当前界面语言。 */
export function getPresets() {
  const pos = getLang() === 'zh' ? POS_ZH : POS_EN;
  return {
    deck_basic: {
      kind: 'deck',
      label: T('基础：单词 / 释义 / 例句 / 笔记', 'Basic: word / meaning / example / notes'),
      tables: [{ name: T('单词', 'Words'), role: 'words', fields: [
        { key: 'word', label: T('单词', 'Word'), type: 'short_text' },
        { key: 'meaning', label: T('释义', 'Meaning'), type: 'long_text' },
        { key: 'example', label: T('例句', 'Example'), type: 'long_text' },
        { key: 'note', label: T('笔记', 'Notes'), type: 'long_text' },
      ] }],
      settings: { faces: [['word'], ['meaning', 'example', 'note']], newPerDay: 20, ttsField: 'word', ttsLang: 'en-US' },
    },
    deck_german: {
      kind: 'deck',
      label: T('德语名词：冠词+原形 / 复数 / 释义', 'German nouns: article + noun / plural / meaning'),
      tables: [{ name: T('单词', 'Words'), role: 'words', fields: [
        { key: 'article', label: T('冠词', 'Article'), type: 'select', options: { choices: ['der', 'die', 'das'] } },
        { key: 'word', label: T('原形', 'Noun'), type: 'short_text' },
        { key: 'plural', label: T('复数', 'Plural'), type: 'short_text' },
        { key: 'meaning', label: T('释义', 'Meaning'), type: 'long_text' },
        { key: 'example', label: T('例句', 'Example'), type: 'long_text' },
      ] }],
      settings: { faces: [['article', 'word'], ['plural'], ['meaning', 'example']], newPerDay: 20, ttsField: 'word', ttsLang: 'de-DE' },
    },
    deck_blank: {
      kind: 'deck',
      label: T('空白：正面 / 背面', 'Blank: front / back'),
      tables: [{ name: T('单词', 'Words'), role: 'words', fields: [
        { key: 'front', label: T('正面', 'Front'), type: 'short_text' },
        { key: 'back', label: T('背面', 'Back'), type: 'long_text' },
      ] }],
      settings: { faces: [['front'], ['back']], newPerDay: 20, ttsField: 'front', ttsLang: 'en-US' },
    },
    dict_conlang: {
      kind: 'dictionary',
      label: T('自创语言：词条 + 字元表（含读音、词源、逐字拆解）', 'Conlang: entries + character table (pronunciation, etymology, breakdown)'),
      tables: [
        { name: T('词汇', 'Words'), role: 'words', fields: [
          { key: 'headword', label: T('词条', 'Headword'), type: 'short_text', options: { placement: 'title' } },
          { key: 'script', label: T('书写形式', 'Written form'), type: 'short_text', options: { placement: 'subtitle' } },
          { key: 'etymology', label: T('词源', 'Etymology'), type: 'long_text', options: { placement: 'shared' } },
          { key: 'ipa', label: 'IPA', type: 'short_text', options: { placement: 'shared', group: T('发音', 'Pronunciation') } },
          { key: 'roman', label: T('罗马字', 'Romanization'), type: 'short_text', options: { placement: 'shared', group: T('发音', 'Pronunciation') } },
          { key: 'pos', label: T('词性', 'Part of speech'), type: 'select', options: { placement: 'pos', choices: pos } },
          { key: 'definition', label: T('释义', 'Definitions'), type: 'long_text', options: { placement: 'sense' } },
          { key: 'chars', label: T('本词中的字', 'Characters in this term'), type: 'char_breakdown', options: { placement: 'infobox' } },
          { key: 'related', label: T('相关词', 'Related terms'), type: 'entry_link', options: { placement: 'shared' } },
        ] },
        { name: T('字元', 'Characters'), role: 'characters', fields: [
          { key: 'char', label: T('字符', 'Character'), type: 'short_text' },
          { key: 'reading', label: T('读音', 'Reading'), type: 'short_text' },
          { key: 'rtype', label: T('读法类型', 'Reading type'), type: 'select', options: { choicesFrom: 'readingTypes' } },
          { key: 'gloss', label: T('含义', 'Meaning'), type: 'short_text' },
        ] },
      ],
      settings: { readingTypes: [], keyboard: '' },
    },
    dict_simple: {
      kind: 'dictionary',
      label: T('简单词典：词条 / 词性 / 释义 / 词源', 'Simple: headword / part of speech / definitions / etymology'),
      tables: [{ name: T('词汇', 'Words'), role: 'words', fields: [
        { key: 'headword', label: T('词条', 'Headword'), type: 'short_text', options: { placement: 'title' } },
        { key: 'etymology', label: T('词源', 'Etymology'), type: 'long_text', options: { placement: 'shared' } },
        { key: 'pos', label: T('词性', 'Part of speech'), type: 'select', options: { placement: 'pos', choices: pos } },
        { key: 'definition', label: T('释义', 'Definitions'), type: 'long_text', options: { placement: 'sense' } },
      ] }],
      settings: { readingTypes: [], keyboard: '' },
    },
  };
}
