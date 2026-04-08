export type PaymentMethod =
  | 'WOMPI'
  | 'BANCOLOMBIA'
  | 'NEQUI'
  | 'BINANCE'
  | 'OTRO';

export type ReceiptAnalysis = {
  isPaymentReceipt: boolean;
  confidenceScore: number;       // 0-100
  method: PaymentMethod;
  amount: number | null;
  currency: 'COP' | 'USD' | null;
  reference: string | null;      // número de transacción del comprobante
  date: string | null;           // ISO 8601
  payerName: string | null;
  recipientAccount: string | null; // cuenta, número o email destino
  rawText: string;               // contenido original para auditoría
};

export type ValidationResult =
  | { isValid: true }
  | { isValid: false; reason: string };

export type ProcessResult = {
  success: boolean;
  message: string;
  clientUserId?: string;
  newDueDate?: string;
  alreadyProcessed?: boolean;
};
