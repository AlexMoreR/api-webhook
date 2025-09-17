import { MessageTypeHandlerService } from "../services/message-type-handler/message-type-handler.service";

    export class ClientData {
      private extractedContent: string   

  constructor(
    public readonly remoteJid: string,
    public readonly pushName: string,
    public readonly conversationMsg: string,
    public readonly fromMe: boolean,
    public readonly messageType: string,
    public readonly mediaUrl:string,
    public readonly mediaType:string,
    private readonly messageTypeHandlerService: MessageTypeHandlerService,
  ) {
    this.setMessageType()
  }
  private setMessageType(){

  }

  public async getExtractedContent(llmClientApiKey){
    if(this.extractedContent != ""){
      return this.extractedContent
    }
    
    const extractedContent = await this.messageTypeHandlerService.extractContentByType(this.messageType,llmClientApiKey,this.conversationMsg,this.mediaUrl,this.mediaType);
    const incomingMessage = extractedContent.toString().trim().toLowerCase();

  }
  private async getConversationImageMessage(){}
  private async getConversationAudioMessage(){}
}