import { Component, EventEmitter, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-room-controls',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="controls">
      <button 
        class="control-button control-button-mute"
        (click)="toggleMute.emit()" 
        [style.background]="isMuted() ? '#d32f2f' : '#4a9eff'"
      >
        <span class="button-icon">{{ isMuted() ? '🔇' : '🔊' }}</span>
        <span class="button-text">{{ (isMuted() ? 'room.unmute' : 'room.mute') | translate }}</span>
      </button>
      
      <div class="volume-control">
        <label>{{ 'room.volumeLevel' | translate }}</label>
        <input 
          type="range" 
          min="0" 
          max="100" 
          [value]="volume()"
          (input)="onVolumeChange($event)"
        />
        <div class="volume-value">
          <span>0%</span>
          <span>{{ volume() }}%</span>
          <span>100%</span>
        </div>
      </div>
      
      <div class="volume-control">
        <label>{{ 'room.micLevel' | translate }}</label>
        <input 
          type="range" 
          min="0" 
          max="100" 
          [value]="micLevel()"
          (input)="onMicLevelChange($event)"
        />
        <div class="volume-value">
          <span>0%</span>
          <span>{{ micLevel() }}%</span>
          <span>100%</span>
        </div>
      </div>
      
      <button class="control-button control-button-leave" (click)="leaveRoom.emit()">
        <span class="button-icon">🚪</span>
        <span class="button-text">{{ 'room.leaveRoom' | translate }}</span>
      </button>
    </div>
  `
})
export class RoomControlsComponent {
  isMuted = input.required<boolean>();
  volume = input.required<number>();
  micLevel = input.required<number>();

  toggleMute = output<void>();
  volumeChange = output<number>();
  micLevelChange = output<number>();
  leaveRoom = output<void>();

  onVolumeChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.volumeChange.emit(Number(target.value));
  }

  onMicLevelChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.micLevelChange.emit(Number(target.value));
  }
}
