export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatAttachment {
  type: 'pdf' | 'image';
  fileName: string;
  mimeType: string;
  data: string; // base64-encoded
}
