import { Router } from '@angular/router';

import { WelcomeComponent } from './welcome.component';

describe('WelcomeComponent', () => {
  let routerMock: jasmine.SpyObj<Router>;
  let component: WelcomeComponent;

  beforeEach(() => {
    routerMock = jasmine.createSpyObj<Router>('Router', ['navigate']);
    component = new WelcomeComponent(routerMock);
  });

  it('navigates to room with trimmed display name', () => {
    component.displayName = '  Alice  ';
    component.passphrase = 'secret';

    component.joinRoom();

    expect(routerMock.navigate).toHaveBeenCalledWith(['/room'], {
      state: { displayName: 'Alice', passphrase: 'secret' },
    });
  });

  it('does not navigate when join is already in progress', () => {
    component.joining = true;

    component.joinRoom();

    expect(routerMock.navigate).not.toHaveBeenCalled();
  });
});
