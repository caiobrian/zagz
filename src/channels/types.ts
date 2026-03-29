export interface MessageChannel {
  name: string;
  start(): Promise<void>;
  sendMessage(text: string): Promise<void>;
  onMessage(handler: (text: string) => Promise<string>): void;
}
