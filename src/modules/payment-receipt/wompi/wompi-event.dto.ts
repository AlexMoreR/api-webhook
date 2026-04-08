/**
 * Estructura del evento que Wompi envía en el webhook.
 * Documentación: https://docs.wompi.co/docs/colombia/webhooks
 */
export interface WompiTransaction {
  id: string;
  status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | string;
  reference: string;
  amount_in_cents: number;
  currency: string;       // "COP" | "USD"
  payment_method_type: string;
  customer_email?: string;
  customer_data?: {
    phone_number?: string;
    full_name?: string;
    legal_id?: string;
    legal_id_type?: string;
  };
  created_at?: string;
  finalized_at?: string;
}

export interface WompiEventSignature {
  checksum: string;
  properties: string[];
}

export interface WompiEventDto {
  event: string;           // "transaction.updated"
  data: {
    transaction: WompiTransaction;
  };
  environment: 'production' | 'sandbox' | string;
  timestamp: number;
  signature: WompiEventSignature;
}
