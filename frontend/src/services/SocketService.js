import io from 'socket.io-client';
import { API_URL } from '../api';

let socket = null;
let socketToken = null;

export const connectSocket = (token) => {
  if (socket && socketToken === token) return socket;
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
    socketToken = null;
  }

  socketToken = token;
  socket = io(API_URL, { auth: { token } });

  socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected");
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
    socketToken = null;
  }
};
