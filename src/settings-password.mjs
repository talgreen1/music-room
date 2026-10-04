// Firebase requires at least six characters. The Settings UI may accept a PIN;
// this public prefix maps it to a Firebase credential without storing the PIN
// in the frontend. The prefix does not add password entropy.
export function settingsCredential(password) {
  return `music-room-settings:v1:${password}`;
}
