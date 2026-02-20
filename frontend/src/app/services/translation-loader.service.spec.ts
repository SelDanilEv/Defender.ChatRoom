import { CustomTranslateLoader } from './translation-loader.service';

describe('CustomTranslateLoader', () => {
  let loader: CustomTranslateLoader;

  beforeEach(() => {
    loader = new CustomTranslateLoader();
  });

  it('returns requested language translations when available', (done) => {
    loader.getTranslation('ru').subscribe((translations) => {
      expect(translations['welcome.title']).toBe('Аудио Комната');
      done();
    });
  });

  it('falls back to english when language is unknown', (done) => {
    loader.getTranslation('unknown').subscribe((translations) => {
      expect(translations['app.title']).toBe('Audio Call Room');
      done();
    });
  });
});
