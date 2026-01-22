import { Injectable } from '@angular/core';

export type Language = 'en' | 'ru' | 'bl';

interface Translations {
  [key: string]: string;
}

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private currentLanguage: Language = 'en';
  private translations: { [lang: string]: Translations } = {
    en: {
      'app.title': 'Audio Call Room',
      'welcome.title': 'Audio Call Room',
      'welcome.subtitle': 'Join the shared audio-only call room',
      'welcome.displayName': 'Display Name (optional)',
      'welcome.displayNamePlaceholder': 'Leave empty for anonymous name',
      'welcome.passphrase': 'Passphrase (if required)',
      'welcome.passphrasePlaceholder': 'Enter room passphrase',
      'welcome.joinRoom': 'Join Room',
      'welcome.joining': 'Joining...',
      'room.title': 'Audio Call Room',
      'room.participants': 'Participants',
      'room.you': 'You',
      'room.muted': 'Muted',
      'room.speaking': 'Speaking',
      'room.noParticipants': 'No other participants yet...',
      'room.unmute': 'Unmute',
      'room.mute': 'Mute',
      'room.volumeLevel': 'Volume Level',
      'room.micLevel': 'My Mic Level',
      'room.leaveRoom': 'Leave Room',
      'room.connecting': 'Connecting...',
      'room.reconnecting': 'Reconnecting (attempt {0}/{1})...',
      'room.disconnected': 'Connection lost. Attempting to reconnect...',
      'room.poorConnection': 'Poor connection detected. Audio quality may be affected.',
      'room.micRequired': 'Microphone access is required to join the call.',
      'room.requestMicAccess': 'Allow Microphone Access',
      'room.requestingMicAccess': 'Requesting microphone access...',
      'room.disconnectedInactivity': 'Disconnected due to inactivity',
      'room.disconnectedReset': 'Room has been reset by administrator',
      'room.failedToJoin': 'Failed to join room.',
      'room.failedToAccessMic': 'Failed to access microphone. Please check your settings',
      'room.micPermissionDenied': 'Microphone permission denied. Please click the button below to allow access.',
      'room.noMicFound': 'No microphone found. Please connect a microphone and try again.',
      'room.micInUse': 'Microphone is already in use by another application.',
      'room.micUserInteraction': 'Microphone access requires a user interaction. Please click the button below.',
      'room.failedToReconnect': 'Failed to reconnect after multiple attempts. Please refresh the page.',
      'common.error': 'Error',
      'common.language': 'Language'
    },
    ru: {
      'app.title': 'Аудио Комната',
      'welcome.title': 'Аудио Комната',
      'welcome.subtitle': 'Присоединитесь к общей аудио-комнате',
      'welcome.displayName': 'Отображаемое имя (необязательно)',
      'welcome.displayNamePlaceholder': 'Оставьте пустым для анонимного имени',
      'welcome.passphrase': 'Пароль (если требуется)',
      'welcome.passphrasePlaceholder': 'Введите пароль комнаты',
      'welcome.joinRoom': 'Войти в комнату',
      'welcome.joining': 'Подключение...',
      'room.title': 'Аудио Комната',
      'room.participants': 'Участники',
      'room.you': 'Вы',
      'room.muted': 'Отключен звук',
      'room.speaking': 'Говорит',
      'room.noParticipants': 'Пока нет других участников...',
      'room.unmute': 'Включить звук',
      'room.mute': 'Отключить звук',
      'room.volumeLevel': 'Уровень громкости',
      'room.micLevel': 'Уровень микрофона',
      'room.leaveRoom': 'Покинуть комнату',
      'room.connecting': 'Подключение...',
      'room.reconnecting': 'Переподключение (попытка {0}/{1})...',
      'room.disconnected': 'Соединение потеряно. Попытка переподключения...',
      'room.poorConnection': 'Обнаружено плохое соединение. Качество звука может быть снижено.',
      'room.micRequired': 'Для участия в звонке требуется доступ к микрофону.',
      'room.requestMicAccess': 'Разрешить доступ к микрофону',
      'room.requestingMicAccess': 'Запрос доступа к микрофону...',
      'room.disconnectedInactivity': 'Отключено из-за неактивности',
      'room.disconnectedReset': 'Комната была сброшена администратором',
      'room.failedToJoin': 'Не удалось войти в комнату.',
      'room.failedToAccessMic': 'Не удалось получить доступ к микрофону. Проверьте настройки',
      'room.micPermissionDenied': 'Доступ к микрофону запрещен. Нажмите кнопку ниже, чтобы разрешить доступ.',
      'room.noMicFound': 'Микрофон не найден. Подключите микрофон и попробуйте снова.',
      'room.micInUse': 'Микрофон уже используется другим приложением.',
      'room.micUserInteraction': 'Для доступа к микрофону требуется взаимодействие с пользователем. Нажмите кнопку ниже.',
      'room.failedToReconnect': 'Не удалось переподключиться после нескольких попыток. Обновите страницу.',
      'common.error': 'Ошибка',
      'common.language': 'Язык'
    },
    bl: {
      'app.title': 'Аўдыё Пакой',
      'welcome.title': 'Аўдыё Пакой',
      'welcome.subtitle': 'Далучайцеся да агульнага аўдыё-пакоя',
      'welcome.displayName': 'Імя для адлюстравання (неабавязкова)',
      'welcome.displayNamePlaceholder': 'Пакіньце пустым для ананімнага імя',
      'welcome.passphrase': 'Пароль (калі патрабуецца)',
      'welcome.passphrasePlaceholder': 'Увядзіце пароль пакоя',
      'welcome.joinRoom': 'Увайсці ў пакой',
      'welcome.joining': 'Падключэнне...',
      'room.title': 'Аўдыё Пакой',
      'room.participants': 'Удзельнікі',
      'room.you': 'Вы',
      'room.muted': 'Выключаны гук',
      'room.speaking': 'Гаворыць',
      'room.noParticipants': 'Пакуль няма іншых удзельнікаў...',
      'room.unmute': 'Уключыць гук',
      'room.mute': 'Выключыць гук',
      'room.volumeLevel': 'Узровень гучнасці',
      'room.micLevel': 'Узровень мікрафона',
      'room.leaveRoom': 'Пакінуць пакой',
      'room.connecting': 'Падключэнне...',
      'room.reconnecting': 'Перападключэнне (спроба {0}/{1})...',
      'room.disconnected': 'Злучэнне страчана. Спроба перападключэння...',
      'room.poorConnection': 'Выяўлена дрэннае злучэнне. Якасць гуку можа быць зніжана.',
      'room.micRequired': 'Для ўдзелу ў званку патрабуецца доступ да мікрафона.',
      'room.requestMicAccess': 'Дазволіць доступ да мікрафона',
      'room.requestingMicAccess': 'Запыт доступу да мікрафона...',
      'room.disconnectedInactivity': 'Адключана з-за неактыўнасці',
      'room.disconnectedReset': 'Пакой быў скінуты адміністратарам',
      'room.failedToJoin': 'Не ўдалося ўвайсці ў пакой.',
      'room.failedToAccessMic': 'Не ўдалося атрымаць доступ да мікрафона. Праверце налады',
      'room.micPermissionDenied': 'Доступ да мікрафона забаронены. Націсніце кнопку ніжэй, каб дазволіць доступ.',
      'room.noMicFound': 'Мікрафон не знойдзены. Падключыце мікрафон і паспрабуйце зноў.',
      'room.micInUse': 'Мікрафон ужо выкарыстоўваецца іншым прыкладаннем.',
      'room.micUserInteraction': 'Для доступу да мікрафона патрабуецца ўзаемадзеянне з карыстальнікам. Націсніце кнопку ніжэй.',
      'room.failedToReconnect': 'Не ўдалося перападключыцца пасля некалькіх спроб. Абнавіце старонку.',
      'common.error': 'Памылка',
      'common.language': 'Мова'
    }
  };

  constructor() {
    const savedLang = localStorage.getItem('language') as Language;
    if (savedLang && (savedLang === 'en' || savedLang === 'ru' || savedLang === 'bl')) {
      this.currentLanguage = savedLang;
    }
  }

  getCurrentLanguage(): Language {
    return this.currentLanguage;
  }

  setLanguage(lang: Language): void {
    this.currentLanguage = lang;
    localStorage.setItem('language', lang);
    window.location.reload();
  }

  translate(key: string, params?: string[]): string {
    const translation = this.translations[this.currentLanguage]?.[key] || this.translations['en'][key] || key;
    
    if (params && params.length > 0) {
      return translation.replace(/\{(\d+)\}/g, (match, index) => {
        const paramIndex = parseInt(index, 10);
        return params[paramIndex] !== undefined ? params[paramIndex] : match;
      });
    }
    
    return translation;
  }

  instant(key: string, params?: string[]): string {
    return this.translate(key, params);
  }
}
