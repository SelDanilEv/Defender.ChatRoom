import { routes } from './app.routes';
import { WelcomeComponent } from './welcome/welcome.component';
import { RoomComponent } from './room/room.component';

describe('app routes', () => {
  it('defines root route to WelcomeComponent', () => {
    const root = routes.find((r) => r.path === '');
    expect(root?.component).toBe(WelcomeComponent);
  });

  it('defines room route to RoomComponent', () => {
    const room = routes.find((r) => r.path === 'room');
    expect(room?.component).toBe(RoomComponent);
  });
});
