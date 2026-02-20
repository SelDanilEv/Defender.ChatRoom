import { RoomControlsComponent } from './room-controls.component';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

describe('RoomControlsComponent', () => {
  let component: RoomControlsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomControlsComponent, TranslateModule.forRoot()],
    }).compileComponents();

    const fixture = TestBed.createComponent(RoomControlsComponent);
    fixture.componentRef.setInput('isMuted', false);
    fixture.componentRef.setInput('volume', 50);
    fixture.componentRef.setInput('micLevel', 50);
    fixture.detectChanges();
    component = fixture.componentInstance;
  });

  it('emits parsed volume number from slider event', () => {
    const emitSpy = spyOn(component.volumeChange, 'emit');
    const event = { target: { value: '42' } } as unknown as Event;

    component.onVolumeChange(event);

    expect(emitSpy).toHaveBeenCalledWith(42);
  });

  it('emits parsed mic level number from slider event', () => {
    const emitSpy = spyOn(component.micLevelChange, 'emit');
    const event = { target: { value: '77' } } as unknown as Event;

    component.onMicLevelChange(event);

    expect(emitSpy).toHaveBeenCalledWith(77);
  });
});
