    export class ClientData {
  constructor(
    public readonly remoteJid: string,
    public readonly pushName: string,
    public readonly conversationMsg: string,
    public readonly fromMe: boolean,
    public readonly messageType: string
  ) {}
}