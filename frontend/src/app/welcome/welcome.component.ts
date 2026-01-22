import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageSelectorComponent } from '../components/language-selector/language-selector.component';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [FormsModule, CommonModule, TranslateModule, LanguageSelectorComponent],
  template: `
    <app-language-selector></app-language-selector>
    <div class="container">
      <div class="card">
        <h1>{{ 'welcome.title' | translate }}</h1>
        <p style="margin-bottom: 24px; color: #aaa;">{{ 'welcome.subtitle' | translate }}</p>
        
        <div *ngIf="errorMessage" class="error">{{ errorMessage }}</div>
        <div *ngIf="infoMessage" class="info">{{ infoMessage }}</div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; color: #aaa;">{{ 'welcome.displayName' | translate }}</label>
          <input 
            type="text" 
            [(ngModel)]="displayName" 
            [placeholder]="'welcome.displayNamePlaceholder' | translate"
            (keyup.enter)="joinRoom()"
          />
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; color: #aaa;">{{ 'welcome.passphrase' | translate }}</label>
          <input 
            type="password" 
            [(ngModel)]="passphrase" 
            [placeholder]="'welcome.passphrasePlaceholder' | translate"
            (keyup.enter)="joinRoom()"
          />
        </div>
        
        <button (click)="joinRoom()" [disabled]="joining">
          {{ (joining ? 'welcome.joining' : 'welcome.joinRoom') | translate }}
        </button>
      </div>
    </div>
  `
})
export class WelcomeComponent {
  displayName = '';
  passphrase = '';
  joining = false;
  errorMessage = '';
  infoMessage = '';

  constructor(
    private router: Router
  ) {
    const state = history.state;
    if (state && state.message) {
      this.infoMessage = state.message;
    }
  }

  joinRoom() {
    if (this.joining) return;
    
    this.joining = true;
    this.errorMessage = '';
    
    const name = this.displayName.trim() || `Guest-${Math.floor(Math.random() * 9000) + 1000}`;
    
    this.router.navigate(['/room'], { 
      state: { displayName: name, passphrase: this.passphrase } 
    });
  }
}
