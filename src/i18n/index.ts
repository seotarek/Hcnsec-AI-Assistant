import { I18nStrings } from './en';
import en from './en';
import ar from './ar';
import zh from './zh';

export type Language = 'en' | 'ar' | 'zh';

const strings: Record<Language, I18nStrings> = { en, ar, zh };

export function getStrings(lang: Language): I18nStrings {
    return strings[lang] || strings['en'];
}

export function isRTL(lang: Language): boolean {
    return lang === 'ar';
}
