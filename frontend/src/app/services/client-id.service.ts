import { Injectable } from '@angular/core';

const CLIENT_ID_KEY = 'chatroom_client_id';

@Injectable({
  providedIn: 'root'
})
export class ClientIdService {
  getClientId(): string {
    let clientId = localStorage.getItem(CLIENT_ID_KEY);
    
    if (!clientId) {
      clientId = this.generateClientId();
      localStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    
    return clientId;
  }

  private generateClientId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
