export const APP_WELCOME_TITLE = '欢迎使用博雅背诵排号';

export interface CurrentRoom {
  id: string;
  className: string;
  subject: string;
  roomCode: string;
  pin: string;
}

export const defaultRoom: CurrentRoom = {
  id: 'default-recitation-room',
  className: '博雅中学初二8班',
  subject: '语文',
  roomCode: '',
  pin: ''
};

export const currentRoom = defaultRoom;

export function formatRoomTitle(room: Pick<CurrentRoom, 'className' | 'subject'>): string {
  return `${room.className} · ${room.subject}`;
}
