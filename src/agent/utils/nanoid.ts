const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const size = 12;

export const nanoid = (): string => {
  let id = '';
  for (let i = 0; i < size; i += 1) {
    const index = Math.floor(Math.random() * alphabet.length);
    id += alphabet.charAt(index);
  }
  return id;
};
