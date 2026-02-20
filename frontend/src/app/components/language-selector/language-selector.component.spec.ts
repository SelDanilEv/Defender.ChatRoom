import { EventEmitter } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { LanguageSelectorComponent } from './language-selector.component';

describe('LanguageSelectorComponent', () => {
  let onLangChange$: EventEmitter<{ lang: string }>;
  let translateMock: TranslateService & { use: jasmine.Spy; currentLang: string; onLangChange: EventEmitter<{ lang: string }> };
  let component: LanguageSelectorComponent;

  beforeEach(() => {
    onLangChange$ = new EventEmitter<{ lang: string }>();
    translateMock = {
      use: jasmine.createSpy('use'),
      currentLang: 'en',
      onLangChange: onLangChange$,
    } as unknown as TranslateService & {
      use: jasmine.Spy;
      currentLang: string;
      onLangChange: EventEmitter<{ lang: string }>;
    };
    component = new LanguageSelectorComponent(translateMock);
  });

  it('uses saved language from localStorage on init', () => {
    spyOn(window.localStorage, 'getItem').and.returnValue('bl');

    component.ngOnInit();

    expect(component.currentLanguage).toBe('bl');
  });

  it('falls back to TranslateService current language on init', () => {
    spyOn(window.localStorage, 'getItem').and.returnValue(null);
    translateMock.currentLang = 'ru';

    component.ngOnInit();

    expect(component.currentLanguage).toBe('ru');
  });

  it('changes language and persists selection', () => {
    const setItemSpy = spyOn(window.localStorage, 'setItem');
    const event = { target: { value: 'ru' } } as unknown as Event;

    component.onLanguageChange(event);

    expect(translateMock.use).toHaveBeenCalledWith('ru');
    expect(setItemSpy).toHaveBeenCalledWith('language', 'ru');
  });
});
