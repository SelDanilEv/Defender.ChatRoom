import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-participant',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="participant-card" [class.participant-card-self]="isSelf()" [class.participant-card-other]="!isSelf()">
      <div class="participant-avatar">
        <span class="participant-initial">{{ name().charAt(0).toUpperCase() }}</span>
      </div>
      <div class="participant-info">
        <div class="participant-name">{{ name() }}</div>
        <div class="participant-badge" [class.participant-badge-hidden]="!isSelf()">
          {{ isSelf() ? ('room.you' | translate) : '' }}
        </div>
        <div class="participant-status">
          @if (muted()) {
            <span class="status-muted">🔇 {{ 'room.muted' | translate }}</span>
          } @else {
            <span class="status-speaking">🔊 {{ 'room.speaking' | translate }}</span>
          }
        </div>
      </div>
    </div>
  `
})
export class ParticipantComponent {
  name = input.required<string>();
  muted = input.required<boolean>();
  isSelf = input.required<boolean>();
}
