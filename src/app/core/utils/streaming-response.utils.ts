export interface StreamingResponseText {
  text: string;
  isComplete: boolean;
}

const RESPONSE_KEY = '"response"';

const isHexDigit = (char: string): boolean => {
  return /[0-9a-fA-F]/.test(char);
};

const parseResponseString = (jsonText: string, startIndex: number): StreamingResponseText => {
  let result = '';
  let escaping = false;

  for (let i = startIndex; i < jsonText.length; i += 1) {
    const char = jsonText[i];

    if (escaping) {
      if (char === 'u') {
        if (i + 4 >= jsonText.length) {
          return { text: result, isComplete: false };
        }
        const hex = jsonText.slice(i + 1, i + 5);
        if (hex.length === 4 && hex.split('').every(isHexDigit)) {
          result += String.fromCharCode(Number.parseInt(hex, 16));
          i += 4;
        } else {
          result += char;
        }
      } else {
        switch (char) {
          case 'n':
            result += '\n';
            break;
          case 'r':
            result += '\r';
            break;
          case 't':
            result += '\t';
            break;
          case '"':
            result += '"';
            break;
          case '\\':
            result += '\\';
            break;
          case '/':
            result += '/';
            break;
          default:
            result += char;
            break;
        }
      }
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (char === '"') {
      return { text: result, isComplete: true };
    }

    result += char;
  }

  return { text: result, isComplete: false };
};

export const extractStreamingResponseText = (jsonText: string): StreamingResponseText | null => {
  const keyIndex = jsonText.indexOf(RESPONSE_KEY);
  if (keyIndex === -1) {
    return null;
  }

  let cursor = keyIndex + RESPONSE_KEY.length;
  while (cursor < jsonText.length && jsonText[cursor] !== ':') {
    cursor += 1;
  }
  if (cursor >= jsonText.length) {
    return null;
  }

  cursor += 1;
  while (cursor < jsonText.length && /\s/.test(jsonText[cursor])) {
    cursor += 1;
  }
  if (cursor >= jsonText.length || jsonText[cursor] !== '"') {
    return null;
  }

  return parseResponseString(jsonText, cursor + 1);
};
