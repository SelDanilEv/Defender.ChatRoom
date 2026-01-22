import { importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslateLoader } from '@ngx-translate/core';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { CustomTranslateLoader } from './app/services/translation-loader.service';

const savedLang = localStorage.getItem('language') || 'en';
const initialLang = (savedLang === 'en' || savedLang === 'ru' || savedLang === 'bl') ? savedLang : 'en';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    importProvidersFrom(
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useClass: CustomTranslateLoader
        },
        defaultLanguage: initialLang
      })
    )
  ]
}).then(appRef => {
  const translateService = appRef.injector.get(TranslateService);
  translateService.use(initialLang);
}).catch(err => console.error(err));
