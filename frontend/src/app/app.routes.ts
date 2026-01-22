import { Routes } from '@angular/router';
import { WelcomeComponent } from './welcome/welcome.component';
import { RoomComponent } from './room/room.component';

export const routes: Routes = [
  { path: '', component: WelcomeComponent },
  { path: 'room', component: RoomComponent }
];
