import { format } from 'date-fns';

export function dateToString(date: Date) {
  return format(date, 'yyyy/MM/dd HH:mm:ss');
}

export function isHTTPURL(string: string) {
  let url;

  try {
    url = new URL(string);
  } catch (e) {
    return false;
  }

  return url.protocol == 'http:' || url.protocol == 'https:';
}

export function round(value: number, digit: number) {
  return Math.round(value * 10 ** digit) / 10 ** digit;
}

export function findStringIgnoreCase(string: string | null | undefined, search: string) {
  if (string == undefined) {
    return false;
  }

  return string.toLowerCase().includes(search.toLowerCase());
}

export function arrayRemove(array: any[], index: number) {
  return array.splice(index, 1);
}

export function arrayInsertBefore(array: any[], item: any, reference: number) {
  if (reference < 0) {
    reference = array.length + reference + 1;
  }

  return array.splice(reference, 0, item);
}

export function toDateString(date: Date) {
  return `${padZero(date.getFullYear(), 4)}-${padZero(date.getMonth() + 1, 2)}-${padZero(date.getDate(), 2)}`;
}

export function padZero(number: number, digits: number) {
  return number.toString().padStart(digits, '0');
}