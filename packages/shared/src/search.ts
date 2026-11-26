export function foldSearchText(value: string): string {
  return value.trim().toLocaleLowerCase('vi').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}
