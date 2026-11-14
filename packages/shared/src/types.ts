export type Device = { id: string; name: string; type: string };
export type ClientMessage = { type: 'signal'; to: string; data: unknown };
export type ServerMessage = { type: 'hello'; device: Device } | { type: 'peers'; peers: Device[] } | { type: 'signal'; from: string; data: unknown } | { type: 'error'; message: string };
