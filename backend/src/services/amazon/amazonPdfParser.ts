/**
 * Amazon PDF / photo parser — Claude vision adapter + sanitization.
 *
 * Extracted from `amazonReceiptService.ts` (Sprint 5 / TD-010). Owns the
 * round-trip to Claude for structured extraction and the downstream
 * sanitization/cross-reference passes. Pure helpers are exported as free
 * functions so they can be unit-tested without stubbing Anthropic.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SupportedUploadMimeType } from '../../middleware/pdfUpload';
import { ValidationError } from '../../errors';
import { childLogger } from '../../utils/logger';

const log = childLogger('amazonPdfParser');
import {
  PDF_PARSING_SYSTEM_PROMPT,
  PDF_EXTRACTION_TOOL,
} from '../amazonReceiptPrompt';
import {
  pdfExtractionOutputSchema,
  parsedAmazonOrderSchema,
  parsedAmazonChargeSchema,
  type PdfExtractionOutput,
} from '../../validators/amazonReceiptValidators';
import type {
  ParsedAmazonOrder,
  ParsedAmazonCharge,
} from '../../shared/types';

/** A file uploaded for receipt parsing (PDF or image). */
export interface ReceiptUploadFile {
  buffer: Buffer;
  mimeType: SupportedUploadMimeType;
}

export interface ParseFileResult {
  parsed: PdfExtractionOutput;
  inputTokens: number;
  outputTokens: number;
}

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8192;

export class AmazonPdfParser {
  constructor(private readonly client: Anthropic) {}

  /**
   * Send a PDF (or image) buffer to Claude vision and return the validated
   * extraction. SEC-002: file is sent as a base64 content block, never
   * interpolated into the prompt.
   */
  async parseFile(
    fileBuffer: Buffer,
    mimeType: SupportedUploadMimeType,
  ): Promise<ParseFileResult> {
    const base64Data = fileBuffer.toString('base64');
    const isImage = mimeType.startsWith('image/');

    const fileContentBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam = isImage
      ? {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mimeType as Exclude<SupportedUploadMimeType, 'application/pdf'>,
            data: base64Data,
          },
        }
      : {
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: base64Data,
          },
        };

    const promptText = isImage
      ? 'Extract all order/charge data from this Amazon receipt photo using the extract_amazon_data tool. ' +
        'The image may have perspective distortion, shadows, or partial content — extract what you can.'
      : 'Extract all order/charge data from this Amazon PDF using the extract_amazon_data tool.';

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: PDF_PARSING_SYSTEM_PROMPT,
      tools: [PDF_EXTRACTION_TOOL],
      messages: [
        {
          role: 'user',
          content: [
            fileContentBlock,
            { type: 'text', text: promptText },
          ],
        },
      ],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === 'extract_amazon_data',
    );

    if (!toolUse) {
      throw new ValidationError(
        "This doesn't look like an Amazon orders or transactions page. " +
          'Please upload a PDF or photo from your Amazon order history or payment transactions.',
      );
    }

    const parseResult = pdfExtractionOutputSchema.safeParse(toolUse.input);
    if (parseResult.success) {
      return {
        parsed: parseResult.data,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    }

    log.warn(
      { issues: parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) },
      'Claude output failed Zod validation',
    );
    const salvaged = salvagePartialOutput(toolUse.input as Record<string, unknown>);
    if (!salvaged) {
      throw new ValidationError(
        'Failed to extract valid data from the PDF. The format may not be supported.',
      );
    }
    return {
      parsed: salvaged,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

/**
 * Defense-in-depth: when the full Zod schema rejects Claude's output, try to
 * salvage per-row by validating each order/charge individually. Returns null
 * if nothing is salvageable (caller should surface ValidationError).
 */
export function salvagePartialOutput(
  raw: Record<string, unknown>,
): PdfExtractionOutput | null {
  const pdfType = raw.pdfType === 'orders' || raw.pdfType === 'transactions'
    ? raw.pdfType
    : null;
  if (!pdfType) return null;

  const result: PdfExtractionOutput = { pdfType };

  if (pdfType === 'orders' && Array.isArray(raw.orders)) {
    const validOrders: ParsedAmazonOrder[] = [];
    for (const order of raw.orders) {
      const parsed = parsedAmazonOrderSchema.safeParse(order);
      if (parsed.success) {
        validOrders.push(parsed.data);
      } else {
        log.warn(
          { issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) },
          'skipping invalid order',
        );
      }
    }
    if (validOrders.length === 0) return null;
    result.orders = validOrders;
  }

  if (pdfType === 'transactions' && Array.isArray(raw.charges)) {
    const validCharges: ParsedAmazonCharge[] = [];
    for (const charge of raw.charges) {
      const parsed = parsedAmazonChargeSchema.safeParse(charge);
      if (parsed.success) {
        validCharges.push(parsed.data);
      } else {
        log.warn(
          { issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) },
          'skipping invalid charge',
        );
      }
    }
    if (validCharges.length === 0) return null;
    result.charges = validCharges;
  }

  return result;
}

/**
 * SEC-006: strip full card numbers, keeping only the last 4 digits. Call
 * immediately after parsing, before logging or persistence.
 */
export function sanitizeCharges(
  charges: ParsedAmazonCharge[],
): ParsedAmazonCharge[] {
  return charges.map(charge => ({
    ...charge,
    cardLastFour: charge.cardLastFour.slice(-4).replace(/[^0-9]/g, '').slice(-4),
  }));
}

/**
 * When both PDF types are provided, overwrite each order's `orderDate` with
 * the matching charge's `chargeDate` — bank posting dates are tighter than
 * order dates, so the matcher hits tier-1 more often. Mutates `orders` in
 * place to mirror the original service behavior.
 */
export function crossReference(
  orders: ParsedAmazonOrder[],
  charges: ParsedAmazonCharge[],
): void {
  const chargesByOrder = new Map<string, ParsedAmazonCharge>();
  for (const charge of charges) {
    chargesByOrder.set(charge.orderNumber, charge);
  }
  for (const order of orders) {
    const charge = chargesByOrder.get(order.orderNumber);
    if (charge) {
      order.orderDate = charge.chargeDate;
    }
  }
}
