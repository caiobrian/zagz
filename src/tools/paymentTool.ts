import { purchasesQueries } from '../db/queries/purchases.js';

// ──────────────────────────────────────────────
// get_payment_credentials
// ──────────────────────────────────────────────
export const getPaymentCredentialsTool = {
  name: 'get_payment_credentials',
  description:
    'Retorna os dados do cartão de crédito do usuário para preencher formulários de pagamento. ' +
    'Use SOMENTE no momento de preencher o checkout. NUNCA exiba esses dados nas mensagens ao usuário.',
  parameters: {
    type: 'OBJECT',
    properties: {},
    required: [],
  },
  execute(): string {
    const number = process.env.CARD_NUMBER;
    const holder = process.env.CARD_HOLDER_NAME;
    const month = process.env.CARD_EXPIRY_MONTH;
    const year = process.env.CARD_EXPIRY_YEAR;
    const cvv = process.env.CARD_CVV;
    const cpf = process.env.CARD_BILLING_CPF;
    const zip = process.env.CARD_BILLING_ZIP;
    const address = process.env.CARD_BILLING_ADDRESS;
    const city = process.env.CARD_BILLING_CITY;
    const state = process.env.CARD_BILLING_STATE;

    if (!number || !holder || !month || !year || !cvv) {
      return 'Erro: dados do cartão não configurados. Configure as variáveis CARD_NUMBER, CARD_HOLDER_NAME, CARD_EXPIRY_MONTH, CARD_EXPIRY_YEAR e CARD_CVV no arquivo .env.';
    }

    return JSON.stringify({
      number,
      holder_name: holder,
      expiry_month: month,
      expiry_year: year,
      cvv,
      cpf: cpf ?? '',
      billing_zip: zip ?? '',
      billing_address: address ?? '',
      billing_city: city ?? '',
      billing_state: state ?? '',
    });
  },
};

// ──────────────────────────────────────────────
// initiate_purchase
// ──────────────────────────────────────────────
export const initiatePurchaseTool = {
  name: 'initiate_purchase',
  description:
    'Inicia um fluxo de compra e aguarda confirmação do usuário. ' +
    'Chame esta ferramenta após identificar o produto e o preço no site. ' +
    'Ela salva a compra como pendente e retorna uma mensagem de confirmação para enviar ao usuário.',
  parameters: {
    type: 'OBJECT',
    properties: {
      session_id: { type: 'STRING', description: 'ID da sessão atual' },
      product_name: { type: 'STRING', description: 'Nome do produto a ser comprado' },
      product_url: { type: 'STRING', description: 'URL da página do produto ou checkout' },
      estimated_price: { type: 'STRING', description: 'Preço estimado (ex: "R$ 120,00")' },
      store: { type: 'STRING', description: 'Nome da loja ou site' },
    },
    required: ['session_id', 'product_name'],
  },
  execute(args: {
    session_id: string;
    product_name: string;
    product_url?: string;
    estimated_price?: string;
    store?: string;
  }): string {
    const id = purchasesQueries.create(args);

    const lines = [
      `🛒 *Confirmar compra #${id}*`,
      ``,
      `Produto: ${args.product_name}`,
      args.store ? `Loja: ${args.store}` : null,
      args.estimated_price ? `Preço: ${args.estimated_price}` : null,
      args.product_url ? `Link: ${args.product_url}` : null,
      ``,
      `Responda *sim* para confirmar ou *não* para cancelar.`,
    ].filter(Boolean);

    return JSON.stringify({ purchase_id: id, confirmation_message: lines.join('\n') });
  },
};

// ──────────────────────────────────────────────
// confirm_purchase
// ──────────────────────────────────────────────
export const confirmPurchaseTool = {
  name: 'confirm_purchase',
  description:
    'Marca uma compra pendente como confirmada pelo usuário. ' +
    'Chame após o usuário responder "sim". Depois prossiga para preencher o checkout.',
  parameters: {
    type: 'OBJECT',
    properties: {
      purchase_id: { type: 'NUMBER', description: 'ID da compra retornado por initiate_purchase' },
    },
    required: ['purchase_id'],
  },
  execute(args: { purchase_id: number }): string {
    const purchase = purchasesQueries.getById(args.purchase_id);
    if (!purchase) return `Compra #${args.purchase_id} não encontrada.`;
    if (purchase.status !== 'pending') return `Compra #${args.purchase_id} está com status "${purchase.status}", não pode ser confirmada.`;

    purchasesQueries.updateStatus(args.purchase_id, 'confirmed');
    return `Compra #${args.purchase_id} confirmada. Prossiga para o checkout.`;
  },
};

// ──────────────────────────────────────────────
// complete_purchase
// ──────────────────────────────────────────────
export const completePurchaseTool = {
  name: 'complete_purchase',
  description:
    'Registra o resultado final de uma compra (sucesso ou falha). ' +
    'Chame após concluir ou falhar o checkout.',
  parameters: {
    type: 'OBJECT',
    properties: {
      purchase_id: { type: 'NUMBER', description: 'ID da compra' },
      success: { type: 'BOOLEAN', description: 'true se a compra foi concluída, false se falhou' },
      actual_price: { type: 'STRING', description: 'Preço cobrado (se disponível)' },
      notes: { type: 'STRING', description: 'Observações (ex: número do pedido, mensagem de erro)' },
    },
    required: ['purchase_id', 'success'],
  },
  execute(args: { purchase_id: number; success: boolean; actual_price?: string; notes?: string }): string {
    const purchase = purchasesQueries.getById(args.purchase_id);
    if (!purchase) return `Compra #${args.purchase_id} não encontrada.`;

    const status = args.success ? 'completed' : 'failed';
    purchasesQueries.updateStatus(args.purchase_id, status, {
      actual_price: args.actual_price,
      notes: args.notes,
    });

    if (args.success) {
      return `✅ Compra #${args.purchase_id} concluída!${args.actual_price ? ` Valor: ${args.actual_price}.` : ''}${args.notes ? ` ${args.notes}` : ''}`;
    } else {
      return `❌ Compra #${args.purchase_id} falhou.${args.notes ? ` Motivo: ${args.notes}` : ''}`;
    }
  },
};

// ──────────────────────────────────────────────
// cancel_purchase
// ──────────────────────────────────────────────
export const cancelPurchaseTool = {
  name: 'cancel_purchase',
  description: 'Cancela uma compra pendente ou confirmada.',
  parameters: {
    type: 'OBJECT',
    properties: {
      purchase_id: { type: 'NUMBER', description: 'ID da compra a cancelar' },
    },
    required: ['purchase_id'],
  },
  execute(args: { purchase_id: number }): string {
    const purchase = purchasesQueries.getById(args.purchase_id);
    if (!purchase) return `Compra #${args.purchase_id} não encontrada.`;
    if (!['pending', 'confirmed'].includes(purchase.status)) {
      return `Compra #${args.purchase_id} não pode ser cancelada (status: ${purchase.status}).`;
    }

    purchasesQueries.updateStatus(args.purchase_id, 'cancelled');
    return `Compra #${args.purchase_id} cancelada.`;
  },
};
