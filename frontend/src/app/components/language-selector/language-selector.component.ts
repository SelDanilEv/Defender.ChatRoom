import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

type Language = 'en' | 'ru' | 'bl';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="language-selector">
      <select [value]="currentLanguage" (change)="onLanguageChange($event)">
        <option value="en">English</option>
        <option value="ru">Русский</option>
        <option value="bl">Беларуская</option>
      </select>
    </div>
  `,
  styles: [`
    .language-selector {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 1000;
    }
    
    .language-selector select {
      background: #333;
      color: #fff;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 8px 12px;
      font-size: 14px;
      cursor: pointer;
      outline: none;
      min-width: 120px;
    }
    
    .language-selector select:hover {
      background: #444;
      border-color: #666;
    }
    
    .language-selector select:focus {
      border-color: #4a9eff;
    }
  `]
})
export class LanguageSelectorComponent implements OnInit {
  currentLanguage: Language = 'en';

  constructor(private translateService: TranslateService) {}

  ngOnInit(): void {
    const savedLang = localStorage.getItem('language') as Language;
    if (savedLang && (savedLang === 'en' || savedLang === 'ru' || savedLang === 'bl')) {
      this.currentLanguage = savedLang;
    } else {
      this.currentLanguage = this.translateService.currentLang as Language || 'en';
    }
    
    this.translateService.onLangChange.subscribe((event) => {
      this.currentLanguage = event.lang as Language;
    });
  }

  onLanguageChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const lang = target.value as Language;
    this.translateService.use(lang);
    localStorage.setItem('language', lang);
  }
}
