import { ChatCompletionMessageToolCall } from "openai/resources/chat";

export interface IntentionItem {
    name: string;
    tipo: 'flujo' | 'seguimiento' | 'notificacion';
    frase: string; // frase representativa o pregunta que activa esta intención
    umbral: number;
}
export interface Decision {
    type: string;
    name: string;
    tipo: string;
}
export interface ToolHandler {
    name: string;
    handle(args: any): Promise<string>;
}

export interface proccessInput {
    input: string,
    userId: string,
    apikeyOpenAi: string,
    sessionId: string,
    server_url: string,
    apikey: string,
    instanceName: string,
    remoteJid: string,
}

export interface inputWorkflow {
    nombre_flujo: { type: string, description: string }
    detalles: { type: string, description: string }
}

export interface openAIToolDetection {
    input: inputWorkflow,
    sessionId: string,
    userId: string,

}

export interface ChoiceWithToolCall {
    message: {
        content?: string;
        tool_calls?: ChatCompletionMessageToolCall[];
    };
}

export interface ChoiceWithToolCall {
    message: {
        content?: string;
        tool_calls?: ChatCompletionMessageToolCall[];
    };
}
export interface OpenAIDetectionResult {
    // choice: ChoiceWithToolCall | null;
    // toolCall: ChatCompletionMessageToolCall | null;
    content: string | null;
}
