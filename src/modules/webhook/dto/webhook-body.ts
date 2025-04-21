export class WebhookBodyDto {
    event: string;
    instance: string;
    apikey: string;
    server_url: string;
    date_time: string;
    destination: string;
    sender: string;
    data: WebhookDataDto;
  }
  
  export class WebhookDataDto {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName: string;
    status: string;
    message?: {
      conversation?: string;
      mediaUrl?: string;
      imageMessage?: {
        url: string;
        mimetype: string;
        fileSha256: string;
        fileLength: string;
        height: number;
        width: number;
        mediaKey: string;
        fileEncSha256: string;
        directPath: string;
        mediaKeyTimestamp: string;
        jpegThumbnail: string;
        contextInfo: {
          disappearingMode: {
            initiator: string;
          };
        };
        viewOnce: boolean;
      };
      messageContextInfo?: any;
      base64?: string;
    };
    contextInfo?: any;
    messageType: string;
    messageTimestamp: number;
    instanceId: string;
    source: string;
  }
  